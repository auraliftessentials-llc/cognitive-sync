/**
 * Stripe webhook — handles subscription lifecycle. ?env=sandbox|live.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeEnvFromQuery, getWebhookSecret, PLAN_BY_PRICE } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getStripeEnvFromQuery(request.url);
        const stripe = createStripeClient(env);
        const sig = request.headers.get("stripe-signature");
        const body = await request.text();
        if (!sig) return new Response("missing sig", { status: 400 });

        let event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig, getWebhookSecret(env));
        } catch (e: any) {
          return new Response(`bad sig: ${e.message}`, { status: 401 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const s: any = event.data.object;
              const userId = s.metadata?.user_id;
              const priceId = s.metadata?.plan_price;
              if (userId && priceId) {
                await supabaseAdmin.from("subscriptions").update({
                  stripe_customer_id: s.customer,
                  stripe_subscription_id: s.subscription,
                  payment_method_attached: true,
                  tier: PLAN_BY_PRICE[priceId] ?? "operator",
                  status: "trialing",
                }).eq("user_id", userId);
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated": {
              const sub: any = event.data.object;
              const userId = sub.metadata?.user_id;
              const priceId = sub.items?.data?.[0]?.price?.lookup_key
                ?? sub.items?.data?.[0]?.price?.id;
              if (userId) {
                await supabaseAdmin.from("subscriptions").update({
                  stripe_subscription_id: sub.id,
                  status: sub.status,
                  tier: PLAN_BY_PRICE[priceId ?? ""] ?? "operator",
                  current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
                  payment_method_attached: !!sub.default_payment_method,
                }).eq("user_id", userId);
              }
              break;
            }
            case "customer.subscription.deleted": {
              const sub: any = event.data.object;
              const userId = sub.metadata?.user_id;
              if (userId) {
                await supabaseAdmin.from("subscriptions").update({
                  status: "canceled",
                  tier: "free_trial",
                }).eq("user_id", userId);
              }
              break;
            }
            case "invoice.payment_failed": {
              const inv: any = event.data.object;
              const userId = inv.subscription_details?.metadata?.user_id;
              if (userId) {
                await supabaseAdmin.from("subscriptions").update({ status: "past_due" }).eq("user_id", userId);
              }
              break;
            }
          }
        } catch (e) {
          console.error("webhook handler error", e);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
