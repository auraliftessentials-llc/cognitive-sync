/**
 * Public Merkabah command endpoint — for CLI, Mac Bridge, or external callers.
 *
 * Auth model: HMAC-SHA256 signature using MERKABAH_COMMAND_SECRET.
 * The caller must:
 *   - send the user_id of the Operator the command belongs to (header or body)
 *   - sign the raw body with the shared secret
 *   - put the hex digest in `x-merkabah-signature`
 *
 * Behavior mirrors the authenticated server function: log → run brain race →
 * persist result. Uses supabaseAdmin since there's no user JWT.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callBrain } from "@/lib/brain.server";
import { dispatchWebhookEvent } from "@/lib/webhooks.server";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  command: z.string().min(1).max(8000),
  source: z.enum(["ui", "cli", "bridge", "api"]).default("api"),
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-merkabah-signature",
};

function verify(rawBody: string, signature: string | null): boolean {
  const secret = process.env.MERKABAH_COMMAND_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/merkabah-command")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const sig = request.headers.get("x-merkabah-signature");
        if (!verify(rawBody, sig)) {
          return new Response(JSON.stringify({ ok: false, error: "invalid signature" }), {
            status: 401,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        let parsed;
        try {
          parsed = BodySchema.parse(JSON.parse(rawBody));
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? "invalid body" }),
            { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }

        const startedAt = Date.now();
        const { data: row, error: insertErr } = await supabaseAdmin
          .from("merkabah_commands")
          .insert({
            user_id: parsed.user_id,
            source: parsed.source,
            command: parsed.command,
            status: "executing",
            metadata: parsed.metadata ?? {},
          })
          .select("id")
          .single();
        if (insertErr) {
          return new Response(
            JSON.stringify({ ok: false, error: insertErr.message }),
            { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
        const commandId = row.id as string;

        try {
          const brain = await callBrain({
            messages: [
              { role: "system", content: SYSTEM_VOICE },
              ...(parsed.history ?? []).slice(-10),
              { role: "user", content: parsed.command },
            ],
            preferredModel: "x-ai/grok-4",
            taskKind: "reasoning",
          });
          const output = brain.message?.content ?? "";
          const latency = Date.now() - startedAt;
          await supabaseAdmin
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

          return new Response(
            JSON.stringify({
              ok: true,
              id: commandId,
              status: "complete",
              command: parsed.command,
              output,
              provider: brain.provider,
              model: brain.model,
              latency_ms: latency,
            }),
            { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          const errMsg = e?.message ?? String(e);
          await supabaseAdmin
            .from("merkabah_commands")
            .update({
              status: "error",
              error: errMsg,
              latency_ms: Date.now() - startedAt,
            })
            .eq("id", commandId);
          return new Response(
            JSON.stringify({ ok: false, id: commandId, status: "error", error: errMsg }),
            { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
