import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).some((r) => r.role === "super_admin");
}

// Time-series analytics for charts (signups, projects, messages)
export const getFleetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days: number }) => ({ days: Math.min(Math.max(d.days, 7), 90) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!(await isSuperAdmin(supabase, userId))) throw new Error("Forbidden");

    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const [usersRes, projectsRes, messagesRes, auditRes] = await Promise.all([
      supabase.rpc("admin_list_users"),
      supabase.from("projects").select("id, created_at, status, workspace_id, tech_stack"),
      supabase.from("messages").select("id, created_at"),
      supabase.from("audit_log").select("id, action, created_at").gte("created_at", since),
    ]);

    const users = (usersRes.data ?? []) as any[];
    const projects = (projectsRes.data ?? []) as any[];
    const messages = (messagesRes.data ?? []) as any[];
    const audit = (auditRes.data ?? []) as any[];

    const buckets: Record<string, { day: string; signups: number; projects: number; messages: number; audit: number }> = {};
    for (let i = 0; i < data.days; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { day: key, signups: 0, projects: 0, messages: 0, audit: 0 };
    }
    const bump = (iso: string | null, k: "signups" | "projects" | "messages" | "audit") => {
      if (!iso) return;
      const key = iso.slice(0, 10);
      if (buckets[key]) buckets[key][k]++;
    };
    users.forEach((u) => bump(u.created_at, "signups"));
    projects.forEach((p) => bump(p.created_at, "projects"));
    messages.forEach((m) => bump(m.created_at, "messages"));
    audit.forEach((a) => bump(a.created_at, "audit"));

    const series = Object.values(buckets).sort((a, b) => a.day.localeCompare(b.day));

    // Tech stack distribution (top 8)
    const techCount: Record<string, number> = {};
    projects.forEach((p) => (p.tech_stack ?? []).forEach((t: string) => (techCount[t] = (techCount[t] ?? 0) + 1)));
    const techDist = Object.entries(techCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));

    // Status distribution
    const statusCount: Record<string, number> = {};
    projects.forEach((p) => (statusCount[p.status] = (statusCount[p.status] ?? 0) + 1));
    const statusDist = Object.entries(statusCount).map(([name, value]) => ({ name, value }));

    // Workspace activity (top 10 by project count)
    const wsCount: Record<string, number> = {};
    projects.forEach((p) => p.workspace_id && (wsCount[p.workspace_id] = (wsCount[p.workspace_id] ?? 0) + 1));
    const wsIds = Object.keys(wsCount);
    let wsActivity: { name: string; projects: number }[] = [];
    if (wsIds.length) {
      const { data: ws } = await supabase.from("workspaces").select("id, name").in("id", wsIds);
      wsActivity = (ws ?? [])
        .map((w: any) => ({ name: w.name, projects: wsCount[w.id] ?? 0 }))
        .sort((a, b) => b.projects - a.projects)
        .slice(0, 10);
    }

    return { series, techDist, statusDist, wsActivity };
  });

// Audit log feed
export const getAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId?: string; limit?: number }) => ({
    workspaceId: d.workspaceId,
    limit: Math.min(d.limit ?? 100, 500),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("audit_log")
      .select("id, workspace_id, actor_id, actor_email, action, target_type, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

// Feature flags
export const getFeatureFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const [flagsRes, overridesRes] = await Promise.all([
      supabase.from("feature_flags").select("*").order("key"),
      supabase.from("user_feature_overrides").select("*").eq("user_id", userId),
    ]);
    return { flags: flagsRes.data ?? [], overrides: overridesRes.data ?? [] };
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    if (!(await isSuperAdmin(supabase, userId))) throw new Error("Forbidden");
    const { error } = await supabase
      .from("feature_flags")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      actor_id: userId,
      actor_email: claims?.email,
      action: "flag.toggled",
      target_type: "feature_flag",
      target_id: data.key,
      metadata: { enabled: data.enabled },
    });
    return { ok: true };
  });

export const setUserFeatureOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; key: string; enabled: boolean | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    if (!(await isSuperAdmin(supabase, userId))) throw new Error("Forbidden");
    if (data.enabled === null) {
      await supabase
        .from("user_feature_overrides")
        .delete()
        .eq("user_id", data.targetUserId)
        .eq("key", data.key);
    } else {
      await supabase
        .from("user_feature_overrides")
        .upsert(
          { user_id: data.targetUserId, key: data.key, enabled: data.enabled, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" },
        );
    }
    await supabase.from("audit_log").insert({
      actor_id: userId,
      actor_email: claims?.email,
      action: "flag.override_set",
      target_type: "user_feature_override",
      target_id: `${data.targetUserId}:${data.key}`,
      metadata: { enabled: data.enabled },
    });
    return { ok: true };
  });
