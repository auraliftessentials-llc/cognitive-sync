/**
 * Local connector-status history — powers trends, daily stats and exports
 * without needing a new table. Stored per-browser, capped at 500 snapshots.
 */
import type { ConnectorState } from "./connector-status.functions";

const KEY = "merkabah.connector.history.v1";
const CAP = 500;

export type Snapshot = {
  at: string;
  ok: number;
  unverified: number;
  failed: number;
  missing: number;
  avgLatency: number | null;
  states: Array<{ id: string; status: ConnectorState["status"]; latency_ms?: number }>;
};

export function summarize(rows: ConnectorState[]): Snapshot {
  const lat = rows.map((r) => r.latency_ms).filter((n): n is number => typeof n === "number");
  return {
    at: new Date().toISOString(),
    ok: rows.filter((r) => r.status === "ok").length,
    unverified: rows.filter((r) => r.status === "unverified").length,
    failed: rows.filter((r) => r.status === "failed").length,
    missing: rows.filter((r) => r.status === "missing").length,
    avgLatency: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
    states: rows.map((r) => ({ id: r.id, status: r.status, latency_ms: r.latency_ms })),
  };
}

export function readHistory(): Snapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot[]) : [];
  } catch {
    return [];
  }
}

export function pushHistory(snap: Snapshot): Snapshot[] {
  if (typeof window === "undefined") return [];
  const next = [...readHistory(), snap].slice(-CAP);
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

export type DayStat = { day: string; checks: number; uptimePct: number; avgLatency: number | null; failures: number };

/** Groups snapshots by UTC day for the daily stats + trend view. */
export function dailyStats(history: Snapshot[], days = 7): DayStat[] {
  const byDay = new Map<string, Snapshot[]>();
  for (const s of history) {
    const day = s.at.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-days)
    .map(([day, snaps]) => {
      const totalLive = snaps.reduce((n, s) => n + s.ok + s.unverified, 0);
      const totalTracked = snaps.reduce((n, s) => n + s.ok + s.unverified + s.failed, 0);
      const lats = snaps.map((s) => s.avgLatency).filter((n): n is number => typeof n === "number");
      return {
        day,
        checks: snaps.length,
        uptimePct: totalTracked ? Math.round((totalLive / totalTracked) * 100) : 0,
        avgLatency: lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null,
        failures: snaps.reduce((n, s) => n + s.failed, 0),
      };
    });
}

export function toCsv(history: Snapshot[]): string {
  const head = "timestamp,ok,unverified,failed,missing,avg_latency_ms";
  const rows = history.map(
    (s) => `${s.at},${s.ok},${s.unverified},${s.failed},${s.missing},${s.avgLatency ?? ""}`,
  );
  return [head, ...rows].join("\n");
}

export function download(filename: string, content: string, mime: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
