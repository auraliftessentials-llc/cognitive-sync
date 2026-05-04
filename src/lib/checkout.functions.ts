/**
 * Checkout — creates Stripe Checkout Sessions in subscription mode.
 * Card is required for the trial via payment_method_collection: 'always'.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient } from "./stripe.server";

const PRICE_IDS = [
  "operator_monthly", "operator_yearly",
  "architect_monthly", "architect_yearly",
  "sovereign_monthly", "sovereign_yearly",
] as const;

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    priceId: z.enum(PRICE_IDS),
    returnUrl: z.string().url().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as any;

    // Super admin bypass
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if ((roles ?? []).some((r: any) => r.role === "super_admin")) {
      return { url: null, skipped: true, reason: "super_admin_lifetime" };
    }

    const { data: userRow } = await supabaseAdmin
      .from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = user?.email;

    const stripe = createStripeClient("sandbox");

    // Resolve human-readable priceId -> real Stripe price via lookup_keys
    const prices = await stripe.prices.list({ lookup_keys: [data.priceId], limit: 1 });
    if (!prices.data.length) throw new Error(`Price ${data.priceId} not found in Stripe`);
    const stripePriceId = prices.data[0].id;

    let customerId = userRow?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      await supabaseAdmin.from("subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", userId);
    }

    const origin = data.returnUrl ?? "https://cognitivesync.io";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        trial_period_days: 3,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        metadata: { user_id: userId, plan_price: data.priceId },
      },
      success_url: `${origin}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?status=cancelled`,
      metadata: { user_id: userId, plan_price: data.priceId },
      allow_promotion_codes: true,
    });

    return { url: session.url, skipped: false };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    const { data: row } = await supabaseAdmin
      .from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (!row?.stripe_customer_id) throw new Error("No customer on file");
    const stripe = createStripeClient("sandbox");
    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: "https://cognitivesync.io/billing",
    });
    return { url: portal.url };
  });
