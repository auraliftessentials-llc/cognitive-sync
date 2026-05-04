/**
 * Race telemetry — the brain's collective memory.
 *
 * Tracks every race's winner, all peer latencies, and aggregates per-provider
 * win rate / median latency. Persists to localStorage. Cross-tab synced via
 * BroadcastChannel. Exposes:
 *
 *   - recordRace(result)        : called by routeWithRace after every race
 *   - getStats()                : provider win-rate + p50/p95 latency
 *   - getRecent(n)              : last N races for the live telemetry panel
 *   - getPreferredProvider()    : winner of the last 20 races (used to bias)
 *   - setUserPinnedProvider(id) : user manually locks a preferred provider
 *   - getUserPinnedProvider()   : current pin
 *   - subscribe(cb)             : live-updates for the BrainStatusBar panel
 *
 * Plus an LRU prompt cache (`brainCache`) so identical prompts within 5 min
 * return instantly with zero network calls — Meta's chat surfaces don't
 * even attempt this.
 */

const LS_RACES = "merkabah:race-log";
const LS_PINNED = "merkabah:race-pinned-provider";
const MAX_RACES = 200;

export type RaceTelemetryEntry = {
  ts: number;
  prompt_preview: string;
  winner: { competitor: string; provider: string; model: string; latency_ms: number } | null;
  trail: { competitor: string; latency_ms: number; ok: boolean; error?: string }[];
  intent?: string;
};

type Subscriber = (log: RaceTelemetryEntry[]) => void;

let log: RaceTelemetryEntry[] = [];
let loaded = false;
const subscribers = new Set<Subscriber>();

const channel: BroadcastChannel | null =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("merkabah-race-telemetry")
    : null;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(LS_RACES);
    if (raw) log = JSON.parse(raw);
  } catch { /* corrupt — ignore */ }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_RACES, JSON.stringify(log.slice(-MAX_RACES)));
  } catch { /* quota */ }
}

function notify() {
  for (const s of subscribers) {
    try { s(log); } catch { /* */ }
  }
}

if (channel) {
  channel.onmessage = (e) => {
    if (e.data?.type === "entry") {
      load();
      log.push(e.data.entry);
      if (log.length > MAX_RACES) log = log.slice(-MAX_RACES);
      notify();
    }
  };
}

export function recordRace(entry: RaceTelemetryEntry) {
  load();
  log.push(entry);
  if (log.length > MAX_RACES) log = log.slice(-MAX_RACES);
  persist();
  notify();
  channel?.postMessage({ type: "entry", entry });
}

export function getRecent(n = 20): RaceTelemetryEntry[] {
  load();
  return log.slice(-n).reverse();
}

export type ProviderStat = {
  provider: string;
  competitor: string;
  wins: number;
  attempts: number;
  win_rate: number;
  p50_ms: number;
  p95_ms: number;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function getStats(): ProviderStat[] {
  load();
  const map = new Map<string, { wins: number; latencies: number[]; provider: string }>();
  for (const r of log) {
    for (const t of r.trail) {
      const key = t.competitor;
      const m = map.get(key) ?? { wins: 0, latencies: [], provider: r.winner?.provider ?? "" };
      if (t.ok) m.latencies.push(t.latency_ms);
      if (r.winner?.competitor === key) m.wins += 1;
      map.set(key, m);
    }
  }
  const out: ProviderStat[] = [];
  for (const [competitor, m] of map) {
    const sorted = [...m.latencies].sort((a, b) => a - b);
    out.push({
      competitor,
      provider: m.provider || competitor,
      wins: m.wins,
      attempts: m.latencies.length || m.wins,
      win_rate: m.latencies.length ? m.wins / Math.max(m.latencies.length, 1) : 0,
      p50_ms: percentile(sorted, 50),
      p95_ms: percentile(sorted, 95),
    });
  }
  return out.sort((a, b) => b.wins - a.wins);
}

/** Most-frequent winner over the last `n` races. Used to bias the next race. */
export function getPreferredProvider(n = 20): string | null {
  load();
  const recent = log.slice(-n);
  const counts = new Map<string, number>();
  for (const r of recent) {
    if (!r.winner) continue;
    counts.set(r.winner.competitor, (counts.get(r.winner.competitor) ?? 0) + 1);
  }
  let top: string | null = null;
  let max = 0;
  for (const [k, v] of counts) {
    if (v > max) { max = v; top = k; }
  }
  return top;
}

export function setUserPinnedProvider(competitor: string | null) {
  if (typeof window === "undefined") return;
  if (competitor) window.localStorage.setItem(LS_PINNED, competitor);
  else window.localStorage.removeItem(LS_PINNED);
  notify();
}

export function getUserPinnedProvider(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(LS_PINNED); } catch { return null; }
}

export function subscribe(cb: Subscriber): () => void {
  load();
  subscribers.add(cb);
  cb(log);
  return () => subscribers.delete(cb);
}

export function clearTelemetry() {
  log = [];
  persist();
  notify();
}

// ─── LRU Prompt Cache ─────────────────────────────────────────────────
// Identical (system + history-tail + prompt) calls within 5 min skip the
// network entirely. Massive for repeated commands ("status", "next", etc.).

const CACHE_MAX = 50;
const CACHE_TTL = 5 * 60_000;

type CacheEntry = { ts: number; output: string; provider: string; model: string };
const cache = new Map<string, CacheEntry>();

export function cacheKey(prompt: string, history: { role: string; content: string }[]): string {
  const tail = history.slice(-4).map((m) => `${m.role[0]}:${m.content.slice(0, 80)}`).join("|");
  return `${tail}::${prompt.trim().toLowerCase().slice(0, 200)}`;
}

export const brainCache = {
  get(key: string): CacheEntry | null {
    const e = cache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    // Refresh LRU order
    cache.delete(key);
    cache.set(key, e);
    return e;
  },
  set(key: string, entry: Omit<CacheEntry, "ts">) {
    cache.set(key, { ...entry, ts: Date.now() });
    while (cache.size > CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
  },
  size: () => cache.size,
  clear: () => cache.clear(),
};
