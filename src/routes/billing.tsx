import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { getAccessState, type AccessState } from "@/lib/subscription.functions";
import { CreditCard, Crown, ShieldCheck, Zap, Infinity as InfinityIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createCheckoutSession, createPortalSession } from "@/lib/checkout.functions";

const TIERS = [
  { id: "operator",  priceId: "operator_monthly",  name: "Operator",  price: "$49/mo",  tag: "Solo founders", features: [
    "Universal AI Router (12+ providers)", "Merkaba Link cross-device sync",
    "Mission Control dashboard", "Mac Bridge daemon", "100k AI tokens / day",
  ]},
  { id: "architect", priceId: "architect_monthly", name: "Architect", price: "$199/mo", tag: "Power operators", features: [
    "Everything in Operator", "Self-Evolving Intelligence Core (15-min scans)",
    "Specialist agents (CFO-Grok, Legal-Claude)", "Workspace + 5 seats",
    "1M AI tokens / day", "Priority routing",
  ]},
  { id: "sovereign", priceId: "sovereign_monthly", name: "Sovereign", price: "$999/mo", tag: "Enterprise", features: [
    "Everything in Architect", "Unlimited tokens (fair use)", "Dedicated cluster region",
    "SSO + SAML", "God-tier infrastructure control", "White-glove onboarding",
  ]},
] as const;

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — Cognitive Sync" }] }),
  component: () => (
    <RequireAuth><AppShell><Billing /></AppShell></RequireAuth>
  ),
});

function Billing() {
  const fn = useServerFn(getAccessState);
  const checkoutFn = useServerFn(createCheckoutSession);
  const portalFn = useServerFn(createPortalSession);
  const [s, setS] = useState<AccessState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { fn().then(setS).catch(() => {}); }, [fn]);

  const choose = async (priceId: string) => {
    setBusy(priceId);
    try {
      const r = await checkoutFn({ data: { priceId: priceId as any, returnUrl: window.location.origin } });
      if (r.skipped) { toast.success("Lifetime access — no checkout needed."); return; }
      if (r.url) window.location.href = r.url;
    } catch (e: any) { toast.error(e?.message ?? "Checkout failed"); }
    finally { setBusy(null); }
  };

  const portal = async () => {
    try { const r = await portalFn(); if (r.url) window.location.href = r.url; }
    catch (e: any) { toast.error(e?.message ?? "Portal unavailable"); }
  };

  if (!s) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-wide uppercase">Billing &amp; Plans</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cognitive Sync requires a valid payment method. Your 3-day free trial starts at signup;
          add a card to keep access after it ends.
        </p>
      </div>

      {/* Current status */}
      <div className="rounded-lg border border-primary/30 bg-card p-5">
        <div className="flex items-center gap-3">
          {s.isSuperAdmin ? <Crown className="h-5 w-5 text-primary" /> :
           s.tier === "free_trial" ? <Zap className="h-5 w-5 text-primary" /> :
           <ShieldCheck className="h-5 w-5 text-primary" />}
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide">
              {s.isSuperAdmin ? "Sovereign · Lifetime" : s.tier.replace("_", " ")}
            </div>
            <div className="text-xs text-muted-foreground">
              Status: {s.status}
              {s.trialEndsAt && !s.isSuperAdmin && s.tier === "free_trial" &&
                ` · trial ends ${new Date(s.trialEndsAt).toLocaleString()}`}
            </div>
          </div>
          {s.isSuperAdmin && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-primary">
              <InfinityIcon className="h-3.5 w-3.5" /> unlimited forever
            </span>
          )}
        </div>

        {!s.isSuperAdmin && !s.paymentMethodAttached && (
          <div className="mt-4 flex items-center gap-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <CreditCard className="h-4 w-4 text-destructive" />
            <span>No payment method on file. Add one to keep access after the trial.</span>
          </div>
        )}
      </div>

      {/* Tiers */}
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => (
          <div key={t.id} className="rounded-lg border border-border bg-card p-5 flex flex-col">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t.tag}</div>
            <div className="mt-1 text-xl font-bold">{t.name}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{t.price}</div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground flex-1">
              {t.features.map((f) => <li key={f}>· {f}</li>)}
            </ul>
            <Button
              className="mt-5 w-full"
              disabled={s.isSuperAdmin || busy === t.priceId}
              onClick={() => choose(t.priceId)}
            >
              {s.isSuperAdmin ? "Lifetime granted" :
               s.tier === t.id ? "Current plan" :
               busy === t.priceId ? "Opening checkout…" : `Choose ${t.name}`}
            </Button>
          </div>
        ))}
      </div>

      {!s.isSuperAdmin && s.paymentMethodAttached && (
        <Button variant="outline" onClick={portal}>Manage subscription</Button>
      )}

      <p className="text-xs text-muted-foreground">
        Payments flow to Auralift Essentials LLC. See <Link to="/legal" className="underline">Legal &amp; IP</Link>.
      </p>
    </div>
  );
}
