import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callBrain } from "./brain.server";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin")) {
    throw new Error("Forbidden: super_admin role required");
  }
}

// Get all users + roles + project counts + system stats
export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertSuperAdmin(supabase, userId);

    // List users via SECURITY DEFINER RPC (bypasses need for service role)
    const { data: usersList, error: usersErr } = await supabase.rpc("admin_list_users");
    if (usersErr) throw new Error(usersErr.message);
    const users = (usersList ?? []) as Array<{
      id: string;
      email: string | null;
      created_at: string;
      last_sign_in_at: string | null;
      email_confirmed_at: string | null;
    }>;

    // Admin RLS policies allow super_admin to read all of these
    const [rolesRes, projectsRes, profilesRes, suggestionsRes, convRes, msgRes] = await Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("projects").select("id, user_id, status, priority, last_worked_on, updated_at, name"),
      supabase.from("profiles").select("user_id, display_name, avatar_url, skills, focus_areas"),
      supabase.from("suggestions").select("id, user_id, dismissed, created_at"),
      supabase.from("conversations").select("id, user_id, updated_at"),
      supabase.from("messages").select("id, user_id, created_at"),
    ]);

    const rolesByUser = new Map<string, string[]>();
    (rolesRes.data ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });

    const projectsByUser = new Map<string, any[]>();
    (projectsRes.data ?? []).forEach((p: any) => {
      const arr = projectsByUser.get(p.user_id) ?? [];
      arr.push(p);
      projectsByUser.set(p.user_id, arr);
    });

    const profileByUser = new Map<string, any>();
    (profilesRes.data ?? []).forEach((p: any) => profileByUser.set(p.user_id, p));

    const suggCountByUser = new Map<string, number>();
    (suggestionsRes.data ?? []).forEach((s: any) => {
      suggCountByUser.set(s.user_id, (suggCountByUser.get(s.user_id) ?? 0) + 1);
    });

    const msgCountByUser = new Map<string, number>();
    (msgRes.data ?? []).forEach((m: any) => {
      msgCountByUser.set(m.user_id, (msgCountByUser.get(m.user_id) ?? 0) + 1);
    });

    const enriched = users.map((u) => {
      const projects = projectsByUser.get(u.id) ?? [];
      const profile = profileByUser.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "(no email)",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed: !!u.email_confirmed_at,
        roles: rolesByUser.get(u.id) ?? [],
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        project_count: projects.length,
        active_projects: projects.filter((p: any) => p.status === "active").length,
        last_activity:
          projects
            .map((p: any) => p.last_worked_on || p.updated_at)
            .filter(Boolean)
            .sort()
            .reverse()[0] ?? null,
        suggestion_count: suggCountByUser.get(u.id) ?? 0,
        message_count: msgCountByUser.get(u.id) ?? 0,
      };
    });

    const allProjects = projectsRes.data ?? [];
    const stats = {
      total_users: users.length,
      total_super_admins: enriched.filter((u) => u.roles.includes("super_admin")).length,
      total_admins: enriched.filter((u) => u.roles.includes("admin")).length,
      active_last_7d: users.filter(
        (u) =>
          u.last_sign_in_at &&
          Date.now() - new Date(u.last_sign_in_at).getTime() < 7 * 24 * 60 * 60 * 1000,
      ).length,
      total_projects: allProjects.length,
      total_active_projects: allProjects.filter((p: any) => p.status === "active").length,
      total_conversations: (convRes.data ?? []).length,
      total_messages: (msgRes.data ?? []).length,
      total_suggestions: (suggestionsRes.data ?? []).length,
    };

    const recentProjects = [...allProjects]
      .sort((a: any, b: any) => {
        const aT = new Date(a.last_worked_on || a.updated_at).getTime();
        const bT = new Date(b.last_worked_on || b.updated_at).getTime();
        return bT - aT;
      })
      .slice(0, 8);

    return { users: enriched, stats, recentProjects };
  });

// Grant or revoke a role
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { targetUserId: string; role: "admin" | "super_admin" | "user"; action: "grant" | "revoke" }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertSuperAdmin(supabase, userId);

    if (data.action === "revoke") {
      if (data.role === "super_admin" && data.targetUserId === userId) {
        const { data: supers } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "super_admin");
        if ((supers ?? []).length <= 1) {
          throw new Error("Cannot revoke the last super_admin (yourself).");
        }
      }
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.targetUserId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
      return { ok: true, action: "revoked" };
    }

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: data.targetUserId, role: data.role });
    if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
    return { ok: true, action: "granted" };
  });

// Delete a user entirely (via SECURITY DEFINER rpc)
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertSuperAdmin(supabase, userId);
    if (data.targetUserId === userId) throw new Error("Cannot delete your own account.");
    const { error } = await supabase.rpc("admin_delete_user", { _target: data.targetUserId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// AI-powered Fleet Insights
export const generateFleetInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertSuperAdmin(supabase, userId);

    const [usersRes, projectsRes, suggRes] = await Promise.all([
      supabase.rpc("admin_list_users"),
      supabase.from("projects").select("name, status, priority, tech_stack, tags, last_worked_on"),
      supabase.from("suggestions").select("title, kind, dismissed"),
    ]);

    const users = (usersRes.data ?? []) as any[];
    const projects = (projectsRes.data ?? []) as any[];
    const sugg = (suggRes.data ?? []) as any[];

    const techCount: Record<string, number> = {};
    projects.forEach((p: any) =>
      (p.tech_stack ?? []).forEach((t: string) => (techCount[t] = (techCount[t] ?? 0) + 1)),
    );
    const topTech = Object.entries(techCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ");

    const statusCount: Record<string, number> = {};
    projects.forEach((p: any) => (statusCount[p.status] = (statusCount[p.status] ?? 0) + 1));

    const ctx = `FLEET SNAPSHOT
Users: ${users.length}
Projects: ${projects.length} — by status: ${JSON.stringify(statusCount)}
Top tech: ${topTech || "—"}
Suggestions generated: ${sugg.length} (dismissed: ${sugg.filter((s: any) => s.dismissed).length})

Sample projects (top 15 by recency):
${[...projects]
  .sort((a: any, b: any) => new Date(b.last_worked_on || 0).getTime() - new Date(a.last_worked_on || 0).getTime())
  .slice(0, 15)
  .map((p: any, i: number) => `${i + 1}. [${p.status}|P${p.priority}] ${p.name} — ${(p.tech_stack ?? []).join("/")}`)
  .join("\n")}`;

    // Route through the sovereign brain (Grok-first, multi-provider fallback).
    const res = await callBrain({
      taskKind: "reasoning",
      reasoning_effort: "medium",
      messages: [
        {
          role: "system",
          content:
            "You are the Fleet Strategist for a multi-tenant project intelligence platform. Output sharp, executive-grade insights. No fluff. No 'as an AI'. Use markdown with short sections.",
        },
        {
          role: "user",
          content: `${ctx}

Produce a "Fleet Intelligence Briefing" with these sections:
### Health
2-3 bullets on overall fleet state.
### Concentration Risks
What tech/themes dominate? Where's the user over-extended?
### Hidden Opportunities
Cross-project leverage points or merges worth doing.
### Top 3 Moves
Numbered, imperative, specific (reference real project names).

Be terse. Maximum 250 words total.`,
        },
      ],
    });

    return { briefing: res.message.content ?? "", brain: `${res.provider} · ${res.model}` };
  });
