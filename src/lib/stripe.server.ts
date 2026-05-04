/**
 * Stripe gateway — server-only. Uses Lovable's connector-managed sandbox key
 * in preview, swaps to LIVE key automatically when the env var is present
 * (provisioned after Stripe go-live claim).
 */
import Stripe from "stripe";

export type StripeEnv = "sandbox" | "live";

export function getStripeEnvFromQuery(url: string): StripeEnv {
  try {
    const u = new URL(url);
    return u.searchParams.get("env") === "live" ? "live" : "sandbox";
  } catch {
    return "sandbox";
  }
}

export function createStripeClient(env: StripeEnv = "sandbox"): Stripe {
  const key =
    env === "live"
      ? process.env.STRIPE_LIVE_API_KEY ?? process.env.STRIPE_SANDBOX_API_KEY
      : process.env.STRIPE_SANDBOX_API_KEY;
  if (!key) throw new Error(`Stripe ${env} key not configured`);
  return new Stripe(key, { apiVersion: "2025-09-30.clover" as any });
}

export function getWebhookSecret(env: StripeEnv): string {
  const secret =
    env === "live"
      ? process.env.PAYMENTS_LIVE_WEBHOOK_SECRET ?? process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET
      : process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET;
  if (!secret) throw new Error(`Webhook secret for ${env} not configured`);
  return secret;
}

export const PLAN_BY_PRICE: Record<string, "operator" | "architect" | "sovereign"> = {
  operator_monthly: "operator",
  operator_yearly: "operator",
  architect_monthly: "architect",
  architect_yearly: "architect",
  sovereign_monthly: "sovereign",
  sovereign_yearly: "sovereign",
};
