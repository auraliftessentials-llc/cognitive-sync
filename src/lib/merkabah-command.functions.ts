/**
 * Merkabah command — authenticated server function.
 *
 * Logs the Operator's command, runs it through the server brain stack
 * (callBrain → Grok 4 → fallback chain), and persists the result.
 *
 * Mirrors what routeWithRace does on the client, but server-side so it
 * works for CLI/bridge callers and for cases where Puter isn't reachable.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callBrain } from "./brain.server";
import { dispatchWebhookEvent } from "./webhooks.server";

const InputSchema = z.object({
  command: z.string().min(1).max(8000),
  source: z.enum(["ui", "cli", "bridge", "api"]).default("ui"),
  history: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(20)
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  idempotency_key: z.string().min(8).max(120).optional(),
});

const SYSTEM_VOICE =
  "You are MERKABAH OS — the Master Operator's autonomous command intelligence. Calm precision. No hedging. End with the single highest-leverage next move.";

export const runMerkabahCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const startedAt = Date.now();

    // 1. Log the command immediately so the UI can react.
    const { data: row, error: insertErr } = await supabase
      .from("merkabah_commands")
      .insert({
        user_id: userId,
        source: data.source,
        command: data.command,
        status: "executing",
        metadata: data.metadata ?? {},
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;
    const commandId = row.id as string;

    // 2. Race through the server brain (Grok 4 first, fallback chain).
    try {
      const messages = [
        { role: "system" as const, content: SYSTEM_VOICE },
        ...(data.history ?? []).slice(-10),
        { role: "user" as const, content: data.command },
      ];
      const brain = await callBrain({
        messages,
        preferredModel: "x-ai/grok-4",
        taskKind: "reasoning",
      });
      const output = brain.message?.content ?? "";
      const latency = Date.now() - startedAt;

      await supabase
        .from("merkabah_commands")
        .update({
          status: "complete",
          result: {
            output,
            provider: brain.provider,
            model: brain.model,
            fallbacks: brain.fallbacks ?? [],
          },
          winner: brain.provider,
          latency_ms: latency,
        })
        .eq("id", commandId);

      return {
        ok: true,
        id: commandId,
        status: "complete" as const,
        command: data.command,
        output,
        provider: brain.provider,
        model: brain.model,
        latency_ms: latency,
      };
    } catch (e: any) {
      const errMsg = e?.message ?? String(e);
      await supabase
        .from("merkabah_commands")
        .update({
          status: "error",
          error: errMsg,
          latency_ms: Date.now() - startedAt,
        })
        .eq("id", commandId);
      return {
        ok: false,
        id: commandId,
        status: "error" as const,
        command: data.command,
        error: errMsg,
      };
    }
  });
