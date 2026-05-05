/**
 * Command webhook subscriptions — list/create/update/delete + delivery history.
 *
 * Webhooks fire on command.complete and command.error events. Payloads are
 * signed with HMAC-SHA256 using the per-webhook secret in the
 * `x-merkabah-signature` header. Delivery attempts are logged to
 * command_webhook_deliveries for audit + debug.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import crypto from "crypto";

const EVENTS = ["command.complete", "command.error", "command.executing"] as const;

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("command_webhooks")
      .select("id,name,url,events,enabled,last_delivery_at,last_status,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { webhooks: data ?? [] };
  });

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(80),
        url: z.string().url(),
        events: z.array(z.enum(EVENTS)).min(1).default(["command.complete", "command.error"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const secret = "whsec_" + crypto.randomBytes(24).toString("hex");
    const { data: row, error } = await supabase
      .from("command_webhooks")
      .insert({ user_id: userId, name: data.name, url: data.url, events: data.events, secret })
      .select("id,name,url,events,enabled,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { webhook: row, secret };
  });

export const updateWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        events: z.array(z.enum(EVENTS)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const patch: any = {};
    if (data.enabled != null) patch.enabled = data.enabled;
    if (data.events) patch.events = data.events;
    const { error } = await supabase.from("command_webhooks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase.from("command_webhooks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWebhookDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ webhook_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("command_webhook_deliveries")
      .select("id,webhook_id,command_id,event,status,http_status,error,attempt,duration_ms,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.webhook_id) q = q.eq("webhook_id", data.webhook_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { deliveries: rows ?? [] };
  });

export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { dispatchWebhookEvent } = await import("./webhooks.server");
    const result = await dispatchWebhookEvent({
      userId,
      event: "command.complete",
      payload: {
        test: true,
        command: "Test webhook delivery",
        output: "This is a test event from MERKABAH OS.",
        provider: "test",
        model: "test",
        latency_ms: 0,
        timestamp: new Date().toISOString(),
      },
      onlyWebhookId: data.id,
    });
    return result;
  });
