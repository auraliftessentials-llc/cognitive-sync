/**
 * Unified Operator Identity — server functions for linking multiple
 * sign-in accounts (different emails / Google accounts) into one primary
 * Operator identity.
 *
 * Backfill-linking (admin-only): the super_admin can directly link any
 * existing auth.users row to themselves. For non-admin flows, future work
 * can add a token-based "verify ownership of email X then link" path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listIdentityLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    // Resolve to primary first so any linked sign-in shows the same view.
    const { data: primaryRow } = await supabaseAdmin.rpc("resolve_operator_identity", {
      _user_id: userId,
    });
    const primaryUserId = (primaryRow as string) ?? userId;

    const { data: links, error } = await supabaseAdmin
      .from("identity_links")
      .select("id, primary_user_id, linked_user_id, linked_email, linked_provider, verified_at, created_at")
      .eq("primary_user_id", primaryUserId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: primaryUser } = await supabaseAdmin.auth.admin.getUserById(primaryUserId);
    return {
      primary: primaryUser?.user
        ? { id: primaryUser.user.id, email: primaryUser.user.email ?? "" }
        : { id: primaryUserId, email: "" },
      links: links ?? [],
      isLinkedAccount: primaryUserId !== userId,
    };
  });

export const listLinkableAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) {
      throw new Error("Forbidden: super_admin only");
    }
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const { data: existing } = await supabaseAdmin
      .from("identity_links")
      .select("linked_user_id");
    const linkedSet = new Set((existing ?? []).map((r: any) => r.linked_user_id));
    return {
      candidates: (users?.users ?? [])
        .filter((u) => u.id !== userId && !linkedSet.has(u.id))
        .map((u) => ({
          id: u.id,
          email: u.email ?? "",
          provider: (u.app_metadata?.provider as string) ?? "email",
          last_sign_in_at: u.last_sign_in_at ?? null,
          created_at: u.created_at,
        })),
    };
  });

const LinkSchema = z.object({ linked_user_id: z.string().uuid() });

export const linkAccountAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: super_admin only");
    if (data.linked_user_id === userId) throw new Error("Cannot link account to itself");

    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.linked_user_id);
    if (!target?.user) throw new Error("Target user not found");
    const provider = (target.user.app_metadata?.provider as string) ?? "email";

    const { error } = await supabaseAdmin.from("identity_links").insert({
      primary_user_id: userId,
      linked_user_id: data.linked_user_id,
      linked_email: target.user.email ?? "",
      linked_provider: provider,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UnlinkSchema = z.object({ link_id: z.string().uuid() });

export const unlinkAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UnlinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("identity_links")
      .delete()
      .eq("id", data.link_id)
      .eq("primary_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
