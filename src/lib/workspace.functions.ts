import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";

async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).some((r) => r.role === "super_admin");
}

async function assertCanManageWorkspace(supabase: any, userId: string, workspaceId: string) {
  if (await isSuperAdmin(supabase, userId)) return;
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as any)?.role;
  if (role !== "owner" && role !== "admin") {
    throw new Error("Forbidden: workspace admin role required");
  }
}

// List workspaces the current user belongs to
export const listMyWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const sa = await isSuperAdmin(supabase, userId);
    if (sa) {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, slug, owner_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return {
        workspaces: (data ?? []).map((w: any) => ({ ...w, role: "super_admin" as const })),
        isSuperAdmin: true,
      };
    }
    const { data: members, error } = await supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, slug, owner_id, created_at)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const workspaces = (members ?? [])
      .map((m: any) => m.workspace && { ...m.workspace, role: m.role })
      .filter(Boolean);
    return { workspaces, isSuperAdmin: false };
  });

// Get full detail for one workspace (members, invites, projects count)
export const getWorkspaceDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const sa = await isSuperAdmin(supabase, userId);

    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (wsErr) throw new Error(wsErr.message);
    if (!ws) throw new Error("Workspace not found");

    const { data: members } = await supabase
      .from("workspace_members")
      .select("id, user_id, role, created_at")
      .eq("workspace_id", data.workspaceId);

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", memberIds)
      : { data: [] };

    let invites: any[] = [];
    if (sa) {
      const { data } = await supabase
        .from("workspace_invites")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false });
      invites = data ?? [];
    } else {
      const { data: ownRole } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      if ((ownRole as any)?.role === "owner" || (ownRole as any)?.role === "admin") {
        const { data } = await supabase
          .from("workspace_invites")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .order("created_at", { ascending: false });
        invites = data ?? [];
      }
    }

    const profileByUser = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profileByUser.set(p.user_id, p));

    const enrichedMembers = (members ?? []).map((m: any) => ({
      ...m,
      display_name: profileByUser.get(m.user_id)?.display_name ?? null,
      avatar_url: profileByUser.get(m.user_id)?.avatar_url ?? null,
    }));

    const { count: projectCount } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId);

    return { workspace: ws, members: enrichedMembers, invites, projectCount: projectCount ?? 0 };
  });

// Create a new workspace
export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => {
    if (!d.name || d.name.length < 2 || d.name.length > 80) throw new Error("Name 2-80 chars");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const slug =
      data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) +
      "-" +
      Math.random().toString(36).slice(2, 8);
    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert({ name: data.name, slug, owner_id: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
    await writeAudit(supabase, {
      workspaceId: ws.id,
      actorId: userId,
      actorEmail: claims?.email,
      action: "workspace.created",
      targetType: "workspace",
      targetId: ws.id,
      metadata: { name: data.name },
    });
    return { workspace: ws };
  });

// Invite a member by email
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; email: string; role: "admin" | "manager" | "member" }) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new Error("Invalid email");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertCanManageWorkspace(supabase, userId, data.workspaceId);

    const { data: invite, error } = await supabase
      .from("workspace_invites")
      .insert({
        workspace_id: data.workspaceId,
        email: data.email.toLowerCase(),
        role: data.role,
        invited_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(supabase, {
      workspaceId: data.workspaceId,
      actorId: userId,
      actorEmail: claims?.email,
      action: "invite.created",
      targetType: "invite",
      targetId: invite.id,
      metadata: { email: data.email, role: data.role },
    });

    return { invite };
  });

// Accept an invite (called from /invite/$token)
export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: ws, error } = await supabase.rpc("accept_workspace_invite", { _token: data.token });
    if (error) throw new Error(error.message);
    return { workspaceId: ws as string };
  });

// Update member role
export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; memberUserId: string; role: "owner" | "admin" | "manager" | "member" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertCanManageWorkspace(supabase, userId, data.workspaceId);
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: data.role })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.memberUserId);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, {
      workspaceId: data.workspaceId,
      actorId: userId,
      actorEmail: claims?.email,
      action: "member.role_updated",
      targetType: "workspace_member",
      targetId: data.memberUserId,
      metadata: { role: data.role },
    });
    return { ok: true };
  });

// Remove member from workspace
export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; memberUserId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertCanManageWorkspace(supabase, userId, data.workspaceId);
    if (data.memberUserId === userId) throw new Error("Cannot remove yourself");
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.memberUserId);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, {
      workspaceId: data.workspaceId,
      actorId: userId,
      actorEmail: claims?.email,
      action: "member.removed",
      targetType: "workspace_member",
      targetId: data.memberUserId,
    });
    return { ok: true };
  });

// Revoke invite
export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inviteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { data: inv } = await supabase
      .from("workspace_invites")
      .select("workspace_id, email")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (!inv) throw new Error("Invite not found");
    await assertCanManageWorkspace(supabase, userId, (inv as any).workspace_id);
    const { error } = await supabase.from("workspace_invites").delete().eq("id", data.inviteId);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, {
      workspaceId: (inv as any).workspace_id,
      actorId: userId,
      actorEmail: claims?.email,
      action: "invite.revoked",
      targetType: "invite",
      targetId: data.inviteId,
      metadata: { email: (inv as any).email },
    });
    return { ok: true };
  });
