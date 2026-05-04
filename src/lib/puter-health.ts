/**
 * Puter health + connectivity guard.
 *
 * Puter peers are only useful when:
 *   1. Browser is online (navigator.onLine)
 *   2. Puter SDK loaded successfully
 *   3. Recent calls haven't been failing (rolling failure window)
 *
 * If any check fails, routeWithRace skips Puter entirely and goes
 * server-only — no wasted ms waiting for a doomed peer.
 *
 * Cross-tab synced via BroadcastChannel so a failure in one tab
 * disables Puter peers in every tab instantly.
 */

const FAIL_WINDOW_MS = 60_000;
const FAIL_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

type FailureRecord = { ts: number; reason: string };

const failures: FailureRecord[] = [];
let cooldownUntil = 0;
let lastSdkLoadFailedAt = 0;

const channel: BroadcastChannel | null =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("merkabah-puter-health")
    : null;

if (channel) {
  channel.onmessage = (e) => {
    if (e.data?.type === "fail") {
      failures.push({ ts: e.data.ts, reason: `peer-tab:${e.data.reason}` });
      if (e.data.cooldownUntil > cooldownUntil) cooldownUntil = e.data.cooldownUntil;
    }
    if (e.data?.type === "sdk-fail") lastSdkLoadFailedAt = e.data.ts;
  };
}

function pruneFailures() {
  const cutoff = Date.now() - FAIL_WINDOW_MS;
  while (failures.length && failures[0].ts < cutoff) failures.shift();
}

export function recordPuterFailure(reason: string) {
  const now = Date.now();
  failures.push({ ts: now, reason });
  pruneFailures();
  if (failures.length >= FAIL_THRESHOLD) {
    cooldownUntil = now + COOLDOWN_MS;
  }
  channel?.postMessage({ type: "fail", ts: now, reason, cooldownUntil });
}

export function recordPuterSuccess() {
  failures.length = 0;
  cooldownUntil = 0;
}

export function recordPuterSdkLoadFailure() {
  lastSdkLoadFailedAt = Date.now();
  channel?.postMessage({ type: "sdk-fail", ts: lastSdkLoadFailedAt });
}

export type PuterAvailability = {
  available: boolean;
  reason?: "offline" | "cooldown" | "sdk-failed" | "ssr";
  effectiveType?: string;
  cooldownRemainingMs?: number;
};

export function checkPuterAvailability(): PuterAvailability {
  if (typeof window === "undefined") return { available: false, reason: "ssr" };
  if (!navigator.onLine) return { available: false, reason: "offline" };
  pruneFailures();
  const now = Date.now();
  if (cooldownUntil > now) {
    return { available: false, reason: "cooldown", cooldownRemainingMs: cooldownUntil - now };
  }
  // SDK load failed in the last 5 minutes — give it a rest.
  if (lastSdkLoadFailedAt && now - lastSdkLoadFailedAt < 5 * 60_000) {
    return { available: false, reason: "sdk-failed" };
  }
  // Network-aware: skip Puter on very slow connections (saves the user data).
  const conn = (navigator as any).connection;
  if (conn?.effectiveType === "slow-2g" || conn?.saveData === true) {
    return { available: false, reason: "offline", effectiveType: conn.effectiveType };
  }
  return { available: true, effectiveType: conn?.effectiveType };
}
