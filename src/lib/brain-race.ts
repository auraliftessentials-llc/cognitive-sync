/**
 * Brain Race — peer-mode multi-provider orchestration.
 *
 * Unlike brain.server.ts (sequential failover, your-keys-first), this runs
 * server providers + Puter in PARALLEL and returns whichever responds first
 * with usable content. Every brain is a peer; no preference, just speed.
 *
 * Three modes:
 *   - race:        first valid response wins, others aborted (lowest latency)
 *   - quorum:      wait for N responses, return the most-agreed answer
 *   - all:         wait for everyone, return full array (for debugging/UI)
 *
 * Use this when "always works + always fast" matters more than provider
 * preference. Example: Voice Hub replies, Console answers, Command Palette.
 */
import { callPuter, DEFAULT_PUTER_CHAIN, type PuterModelId } from "./puter-brain";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export type RaceMode = "race" | "quorum" | "all";

export type RaceCompetitor =
  | {
      kind: "server";
      label: string;
      /** Server function call returning { text, model, provider }. */
      call: (signal: AbortSignal) => Promise<{ text: string; model: string; provider: string }>;
    }
  | {
      kind: "puter";
      label: string;
      model: PuterModelId | string;
    };

export type RaceEntry = {
  competitor: string;
  source: "server" | "puter";
  model?: string;
  provider?: string;
  text?: string;
  error?: string;
  latency_ms: number;
};

export type RaceResult = {
  winner: RaceEntry | null;
  entries: RaceEntry[];
  mode: RaceMode;
};

/**
 * Build the default competitor field — one entry per Puter model in the
 * default chain. Server competitors are added by the caller (they need
 * task-specific server function references that can't be auto-registered here).
 */
export function defaultPuterCompetitors(models = DEFAULT_PUTER_CHAIN): RaceCompetitor[] {
  return models.map((m) => ({ kind: "puter" as const, label: `puter:${m}`, model: m }));
}

async function runOne(
  c: RaceCompetitor,
  messages: Msg[],
  signal: AbortSignal,
): Promise<RaceEntry> {
  const t0 = Date.now();
  try {
    if (c.kind === "puter") {
      // Puter doesn't expose AbortSignal; we just race it.
      const r = await callPuter({ messages, model: c.model });
      return {
        competitor: c.label,
        source: "puter",
        model: r.model,
        provider: "puter",
        text: r.text,
        latency_ms: Date.now() - t0,
      };
    }
    const r = await c.call(signal);
    return {
      competitor: c.label,
      source: "server",
      model: r.model,
      provider: r.provider,
      text: r.text,
      latency_ms: Date.now() - t0,
    };
  } catch (e: any) {
    return {
      competitor: c.label,
      source: c.kind,
      error: e?.message ?? String(e),
      latency_ms: Date.now() - t0,
    };
  }
}

/**
 * Race all competitors. First non-empty success wins; losers are aborted.
 * Falls back to the next-fastest if the first finisher returned an error.
 */
export async function raceBrains(
  messages: Msg[],
  competitors: RaceCompetitor[],
  mode: RaceMode = "race",
): Promise<RaceResult> {
  if (competitors.length === 0) {
    return { winner: null, entries: [], mode };
  }
  const ctrl = new AbortController();
  const promises = competitors.map((c) => runOne(c, messages, ctrl.signal));

  if (mode === "all") {
    const entries = await Promise.all(promises);
    const winner = entries.find((e) => e.text && !e.error) ?? null;
    return { winner, entries, mode };
  }

  if (mode === "quorum") {
    // Collect 3 (or majority of competitors, whichever lower) successful responses.
    const target = Math.min(3, Math.ceil(competitors.length / 2));
    const collected: RaceEntry[] = [];
    const errors: RaceEntry[] = [];
    await new Promise<void>((resolve) => {
      let done = false;
      promises.forEach((p) =>
        p.then((entry) => {
          if (done) return;
          if (entry.text && !entry.error) collected.push(entry);
          else errors.push(entry);
          if (collected.length >= target) {
            done = true;
            ctrl.abort();
            resolve();
          } else if (collected.length + errors.length === competitors.length) {
            done = true;
            resolve();
          }
        }),
      );
    });
    // Pick the response that appears most often (very loose hash).
    const buckets = new Map<string, RaceEntry[]>();
    for (const e of collected) {
      const key = (e.text ?? "").trim().slice(0, 200).toLowerCase();
      buckets.set(key, [...(buckets.get(key) ?? []), e]);
    }
    let winner: RaceEntry | null = collected[0] ?? null;
    let best = 0;
    for (const [, bucket] of buckets) {
      if (bucket.length > best) {
        best = bucket.length;
        winner = bucket.sort((a, b) => a.latency_ms - b.latency_ms)[0];
      }
    }
    return { winner, entries: [...collected, ...errors], mode };
  }

  // mode === "race"
  return await new Promise<RaceResult>((resolve) => {
    const settled: RaceEntry[] = [];
    let resolved = false;
    promises.forEach((p) =>
      p.then((entry) => {
        settled.push(entry);
        if (!resolved && entry.text && !entry.error) {
          resolved = true;
          ctrl.abort();
          resolve({ winner: entry, entries: settled, mode });
          return;
        }
        if (settled.length === competitors.length && !resolved) {
          resolved = true;
          // Everyone failed — return the first response anyway so UI can show errors.
          resolve({ winner: null, entries: settled, mode });
        }
      }),
    );
  });
}
