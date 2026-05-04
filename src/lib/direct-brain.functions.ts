/**
 * Direct brain — pinned xAI Grok 4 server peer for the race.
 *
 * Unlike commandRoute (which runs the full intent classifier + tool loop),
 * this is a thin pass-through to callBrain pinned to x-ai/grok-4. It exists
 * so routeWithRace can have a low-latency, predictable server competitor
 * that races Puter.js head-to-head.
 *
 * Fallback inside callBrain: if the user's xAI key is missing/down, it will
 * automatically degrade through xai-2 → openai-direct → anthropic → gemini →
 * lovable (per brain.server.ts chain). So this is still "unkillable" on the
 * server side, just biased to Grok 4.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callBrain, type BrainMessage } from "./brain.server";

export type DirectBrainResult = {
  ok: boolean;
  text: string;
  model: string;
  provider: string;
  fallbacks?: { provider: string; error: string }[];
};

export const directGrok = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messages: BrainMessage[] }) => {
    if (!Array.isArray(d?.messages) || d.messages.length === 0) {
      throw new Error("messages required");
    }
    return d;
  })
  .handler(async ({ data }): Promise<DirectBrainResult> => {
    const res = await callBrain({
      messages: data.messages,
      preferredModel: "x-ai/grok-4",
      taskKind: "reasoning",
      timeoutMs: 20_000,
    });
    return {
      ok: true,
      text: res.message.content ?? "",
      model: res.model,
      provider: res.provider,
      fallbacks: res.fallbacks,
    };
  });
