/**
 * Brain Router — server-only multi-provider LLM gateway.
 *
 * Single entrypoint (`callBrain`) with automatic fallback across providers.
 * Used by ALL server-side AI calls: server functions, edge functions (via
 * shared logic copy), webhooks, scheduled tasks, agent runners.
 *
 * Fallback chain (in order, configurable):
 *   1. xAI direct           (x-ai/grok-4)
 *   2. Lovable AI Gateway   (openai/gpt-5)
 *   3. Lovable AI Gateway   (google/gemini-3-flash-preview)
 *
 * A provider is skipped when:
 *   - secret missing
 *   - 401/403 (key invalid/revoked)
 *   - 402 (out of credits)
 *   - 429 after retry budget exhausted
 *   - 5xx repeated
 *
 * The brain_health table (best-effort, non-blocking) tracks the last status
 * per provider so the UI badge can show green/amber/red without re-pinging.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BrainMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
};

export type ProviderId =
  | "xai"
  | "openai-direct"
  | "anthropic-direct"
  | "google-direct"
  | "lovable-openai"
  | "lovable-google";

/** API request/response shape — providers diverge here. */
export type WireFormat = "openai" | "anthropic" | "gemini";

/**
 * Task kinds — used to pick the best provider for a given job.
 *  - reasoning: deep multi-step analysis, math, code review (GPT-5 / Grok strong)
 *  - code:      code generation / refactors (GPT-5 best, Grok solid, Gemini ok)
 *  - chat:      open-ended conversation (any work, prefer cheaper/faster)
 *  - fast:      latency-sensitive small responses (Gemini Flash wins)
 *  - tools:     function-calling / agent loops (GPT-5 most reliable, then xAI)
 *  - vision:    image input (Gemini and GPT-5 only)
 *  - cheap:     bulk / classification / summarisation (Gemini Flash)
 */
export type TaskKind = "reasoning" | "code" | "chat" | "fast" | "tools" | "vision" | "cheap";

export type BrainProvider = {
  id: ProviderId;
  label: string;
  model: string;            // operator-facing model id
  endpoint: string;
  apiKeyEnv: string;
  modelOnWire: string;      // exact string sent on the wire
  supportsTools: boolean;
  /** Wire shape — how to build the request body and parse the response. */
  wireFormat: WireFormat;
  /** Lower number = stronger fit. Missing = not preferred. */
  strengths: Partial<Record<TaskKind, number>>;
};

export const PROVIDERS: Record<ProviderId, BrainProvider> = {
  xai: {
    id: "xai",
    label: "Grok 4 (xAI)",
    model: "x-ai/grok-4",
    endpoint: "https://api.x.ai/v1/chat/completions",
    apiKeyEnv: "XAI_API_KEY",
    modelOnWire: "grok-4",
    supportsTools: true,
    wireFormat: "openai",
    strengths: { reasoning: 2, chat: 2, tools: 3, code: 3 },
  },
  "xai-2": {
    id: "xai-2",
    label: "Grok 4 (xAI · backup key)",
    model: "x-ai/grok-4",
    endpoint: "https://api.x.ai/v1/chat/completions",
    apiKeyEnv: "XAI_API_KEY_2",
    modelOnWire: "grok-4",
    supportsTools: true,
    wireFormat: "openai",
    strengths: { reasoning: 2, chat: 2, tools: 3, code: 3 },
  },
  "openai-direct": {
    id: "openai-direct",
    label: "GPT-5 (OpenAI direct)",
    model: "openai/gpt-5",
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
    modelOnWire: "gpt-5",
    supportsTools: true,
    wireFormat: "openai",
    strengths: { reasoning: 1, code: 1, tools: 1, vision: 2, chat: 2 },
  },
  "anthropic-direct": {
    id: "anthropic-direct",
    label: "Claude Sonnet 4.5 (Anthropic)",
    model: "anthropic/claude-sonnet-4-5",
    endpoint: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelOnWire: "claude-sonnet-4-5",
    supportsTools: true,
    wireFormat: "anthropic",
    // Claude is elite at long-context reasoning, code review, and agentic tools.
    strengths: { reasoning: 1, code: 1, tools: 2, chat: 2 },
  },
  "google-direct": {
    id: "google-direct",
    label: "Gemini 2.5 Pro (Google direct)",
    model: "google/gemini-2.5-pro",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
    apiKeyEnv: "GEMINI_API_KEY",
    modelOnWire: "gemini-2.5-pro",
    supportsTools: true,
    wireFormat: "gemini",
    // Gemini Pro: strong vision, long context, multimodal.
    strengths: { vision: 1, fast: 2, cheap: 2, chat: 3, reasoning: 3 },
  },
  "lovable-openai": {
    id: "lovable-openai",
    label: "GPT-5 (Lovable last-resort)",
    model: "openai/gpt-5",
    endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKeyEnv: "LOVABLE_API_KEY",
    modelOnWire: "openai/gpt-5",
    supportsTools: true,
    wireFormat: "openai",
    // Demoted: same model as direct but only used if every direct provider fails.
    strengths: { reasoning: 5, code: 5, tools: 5, chat: 5 },
  },
  "lovable-google": {
    id: "lovable-google",
    label: "Gemini Flash (Lovable last-resort)",
    model: "google/gemini-3-flash-preview",
    endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKeyEnv: "LOVABLE_API_KEY",
    modelOnWire: "google/gemini-3-flash-preview",
    supportsTools: true,
    wireFormat: "openai",
    // Last-resort. Only beats nothing.
    strengths: { fast: 5, cheap: 5, chat: 6 },
  },
};

// Order = priority. Direct providers first; Lovable gateway is final fallback.
// Missing keys are skipped automatically.
export const DEFAULT_FALLBACK_CHAIN: ProviderId[] = [
  "xai",
  "xai-2",
  "openai-direct",
  "anthropic-direct",
  "google-direct",
  "lovable-openai",
  "lovable-google",
];

export type BrainStatus = "ok" | "degraded" | "down" | "unconfigured";

export type ProviderHealth = {
  provider: ProviderId;
  label: string;
  model: string;
  status: BrainStatus;
  http?: number;
  message?: string;
  latency_ms?: number;
  checked_at: string;
};

/**
 * Resolve which providers to try, in priority order.
 *
 * Priority:
 *   1. If `preferredModel` is set AND its provider is configured → that first.
 *   2. Otherwise, if `taskKind` is set → providers ranked by their strength
 *      score for that task (lower = better), then alphabetical for ties.
 *   3. Otherwise → DEFAULT_FALLBACK_CHAIN.
 *
 * Whatever the head of the chain is, the rest of DEFAULT_FALLBACK_CHAIN is
 * appended so we always have automatic failover.
 */
export function resolveChain(preferredModel?: string, taskKind?: TaskKind): ProviderId[] {
  if (preferredModel) {
    const direct = Object.values(PROVIDERS).find((p) => p.model === preferredModel)?.id;
    if (direct) return [direct, ...DEFAULT_FALLBACK_CHAIN.filter((id) => id !== direct)];
  }
  if (taskKind) {
    const ranked = Object.values(PROVIDERS)
      .filter((p) => p.strengths[taskKind] !== undefined)
      .sort((a, b) => (a.strengths[taskKind]! - b.strengths[taskKind]!) || a.id.localeCompare(b.id))
      .map((p) => p.id);
    if (ranked.length > 0) {
      const tail = DEFAULT_FALLBACK_CHAIN.filter((id) => !ranked.includes(id));
      return [...ranked, ...tail];
    }
  }
  return DEFAULT_FALLBACK_CHAIN;
}

type CallOptions = {
  messages: BrainMessage[];
  tools?: any[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  preferredModel?: string;
  /** Hint about the kind of work — used to pick the best provider first. */
  taskKind?: TaskKind;
  reasoning_effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "none";
  /** Skip these providers (e.g. already-failed in a previous round). */
  exclude?: ProviderId[];
  /** Hard timeout per provider, ms. Default 45s. */
  timeoutMs?: number;
};

export type BrainResponse = {
  provider: ProviderId;
  model: string;
  raw: any;
  /** Convenience accessor for the assistant message. */
  message: { role: string; content: string; tool_calls?: any[] };
  /** Providers that were tried and failed before this one succeeded. */
  fallbacks: { provider: ProviderId; status: number; error: string }[];
};

const isTransient = (status: number) => status === 429 || status >= 500;
const isFatal = (status: number) =>
  status === 401 || status === 402 || status === 403 || status === 404;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function recordHealth(
  provider: ProviderId,
  status: BrainStatus,
  http?: number,
  message?: string,
  latency_ms?: number,
) {
  try {
    await supabaseAdmin
      .from("brain_health")
      .upsert(
        {
          provider,
          status,
          http: http ?? null,
          message: message?.slice(0, 500) ?? null,
          latency_ms: latency_ms ?? null,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "provider" },
      );
  } catch {
    /* health logging is best-effort */
  }
}

/**
 * Build the wire request for a given provider format.
 * Returns { url, headers, body, normalize } where `normalize` converts the
 * provider's response into an OpenAI-style { choices: [{ message }] } shape so
 * the rest of the system stays uniform.
 */
function buildRequest(
  p: BrainProvider,
  apiKey: string,
  opts: CallOptions,
): {
  url: string;
  headers: Record<string, string>;
  body: string;
  normalize: (raw: any) => any;
} {
  if (p.wireFormat === "anthropic") {
    // Anthropic separates `system` from messages and uses x-api-key auth.
    const systemMsgs = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const convo = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    const body: Record<string, unknown> = {
      model: p.modelOnWire,
      max_tokens: 4096,
      messages: convo,
    };
    if (systemMsgs) body.system = systemMsgs;
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t: any) => ({
        name: t.function?.name ?? t.name,
        description: t.function?.description ?? t.description,
        input_schema: t.function?.parameters ?? t.input_schema ?? {},
      }));
    }
    return {
      url: p.endpoint,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      normalize: (raw: any) => {
        const text = (raw?.content ?? [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        return { choices: [{ message: { role: "assistant", content: text } }] };
      },
    };
  }

  if (p.wireFormat === "gemini") {
    // Gemini direct: ?key=API_KEY, system as systemInstruction, messages as contents.
    const systemMsgs = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const body: Record<string, unknown> = { contents };
    if (systemMsgs) body.systemInstruction = { parts: [{ text: systemMsgs }] };
    return {
      url: `${p.endpoint}?key=${encodeURIComponent(apiKey)}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      normalize: (raw: any) => {
        const text =
          raw?.candidates?.[0]?.content?.parts?.map((pt: any) => pt.text ?? "").join("") ?? "";
        return { choices: [{ message: { role: "assistant", content: text } }] };
      },
    };
  }

  // Default: OpenAI-compatible (xAI, OpenAI, Lovable Gateway).
  const body: Record<string, unknown> = { model: p.modelOnWire, messages: opts.messages };
  if (opts.tools?.length && p.supportsTools) {
    body.tools = opts.tools;
    body.tool_choice = opts.tool_choice ?? "auto";
  }
  if (
    opts.reasoning_effort &&
    opts.reasoning_effort !== "none" &&
    (p.model.startsWith("openai/gpt-5") || p.model.includes("gemini-3"))
  ) {
    body.reasoning = { effort: opts.reasoning_effort };
  }
  return {
    url: p.endpoint,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    normalize: (raw: any) => raw,
  };
}

async function callProvider(
  p: BrainProvider,
  opts: CallOptions,
): Promise<{ ok: true; data: any; status: number } | { ok: false; status: number; error: string }> {
  const apiKey = process.env[p.apiKeyEnv];
  if (!apiKey) {
    return { ok: false, status: 0, error: `${p.apiKeyEnv} not configured` };
  }

  const req = buildRequest(p, apiKey, opts);
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetchWithTimeout(
      req.url,
      { method: "POST", headers: req.headers, body: req.body },
      opts.timeoutMs ?? 45_000,
    );
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "timeout" : e?.message ?? "network error";
    void recordHealth(p.id, "down", 0, msg, Date.now() - t0);
    return { ok: false, status: 0, error: msg };
  }

  const latency = Date.now() - t0;

  if (r.ok) {
    const raw = await r.json();
    const data = req.normalize(raw);
    void recordHealth(p.id, "ok", r.status, undefined, latency);
    return { ok: true, data, status: r.status };
  }

  const text = await r.text().catch(() => "");
  const status: BrainStatus = isFatal(r.status) ? "down" : isTransient(r.status) ? "degraded" : "down";
  void recordHealth(p.id, status, r.status, text.slice(0, 300), latency);
  return { ok: false, status: r.status, error: `${r.status}: ${text.slice(0, 300)}` };
}

/**
 * MAIN ENTRYPOINT — call an LLM with automatic fallback.
 * Throws only if EVERY provider in the chain fails.
 */
export async function callBrain(opts: CallOptions): Promise<BrainResponse> {
  let chain = resolveChain(opts.preferredModel, opts.taskKind).filter((id) => !opts.exclude?.includes(id));
  // If the caller is doing tool-calling, restrict to OpenAI-wire providers.
  // Anthropic/Gemini direct adapters here normalize replies to plain text and
  // would silently strip `tool_calls`, breaking multi-round agent loops
  // (this was the CEO Grok "agent stops mid-task" bug on fallback).
  if (opts.tools?.length) {
    const openaiOnly = chain.filter((id) => PROVIDERS[id].wireFormat === "openai");
    if (openaiOnly.length) chain = openaiOnly;
  }
  const fallbacks: { provider: ProviderId; status: number; error: string }[] = [];

  for (const id of chain) {
    const p = PROVIDERS[id];
    const res = await callProvider(p, opts);
    if (res.ok) {
      const message = res.data.choices?.[0]?.message ?? { role: "assistant", content: "" };
      return { provider: p.id, model: p.model, raw: res.data, message, fallbacks };
    }
    fallbacks.push({ provider: p.id, status: res.status, error: res.error });
    // For fatal errors (401/402/403) we should not retry the SAME provider but
    // we DO try the next provider in the chain.
    // For transient errors the next provider attempt also acts as our retry.
  }

  const summary = fallbacks
    .map((f) => `${f.provider}=${f.status || "x"}:${f.error.slice(0, 80)}`)
    .join(" | ");
  throw new Error(`All brain providers failed: ${summary}`);
}

/**
 * Health check — pings every provider with a tiny request.
 * Used by the persistent UI badge and the /brains console command.
 */
export async function checkAllProviders(): Promise<ProviderHealth[]> {
  const results = await Promise.all(
    Object.values(PROVIDERS).map(async (p): Promise<ProviderHealth> => {
      const apiKey = process.env[p.apiKeyEnv];
      const checked_at = new Date().toISOString();
      if (!apiKey) {
        const h: ProviderHealth = {
          provider: p.id,
          label: p.label,
          model: p.model,
          status: "unconfigured",
          message: `${p.apiKeyEnv} not set`,
          checked_at,
        };
        void recordHealth(p.id, "unconfigured", undefined, h.message);
        return h;
      }
      const t0 = Date.now();
      try {
        // Reuse the wire adapter so each provider gets a valid ping.
        const req = buildRequest(p, apiKey, {
          messages: [{ role: "user", content: "ping" }],
        });
        const r = await fetchWithTimeout(
          req.url,
          { method: "POST", headers: req.headers, body: req.body },
          10_000,
        );
        const latency_ms = Date.now() - t0;
        if (r.ok) {
          void recordHealth(p.id, "ok", r.status, undefined, latency_ms);
          return { provider: p.id, label: p.label, model: p.model, status: "ok", http: r.status, latency_ms, checked_at };
        }
        const text = await r.text().catch(() => "");
        const status: BrainStatus = isTransient(r.status) ? "degraded" : "down";
        const message = text.slice(0, 200);
        void recordHealth(p.id, status, r.status, message, latency_ms);
        return { provider: p.id, label: p.label, model: p.model, status, http: r.status, message, latency_ms, checked_at };
      } catch (e: any) {
        const latency_ms = Date.now() - t0;
        const message = e?.name === "AbortError" ? "timeout" : e?.message ?? "error";
        void recordHealth(p.id, "down", 0, message, latency_ms);
        return { provider: p.id, label: p.label, model: p.model, status: "down", message, latency_ms, checked_at };
      }
    }),
  );
  return results;
}

/**
 * Health for the auxiliary services we depend on (Perplexity, Cloudflare).
 * Surfaced in the same UI badge so operators see EVERY external dep at a glance.
 */
export type AuxiliaryId = "perplexity" | "cloudflare";

export type AuxiliaryHealth = {
  id: AuxiliaryId;
  label: string;
  status: BrainStatus;
  http?: number;
  message?: string;
  latency_ms?: number;
  checked_at: string;
};

export async function checkAuxiliary(): Promise<AuxiliaryHealth[]> {
  const checks: Array<() => Promise<AuxiliaryHealth>> = [
    async () => {
      const checked_at = new Date().toISOString();
      const key = process.env.PERPLEXITY_API_KEY;
      if (!key)
        return { id: "perplexity", label: "Perplexity", status: "unconfigured", message: "PERPLEXITY_API_KEY not set", checked_at };
      const t0 = Date.now();
      try {
        const r = await fetchWithTimeout(
          "https://api.perplexity.ai/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
          },
          10_000,
        );
        const latency_ms = Date.now() - t0;
        if (r.ok) return { id: "perplexity", label: "Perplexity", status: "ok", http: r.status, latency_ms, checked_at };
        const text = await r.text().catch(() => "");
        return {
          id: "perplexity",
          label: "Perplexity",
          status: isTransient(r.status) ? "degraded" : "down",
          http: r.status,
          message: text.slice(0, 200),
          latency_ms,
          checked_at,
        };
      } catch (e: any) {
        return { id: "perplexity", label: "Perplexity", status: "down", message: e?.message ?? "error", checked_at };
      }
    },
    async () => {
      const checked_at = new Date().toISOString();
      const token = process.env.CLOUDFLARE_API_TOKEN;
      if (!token)
        return { id: "cloudflare", label: "Cloudflare", status: "unconfigured", message: "CLOUDFLARE_API_TOKEN not set", checked_at };
      const t0 = Date.now();
      try {
        const r = await fetchWithTimeout(
          "https://api.cloudflare.com/client/v4/user/tokens/verify",
          { headers: { Authorization: `Bearer ${token}` } },
          10_000,
        );
        const latency_ms = Date.now() - t0;
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.success) return { id: "cloudflare", label: "Cloudflare", status: "ok", http: r.status, latency_ms, checked_at };
        return {
          id: "cloudflare",
          label: "Cloudflare",
          status: r.status >= 500 ? "degraded" : "down",
          http: r.status,
          message: JSON.stringify(j?.errors ?? j).slice(0, 200),
          latency_ms,
          checked_at,
        };
      } catch (e: any) {
        return { id: "cloudflare", label: "Cloudflare", status: "down", message: e?.message ?? "error", checked_at };
      }
    },
  ];

  return Promise.all(checks.map((c) => c()));
}
