/**
 * Puter.js client-side brain — the unkillable fallback.
 *
 * Puter.js is a free, no-API-key SDK that proxies to ~14 frontier model
 * families (Gemini, GPT, Claude, Grok, Mistral, Llama, DeepSeek, Nova,
 * Gemma, Liquid, Kimi, Mercury, OpenRouter, plus Nano Banana image gen).
 * Auth is anonymous-per-browser; the user's Puter account (if signed in)
 * is billed nothing — Puter eats the cost. We use it as the absolute last
 * line of defense when every server key in brain.server.ts has failed.
 *
 * USAGE: import { callPuter, ensurePuter } from "@/lib/puter-brain";
 *        const text = await callPuter({ messages, model: "gemini-2.5-flash" });
 *
 * NOTE: Browser-only. Never import from server functions / .server.ts files.
 */

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          prompt: string | any[],
          options?: { model?: string; stream?: boolean; tools?: any[] },
        ) => Promise<any> | AsyncIterable<any>;
        txt2img?: (prompt: string, options?: { model?: string }) => Promise<any>;
        txt2speech?: (text: string, options?: any) => Promise<any>;
      };
    };
  }
}

const PUTER_SCRIPT = "https://js.puter.com/v2/";

let loadPromise: Promise<void> | null = null;

/** Lazy-load the Puter SDK exactly once. Idempotent + SSR-safe. */
export function ensurePuter(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Puter only runs in the browser"));
  }
  if (window.puter) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PUTER_SCRIPT}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Puter load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = PUTER_SCRIPT;
    s.async = true;
    s.onload = () => (window.puter ? resolve() : reject(new Error("Puter loaded but global missing")));
    s.onerror = () => reject(new Error("Puter script failed to load"));
    document.head.appendChild(s);
  });

  return loadPromise;
}

/**
 * The exhaustive Puter model surface — covers every "Free, Unlimited" family
 * the operator listed. Keys are our canonical model ids (matching brain.server
 * conventions where possible); values are the strings Puter expects on the wire.
 */
export const PUTER_MODELS = {
  // ─── Google ─────────────────────────────────────────────────────────
  "google/gemini-3-pro-preview":            "google/gemini-3-pro-preview",
  "google/gemini-3.1-pro-preview":          "google/gemini-3.1-pro-preview",
  "google/gemini-3-flash-preview":          "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro":                  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash":                "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite":           "google/gemini-2.5-flash-lite",
  "google/gemini-2.0-flash":                "google/gemini-2.0-flash",

  // ─── Nano Banana (image) ────────────────────────────────────────────
  "google/gemini-2.5-flash-image":          "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview":      "google/gemini-3-pro-image-preview",

  // ─── Gemma ──────────────────────────────────────────────────────────
  "google/gemma-2-27b":                     "google/gemma-2-27b-it",
  "google/gemma-3-27b":                     "google/gemma-3-27b-it",

  // ─── OpenAI ─────────────────────────────────────────────────────────
  "openai/gpt-5":                           "gpt-5",
  "openai/gpt-5-mini":                      "gpt-5-mini",
  "openai/gpt-5-nano":                      "gpt-5-nano",
  "openai/gpt-4o":                          "gpt-4o",
  "openai/gpt-4o-mini":                     "gpt-4o-mini",
  "openai/o3":                              "o3",
  "openai/o3-mini":                         "o3-mini",

  // ─── Anthropic ──────────────────────────────────────────────────────
  "anthropic/claude-opus-4-5":              "claude-opus-4-5",
  "anthropic/claude-sonnet-4-5":            "claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5":             "claude-haiku-4-5",
  "anthropic/claude-3-7-sonnet":            "claude-3-7-sonnet",

  // ─── xAI Grok ───────────────────────────────────────────────────────
  "x-ai/grok-4":                            "x-ai/grok-4",
  "x-ai/grok-4-fast":                       "x-ai/grok-4-fast",
  "x-ai/grok-3":                            "x-ai/grok-3",
  "x-ai/grok-3-mini":                       "x-ai/grok-3-mini",

  // ─── Mistral ────────────────────────────────────────────────────────
  "mistral/mistral-large":                  "mistral-large-latest",
  "mistral/mistral-medium":                 "mistral-medium-latest",
  "mistral/mistral-small":                  "mistral-small-latest",
  "mistral/codestral":                      "codestral-latest",

  // ─── Meta Llama ─────────────────────────────────────────────────────
  "meta/llama-4-maverick":                  "meta-llama/llama-4-maverick",
  "meta/llama-4-scout":                     "meta-llama/llama-4-scout",
  "meta/llama-3.3-70b":                     "meta-llama/llama-3.3-70b-instruct",

  // ─── Amazon Nova ────────────────────────────────────────────────────
  "amazon/nova-pro":                        "amazon/nova-pro-v1",
  "amazon/nova-lite":                       "amazon/nova-lite-v1",
  "amazon/nova-micro":                      "amazon/nova-micro-v1",

  // ─── DeepSeek ───────────────────────────────────────────────────────
  "deepseek/deepseek-chat":                 "deepseek-chat",
  "deepseek/deepseek-reasoner":             "deepseek-reasoner",
  "deepseek/deepseek-v3":                   "deepseek-v3",

  // ─── Liquid AI ──────────────────────────────────────────────────────
  "liquid/lfm-40b":                         "liquid/lfm-40b",
  "liquid/lfm-7b":                          "liquid/lfm-7b",

  // ─── Moonshot Kimi ──────────────────────────────────────────────────
  "moonshot/kimi-k2.6":                     "moonshot/kimi-k2.6",
  "moonshot/kimi-k2":                       "moonshot/kimi-k2",

  // ─── Inception Mercury (diffusion-LM) ───────────────────────────────
  "inception/mercury":                      "inception/mercury",
  "inception/mercury-coder":                "inception/mercury-coder",

  // ─── OpenRouter passthrough (any model id Puter forwards) ──────────
  "openrouter/auto":                        "openrouter/auto",
} as const;

export type PuterModelId = keyof typeof PUTER_MODELS;

export type PuterMessage = { role: "system" | "user" | "assistant"; content: string };

export type PuterCallOptions = {
  messages: PuterMessage[];
  /** Canonical model id (PUTER_MODELS key) OR a raw Puter model string. */
  model?: PuterModelId | string;
  /** Try these models in order until one succeeds. Overrides `model`. */
  fallbackModels?: (PuterModelId | string)[];
  stream?: false;
};

export type PuterResult = {
  provider: "puter";
  model: string;
  text: string;
  fallbacks: { model: string; error: string }[];
};

function resolveWireModel(m: string): string {
  return (PUTER_MODELS as Record<string, string>)[m] ?? m;
}

/**
 * Default Puter chain — mirrors the operator's "always works" requirement.
 * Tries top-tier first, degrades to fast/cheap, ends on OpenRouter auto-router.
 */
export const DEFAULT_PUTER_CHAIN: (PuterModelId | string)[] = [
  "openai/gpt-5",
  "anthropic/claude-sonnet-4-5",
  "x-ai/grok-4",
  "google/gemini-3-pro-preview",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat",
  "mistral/mistral-large",
  "meta/llama-4-maverick",
  "amazon/nova-pro",
  "moonshot/kimi-k2",
  "google/gemini-2.5-flash",
  "openrouter/auto",
];

/** Extract assistant text from Puter's varied response shapes. */
function extractText(resp: any): string {
  if (!resp) return "";
  if (typeof resp === "string") return resp;
  if (typeof resp.toString === "function" && resp.message?.content) {
    const c = resp.message.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map((p: any) => p.text ?? "").join("");
  }
  if (resp.text) return resp.text;
  if (resp.choices?.[0]?.message?.content) return resp.choices[0].message.content;
  return String(resp);
}

/**
 * Call Puter.js with automatic in-chain fallback.
 * Throws only if EVERY model in the resolved chain fails.
 */
export async function callPuter(opts: PuterCallOptions): Promise<PuterResult> {
  await ensurePuter();
  const puter = window.puter!;

  const chain =
    opts.fallbackModels && opts.fallbackModels.length > 0
      ? opts.fallbackModels
      : opts.model
        ? [opts.model, ...DEFAULT_PUTER_CHAIN.filter((m) => m !== opts.model)]
        : DEFAULT_PUTER_CHAIN;

  const fallbacks: { model: string; error: string }[] = [];

  for (const m of chain) {
    const wire = resolveWireModel(m);
    try {
      // Puter accepts either a string prompt or a messages array.
      const resp = await puter.ai.chat(opts.messages as any, { model: wire });
      const text = extractText(resp);
      if (!text) {
        fallbacks.push({ model: wire, error: "empty response" });
        continue;
      }
      return { provider: "puter", model: wire, text, fallbacks };
    } catch (e: any) {
      fallbacks.push({ model: wire, error: e?.message ?? String(e) });
    }
  }

  throw new Error(
    `Puter brain exhausted (${fallbacks.length} models tried): ${fallbacks
      .map((f) => `${f.model}=${f.error}`)
      .join(" | ")}`,
  );
}

/** Free unlimited Nano Banana / Gemini image generation via Puter. */
export async function puterImage(prompt: string, model = "google/gemini-3-pro-image-preview"): Promise<string> {
  await ensurePuter();
  const wire = resolveWireModel(model);
  const resp = await window.puter!.ai.txt2img?.(prompt, { model: wire });
  if (!resp) throw new Error("Puter image generation unavailable");
  // Puter returns either a URL string or an <img> element.
  if (typeof resp === "string") return resp;
  if (resp instanceof HTMLImageElement) return resp.src;
  return (resp as any).url ?? String(resp);
}
