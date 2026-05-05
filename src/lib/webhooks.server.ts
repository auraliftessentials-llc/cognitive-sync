/**
 * Webhook dispatcher — server-only helper that fires command events to all
 * matching webhook subscriptions for a user, signs the payload with
 * HMAC-SHA256, and logs every delivery attempt to command_webhook_deliveries.
 *
 * Failures don't throw — the brain command flow must complete even if webhook
 * delivery fails. Errors are captured in the delivery row instead.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import crypto from "crypto";

type WebhookEvent = "command.complete" | "command.error" | "command.executing";

export async function dispatchWebhookEvent(args: {
  userId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  commandId?: string;
  onlyWebhookId?: string;
}) {
  try {
    let q = supabaseAdmin
      .from("command_webhooks")
      .select("id,url,secret,events,enabled")
      .eq("user_id", args.userId)
      .eq("enabled", true);
    if (args.onlyWebhookId) q = q.eq("id", args.onlyWebhookId);
    const { data: hooks, error } = await q;
    if (error || !hooks?.length) return { delivered: 0, failed: 0 };

    const matching = hooks.filter((h: any) => (h.events as string[]).includes(args.event));
    if (!matching.length) return { delivered: 0, failed: 0 };

    const body = JSON.stringify({
      event: args.event,
      command_id: args.commandId ?? null,
      data: args.payload,
      delivered_at: new Date().toISOString(),
    });

    let delivered = 0;
    let failed = 0;
    await Promise.all(
      matching.map(async (h: any) => {
        const startedAt = Date.now();
        const sig = crypto.createHmac("sha256", h.secret).update(body).digest("hex");
        let httpStatus: number | null = null;
        let respText: string | null = null;
        let errorText: string | null = null;
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 10_000);
          const resp = await fetch(h.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-merkabah-event": args.event,
              "x-merkabah-signature": sig,
            },
            body,
            signal: ctrl.signal,
          });
          clearTimeout(timeout);
          httpStatus = resp.status;
          respText = (await resp.text()).slice(0, 1000);
          if (resp.ok) delivered++;
          else {
            failed++;
            errorText = `HTTP ${resp.status}`;
          }
        } catch (e: any) {
          failed++;
          errorText = e?.message ?? String(e);
        }
        const duration = Date.now() - startedAt;
        const status = errorText ? "failed" : "delivered";
        await Promise.all([
          supabaseAdmin.from("command_webhook_deliveries").insert({
            webhook_id: h.id,
            user_id: args.userId,
            command_id: args.commandId ?? null,
            event: args.event,
            payload: JSON.parse(body),
            status,
            http_status: httpStatus,
            response_body: respText,
            error: errorText,
            duration_ms: duration,
          }),
          supabaseAdmin
            .from("command_webhooks")
            .update({ last_delivery_at: new Date().toISOString(), last_status: status })
            .eq("id", h.id),
        ]);
      }),
    );
    return { delivered, failed };
  } catch (e) {
    console.error("dispatchWebhookEvent failed", e);
    return { delivered: 0, failed: 0 };
  }
}
