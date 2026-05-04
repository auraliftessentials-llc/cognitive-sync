/**
 * Hybrid brain — tries the server brain (operator's own keys), and on total
 * failure falls back to Puter.js in the browser. Use this from React
 * components when you want the "literally cannot fail" guarantee.
 *
 * Server callers should keep using callBrain directly from brain.server.ts.
 */
import { callPuter, type PuterModelId } from "./puter-brain";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export type HybridOptions = {
  messages: Msg[];
  /** Server function that returns { text, model, provider, fallbacks }. */
  serverCall: () => Promise<{ text: string; model: string; provider: string; fallbacks?: any[] }>;
  /** Override the Puter model chain on fallback. */
  puterModels?: (PuterModelId | string)[];
};

export type HybridResult = {
  source: "server" | "puter";
  provider: string;
  model: string;
  text: string;
  serverError?: string;
  puterFallbacks?: { model: string; error: string }[];
};

/**
 * Try server-side first; if it throws (every key + Lovable fallback failed),
 * route the same prompt through Puter.js. Net result: requests cannot fail
 * unless the user is offline.
 */
export async function callHybridBrain(opts: HybridOptions): Promise<HybridResult> {
  try {
    const r = await opts.serverCall();
    return { source: "server", provider: r.provider, model: r.model, text: r.text };
  } catch (serverErr: any) {
    const msg = serverErr?.message ?? String(serverErr);
    console.warn("[brain-hybrid] server brain failed, switching to Puter:", msg);
    const p = await callPuter({
      messages: opts.messages,
      fallbackModels: opts.puterModels,
    });
    return {
      source: "puter",
      provider: p.provider,
      model: p.model,
      text: p.text,
      serverError: msg,
      puterFallbacks: p.fallbacks,
    };
  }
}
