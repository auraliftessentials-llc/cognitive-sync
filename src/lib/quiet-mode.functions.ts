/**
 * Quiet Mode — Operator-facing toggle.
 *
 * Only the super_admin (the Operator) can flip this. The intent lives in
 * src/lib/quiet-mode.server.ts. This file is the door; that file is the why.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { clearQuietModeCache } from "@/lib/quiet-mode.server";

export const getQuietMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("feature_flags")
      .select("enabled, updated_at, description")
      .eq("key", "quiet_mode")
      .maybeSingle();
    return {
      enabled: !!data?.enabled,
      updatedAt: data?.updated_at ?? null,
      description: data?.description ?? null,
    };
  });

export const setQuietMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isSuperAdmin) throw new Response("Only the Operator can change Quiet Mode", { status: 403 });

    const { error } = await supabaseAdmin
      .from("feature_flags")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("key", "quiet_mode");
    if (error) throw new Response(error.message, { status: 500 });

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: data.enabled ? "quiet_mode.enabled" : "quiet_mode.disabled",
      target_type: "feature_flag",
      target_id: "quiet_mode",
      metadata: { intent: "Operator paused autonomous activity to think with humans" },
    });

    clearQuietModeCache();
    return { ok: true, enabled: data.enabled };
  });
