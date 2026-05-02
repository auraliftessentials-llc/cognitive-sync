/**
 * MERKABAH · Command Router
 *
 * The single sovereign entrypoint that takes ANY natural-language input from
 * Voice Hub / Console / ⌘K / future bridge callers and dispatches it to the
 * correct backend system. It does not duplicate the Console's tool-calling
 * loop — it classifies intent first, then either:
 *
 *   1. Runs an explicit slash command (deterministic, fast)
 *   2. Calls the brain router with the right `taskKind` so YOUR keys (xAI →
 *      OpenAI → Anthropic → Gemini → Lovable last-resort) auto-fallback
 *      according to the strengths declared in brain.server.ts
 *
 * Returns a uniform shape the UI can render no matter which path was taken.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callBrain, type BrainMessage, type TaskKind } from "./brain.server";

type RouterIntent =
  | "code"
  | "reasoning"
  | "research"
  | "vision"
  | "fast"
  | "cli"
  | "github"
  | "zoho"
  | "cloudflare"
  | "chat"
  | "magic.next"
  | "magic.do"
  | "magic.status"
  | "magic.brain";

export type CommandRouterResult = {
  ok: boolean;
  intent: RouterIntent;
  provider: string;
  model: string;
  fallbacks: { provider: string; status: number; error: string }[];
  output: string;
  hint?: string; // human-readable note about why this route was picked
};

/**
 * Lightweight rule-based intent classifier. Cheap, deterministic, runs before
 * we ever pay for an LLM call. Falls back to "chat" + a smart taskKind.
 */
function classify(input: string): { intent: RouterIntent; taskKind: TaskKind; hint: string } {
  const t = input.trim().toLowerCase();

  // explicit verbs / namespaces
  if (/^(\/cli|cli:|run cli|execute cli|terminal:)/.test(t))
    return { intent: "cli", taskKind: "tools", hint: "CLI namespace detected" };
  if (/(github|repo|pull request|\bpr #|commit|gh:)/.test(t))
    return { intent: "github", taskKind: "tools", hint: "GitHub keyword" };
  if (/(zoho|crm|deals|leads|pipeline|contacts)/.test(t))
    return { intent: "zoho", taskKind: "tools", hint: "Zoho/CRM keyword" };
  if (/(cloudflare|cf zones?|purge cache|workers ai|wrangler)/.test(t))
    return { intent: "cloudflare", taskKind: "tools", hint: "Cloudflare keyword" };

  // research / live web
  if (/(latest|today|news|search|research|look up|current price|stock|weather|sports|score)/.test(t))
    return { intent: "research", taskKind: "fast", hint: "Live-web research signal" };

  // code
  if (
    /(write|refactor|implement|fix|debug|optimi[sz]e|stack trace|error|exception|typescript|python|sql|regex)/
      .test(t) ||
    /```/.test(input)
  )
    return { intent: "code", taskKind: "code", hint: "Code keyword / fenced block" };

  // vision
  if (/(image|screenshot|picture|photo|diagram|chart of|graph)/.test(t))
    return { intent: "vision", taskKind: "vision", hint: "Vision keyword" };

  // fast
  if (t.length < 60 && /^(what is|when|where|how much|define|tldr|summari[sz]e)/.test(t))
    return { intent: "fast", taskKind: "fast", hint: "Short-question fast lane" };

  // default: deep reasoning chat
  return { intent: "reasoning", taskKind: "reasoning", hint: "Default → deep reasoning" };
}

const SYSTEM_PROMPT = `You are MERKABAH OS — the Master Operator's autonomous command intelligence.
You serve a single user (the Master). You speak with calm precision, never apologize, never hedge.
You have access to tools and live data via separate sub-systems; if the user asks for live data,
explain the plan and tell them which slash-command or sub-agent will fetch it (e.g. /zoho deals,
/cloudflare zones, /research <query>). Always end actionable answers with the SINGLE highest-leverage
next move. Use markdown sparingly. Be useful.`;

export const commandRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      prompt: string;
      history?: BrainMessage[];
      forceTaskKind?: TaskKind;
    }) => input,
  )
  .handler(async ({ data }): Promise<CommandRouterResult> => {
    const prompt = (data.prompt ?? "").trim();
    if (!prompt) {
      return {
        ok: false,
        intent: "chat",
        provider: "",
        model: "",
        fallbacks: [],
        output: "Empty command.",
      };
    }

    const c = classify(prompt);
    const taskKind = data.forceTaskKind ?? c.taskKind;

    // Explicit deterministic intents → produce an enriched prompt that nudges
    // the brain to use the right slash-command pattern the Console understands.
    let enrichedPrompt = prompt;
    if (c.intent === "github") {
      enrichedPrompt = `The Master wants GitHub work. Use the github_* tools available to you. Request: ${prompt}`;
    } else if (c.intent === "zoho") {
      enrichedPrompt = `The Master wants Zoho/CRM data. Use zoho_* tools or recommend /zoho deals|leads|contacts|tasks|mail. Request: ${prompt}`;
    } else if (c.intent === "cloudflare") {
      enrichedPrompt = `The Master wants Cloudflare action. Use cloudflare_* tools. Request: ${prompt}`;
    } else if (c.intent === "research") {
      enrichedPrompt = `The Master needs LIVE information. Use web_research / Perplexity. Cite sources. Request: ${prompt}`;
    } else if (c.intent === "cli") {
      enrichedPrompt = `The Master wants to run something on the Super Agent CLI. Describe the command you'd run, then explain which agent should execute it. Request: ${prompt}`;
    }

    const messages: BrainMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(data.history ?? []).slice(-8),
      { role: "user", content: enrichedPrompt },
    ];

    try {
      const res = await callBrain({
        messages,
        taskKind,
        reasoning_effort: c.intent === "reasoning" || c.intent === "code" ? "medium" : "low",
      });
      return {
        ok: true,
        intent: c.intent,
        provider: res.provider,
        model: res.model,
        fallbacks: res.fallbacks,
        output: res.message.content ?? "",
        hint: `${c.hint} → ${taskKind}`,
      };
    } catch (e: any) {
      return {
        ok: false,
        intent: c.intent,
        provider: "",
        model: "",
        fallbacks: [],
        output: e?.message ?? "All providers failed.",
        hint: c.hint,
      };
    }
  });
