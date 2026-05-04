/**
 * Client-side race wrapper v2 — the unified, telemetry-instrumented,
 * offline-resilient, cache-accelerated brain front-door.
 *
 * Layers:
 *   1. brainCache (LRU, 5min TTL, identical-prompt fast path)        ← 0ms
 *   2. routeWithRace (server router vs client Puter peers, parallel) ← 200-1500ms
 *   3. recordRace (telemetry → BroadcastChannel → all tabs)
 *
 * Failsafes:
 *   - Puter offline / SDK failed / cooldown → server-only race
 *   - User pinned a provider → that competitor gets ZERO head start delay
 *   - Network slow-2g / saveData → skip Puter to save user data
 *
 * Used by: CEOVoiceHub, CommandPalette, Console (when raceMode), Chat.
 */
import { commandRoute, type CommandRouterResult } from "./command-router.functions";
import { raceBrains, type RaceCompetitor, type RaceMode } from "./brain-race";
import { checkPuterAvailability, recordPuterFailure, recordPuterSuccess } from "./puter-health";
import {
  brainCache,
  cacheKey,
  getPreferredProvider,
  getUserPinnedProvider,
  recordRace,
} from "./race-telemetry";

export type RoutedRaceResult = {
  ok: boolean;
  source: "server" | "puter" | "cache";
  intent: string;
  provider: string;
  model: string;
  output: string;
  hint?: string;
  cached?: boolean;
  /** Other peers that responded (or failed). For UI debugging only. */
  trail: { competitor: string; latency_ms: number; ok: boolean; error?: string }[];
};

const SYSTEM_VOICE = `You are MERKABAH OS — the Master Operator's autonomous command intelligence. Calm precision. No hedging. Single highest-leverage next move at the end. Markdown sparingly.`;

export type RouteWithRaceArgs = {
  prompt: string;
  history?: { role: "system" | "user" | "assistant"; content: string }[];
  /** Default "race". Use "all" only for debug UIs. */
  mode?: RaceMode;
  /** Bias toward server when healthy. Default 800ms. Set 0 for true race. */
  serverHeadStartMs?: number;
  /** Bypass cache (useful for "regenerate"). */
  noCache?: boolean;
  /** Disable telemetry recording (e.g. internal QA pings). */
  silent?: boolean;
};

export async function routeWithRace(args: RouteWithRaceArgs): Promise<RoutedRaceResult> {
  const {
    prompt,
    history = [],
    mode = "race",
    serverHeadStartMs = 800,
    noCache = false,
    silent = false,
  } = args;

  // ── Layer 1: Cache hit ─────────────────────────────────────────────
  const key = cacheKey(prompt, history);
  if (!noCache) {
    const hit = brainCache.get(key);
    if (hit) {
      return {
        ok: true,
        source: "cache",
        intent: "cache",
        provider: hit.provider,
        model: hit.model,
        output: hit.output,
        cached: true,
        hint: "Cached (≤5 min)",
        trail: [],
      };
    }
  }

  const messages = [
    { role: "system" as const, content: SYSTEM_VOICE },
    ...history.slice(-8),
    { role: "user" as const, content: prompt },
  ];

  // ── Layer 2: Build competitors ────────────────────────────────────
  const puterHealth = checkPuterAvailability();
  const pinned = getUserPinnedProvider();
  const auto = getPreferredProvider();

  // If user pinned a provider, that one gets zero delay; everyone else gets +400ms.
  // Otherwise the auto-preferred provider gets a 200ms head start over the rest.
  const headStart = (label: string): number => {
    if (pinned) return label === pinned ? 0 : 400;
    if (auto && label === auto) return 0;
    if (label === "merkabah-router") return 0;            // server is the safety net
    return serverHeadStartMs;
  };

  const competitors: RaceCompetitor[] = [
    {
      kind: "server",
      label: "merkabah-router",
      call: async (signal): Promise<{ text: string; model: string; provider: string }> => {
        const delay = headStart("merkabah-router");
        if (delay > 0) await wait(delay, signal);
        const r: CommandRouterResult = await commandRoute({
          data: { prompt, history: history as any },
        });
        if (!r.ok) throw new Error(r.output || "router failed");
        // Encode intent + hint into model field for downstream recovery.
        return {
          text: r.output,
          model: `${r.model}|${r.intent}|${r.hint ?? ""}`,
          provider: r.provider || "merkabah",
        };
      },
    },
  ];

  if (puterHealth.available) {
    competitors.push({
      kind: "server", // wrapped as server-style competitor with custom delay
      label: "puter-delayed",
      call: async (signal): Promise<{ text: string; model: string; provider: string }> => {
        const delay = headStart("puter-delayed");
        if (delay > 0) await wait(delay, signal);
        try {
          const { callPuter } = await import("./puter-brain");
          const p = await callPuter({ messages });
          recordPuterSuccess();
          return { text: p.text, model: p.model, provider: "puter" };
        } catch (e: any) {
          recordPuterFailure(e?.message ?? "puter call failed");
          throw e;
        }
      },
    });
  }

  // ── Run the race ──────────────────────────────────────────────────
  const race = await raceBrains(messages as any, competitors, mode);
  const trail = race.entries.map((e) => ({
    competitor: e.competitor,
    latency_ms: e.latency_ms,
    ok: !!e.text && !e.error,
    error: e.error,
  }));

  if (!race.winner) {
    const failsafeMsg = !puterHealth.available && puterHealth.reason === "offline"
      ? "You're offline and the server brain failed. Check your connection."
      : "Every brain peer failed. Try again in a moment.";
    const result: RoutedRaceResult = {
      ok: false,
      source: "server",
      intent: "chat",
      provider: "",
      model: "",
      output: failsafeMsg,
      trail,
    };
    if (!silent) {
      recordRace({
        ts: Date.now(),
        prompt_preview: prompt.slice(0, 120),
        winner: null,
        trail,
      });
    }
    return result;
  }

  // Recover intent/hint from server-encoded model field.
  let intent = "chat";
  let hint: string | undefined;
  let model = race.winner.model ?? "";
  const isPuter = race.winner.competitor === "puter-delayed" || race.winner.source === "puter";
  if (!isPuter && model.includes("|")) {
    const [m, i, h] = model.split("|");
    model = m;
    intent = i || intent;
    hint = h || undefined;
  } else if (isPuter) {
    intent = "chat";
    hint = puterHealth.effectiveType
      ? `Puter peer won (${puterHealth.effectiveType})`
      : "Puter peer won";
  }

  const provider = race.winner.provider ?? (isPuter ? "puter" : "");
  const result: RoutedRaceResult = {
    ok: true,
    source: isPuter ? "puter" : "server",
    intent,
    provider,
    model,
    output: race.winner.text ?? "",
    hint,
    trail,
  };

  // ── Cache + telemetry ─────────────────────────────────────────────
  if (!noCache && result.output) {
    brainCache.set(key, { output: result.output, provider, model });
  }
  if (!silent) {
    recordRace({
      ts: Date.now(),
      prompt_preview: prompt.slice(0, 120),
      winner: {
        competitor: race.winner.competitor,
        provider,
        model,
        latency_ms: race.winner.latency_ms,
      },
      trail,
      intent,
    });
  }

  return result;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });
}
