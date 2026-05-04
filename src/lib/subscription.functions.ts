/**
 * Subscription / trial / paywall server functions.
 * Super admins always have lifetime access.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AccessState = {
  tier: "free_trial" | "operator" | "architect" | "sovereign" | "lifetime";
  trialEndsAt: string | null;
  msRemaining: number;
  paymentMethodAttached: boolean;
  status: string;
  isSuperAdmin: boolean;
  hasActiveAccess: boolean;
  /** True if the user must add a card to keep using the service. */
  paywallTriggered: boolean;
};

export const getAccessState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessState> => {
    const { userId } = context;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuperAdmin = (roles ?? []).some((r: any) => r.role === "super_admin");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Auto-upgrade super admins to lifetime
    if (isSuperAdmin && sub && sub.tier !== "lifetime") {
      await supabaseAdmin
        .from("subscriptions")
        .update({ tier: "lifetime", status: "active", payment_method_attached: true })
        .eq("user_id", userId);
    }

    if (!sub) {
      // Backfill if trigger missed
      const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await supabaseAdmin.from("subscriptions").insert({
        user_id: userId,
        tier: isSuperAdmin ? "lifetime" : "free_trial",
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnds.toISOString(),
        status: isSuperAdmin ? "active" : "trialing",
        payment_method_attached: isSuperAdmin,
      });
      return {
        tier: isSuperAdmin ? "lifetime" : "free_trial",
        trialEndsAt: trialEnds.toISOString(),
        msRemaining: 3 * 24 * 60 * 60 * 1000,
        paymentMethodAttached: isSuperAdmin,
        status: isSuperAdmin ? "active" : "trialing",
        isSuperAdmin,
        hasActiveAccess: true,
        paywallTriggered: false,
      };
    }

    const tier = isSuperAdmin ? "lifetime" : (sub.tier as AccessState["tier"]);
    const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    const msRemaining = Math.max(0, trialEnd - Date.now());
    const paid = ["operator", "architect", "sovereign", "lifetime"].includes(tier);
    const trialActive = tier === "free_trial" && msRemaining > 0;
    const hasActiveAccess = isSuperAdmin || paid || trialActive;
    const paywallTriggered = !isSuperAdmin && !paid && !trialActive;

    return {
      tier,
      trialEndsAt: sub.trial_ends_at,
      msRemaining,
      paymentMethodAttached: !!sub.payment_method_attached || isSuperAdmin,
      status: sub.status,
      isSuperAdmin,
      hasActiveAccess,
      paywallTriggered,
    };
  });
