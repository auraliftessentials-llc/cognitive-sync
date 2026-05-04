/**
 * Client-side race wrapper for the unified Command Router.
 *
 * Wraps src/lib/command-router.functions.ts → commandRoute (server, with
 * server-key fallback chain) AND src/lib/puter-brain.ts (browser-side, no key)
 * into a single peer race. Whichever responds first with usable text wins.
 *
 * Used by every natural-language UI surface: CEOVoiceHub, CommandPalette,
 * Console quick-input, future bridge — so requests literally cannot fail
 * unless the user is offline.
 */
import { commandRoute, type CommandRouterResult } from "./command-router.functions";
import { raceBrains, type RaceCompetitor, type RaceMode } from "./brain-race";

export type RoutedRaceResult = {
  ok: boolean;
  source: "server" | "puter";
  intent: string;
  provider: string;
  model: string;
  output: string;
  hint?: string;
  /** Other peers that responded (or failed). For UI debugging only. */
  trail: { competitor: string; latency_ms: number; ok: boolean; error?: string }[];
};

const SYSTEM_VOICE = `You are MERKABAH OS — the Master Operator's autonomous command intelligence. Calm precision. No hedging. Single highest-leverage next move at the end. Markdown sparingly.`;

/**
 * Race the server router against client-side Puter peers.
 *
 * Server peer is preferred for tool-using intents (Linear, Cloudflare, etc.)
 * because Puter has no access to your tools. We bias the race by giving the
 * server peer a head start of `serverHeadStartMs` so it usually wins when
 * healthy — Puter only takes over if the server is slow or down.
 */
export async function routeWithRace(args: {
  prompt: string;
  history?: { role: "system" | "user" | "assistant"; content: string }[];
  /** Default "race". Use "all" only for debug UIs. */
  mode?: RaceMode;
  /** Bias toward server when healthy. Default 800ms. Set 0 for true race. */
  serverHeadStartMs?: number;
}): Promise<RoutedRaceResult> {
  const { prompt, history = [], mode = "race", serverHeadStartMs = 800 } = args;

  const messages = [
    { role: "system" as const, content: SYSTEM_VOICE },
    ...history.slice(-8),
    { role: "user" as const, content: prompt },
  ];

  const competitors: RaceCompetitor[] = [
    {
      kind: "server",
      label: "merkabah-router",
      call: async (_signal): Promise<{ text: string; model: string; provider: string }> => {
        const r: CommandRouterResult = await commandRoute({
          data: { prompt, history: history as any },
        });
        if (!r.ok) throw new Error(r.output || "router failed");
        // Stash hint+intent on the model field in a parseable way so the
        // outer wrapper can recover them after the race.
        return {
          text: r.output,
          model: `${r.model}|${r.intent}|${r.hint ?? ""}`,
          provider: r.provider || "merkabah",
        };
      },
    },
    // Puter peers — staggered start so the server gets first shot at tool work.
    {
      kind: "server", // technically client-Puter, but we wrap it as a delayed competitor
      label: "puter-delayed",
      call: async (signal): Promise<{ text: string; model: string; provider: string }> => {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, serverHeadStartMs);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        });
        // Dynamic import keeps Puter SDK out of the initial bundle.
        const { callPuter } = await import("./puter-brain");
        const p = await callPuter({ messages });
        return { text: p.text, model: p.model, provider: "puter" };
      },
    },
  ];

  const race = await raceBrains(messages as any, competitors, mode);
  const trail = race.entries.map((e) => ({
    competitor: e.competitor,
    latency_ms: e.latency_ms,
    ok: !!e.text && !e.error,
    error: e.error,
  }));

  if (!race.winner) {
    return {
      ok: false,
      source: "server",
      intent: "chat",
      provider: "",
      model: "",
      output: "Every brain peer failed. Check your network.",
      trail,
    };
  }

  // Recover intent/hint encoded by the server peer.
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
    hint = "Puter peer won the race";
  }

  return {
    ok: true,
    source: isPuter ? "puter" : "server",
    intent,
    provider: race.winner.provider ?? (isPuter ? "puter" : ""),
    model,
    output: race.winner.text ?? "",
    hint,
    trail,
  };
}
