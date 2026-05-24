import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Crown, Zap, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Cognitive Sync / MERKABAH OS" },
      {
        name: "description",
        content:
          "MERKABAH OS pricing — Operator, Architect, Sovereign. Paid access only. Trial requires a payment method on file. Built by Ryan Puddy, Aura Lift Essentials LLC.",
      },
      { property: "og:title", content: "Pricing — Cognitive Sync / MERKABAH OS" },
      {
        property: "og:description",
        content: "Paid-only access. $49 Operator · $199 Architect · $999 Sovereign.",
      },
    ],
  }),
  component: PricingPage,
});

const TIERS = [
  {
    id: "operator",
    name: "Operator",
    price: "$49",
    period: "/month",
    tag: "Solo founders",
    icon: Zap,
    features: [
      "Universal AI Router (12+ providers)",
      "Merkaba Link cross-device sync",
      "Mission Control dashboard",
      "Mac Bridge daemon",
      "100k AI tokens / day",
    ],
  },
  {
    id: "architect",
    name: "Architect",
    price: "$199",
    period: "/month",
    tag: "Power operators",
    icon: ShieldCheck,
    highlight: true,
    features: [
      "Everything in Operator",
      "Self-Evolving Intelligence Core (15-min scans)",
      "Specialist agents (CFO-Grok, Legal-Claude)",
      "Workspace + 5 seats",
      "1M AI tokens / day",
      "Priority routing",
    ],
  },
  {
    id: "sovereign",
    name: "Sovereign",
    price: "$999",
    period: "/month",
    tag: "Enterprise",
    icon: Crown,
    features: [
      "Everything in Architect",
      "Unlimited tokens (fair use)",
      "Dedicated cluster region",
      "SSO + SAML",
      "God-tier infrastructure control",
      "White-glove onboarding",
    ],
  },
] as const;

function PricingPage() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 neural-grid opacity-30 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--gradient-radial)" }}
      />

      <header className="relative z-10 flex items-center justify-between p-6 max-w-6xl mx-auto">
        <Link to="/" className="font-display text-sm tracking-wider">
          MERKABAH OS
        </Link>
        <div className="flex gap-2">
          <Link to="/auth">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-24">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="pulse-dot" />
            <span className="text-xs font-display text-pulse tracking-widest uppercase">
              paid access · trial requires card
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-tight mb-6">
            One brain. <span className="glow-text text-primary">Pay to operate.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            MERKABAH OS is a proprietary operator system. Access is paid only — a
            valid payment method starts your trial; subscription begins at trial end.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {TIERS.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                className={`glow-border rounded-xl p-6 flex flex-col ${
                  "highlight" in t && t.highlight ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t.tag}
                  </span>
                </div>
                <div className="font-display text-2xl mb-1">{t.name}</div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="font-display text-4xl font-bold">{t.price}</span>
                  <span className="text-sm text-muted-foreground">{t.period}</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/auth">
                  <Button className="w-full" variant={"highlight" in t && t.highlight ? "default" : "outline"}>
                    Start {t.name} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        <div className="text-center text-xs text-muted-foreground max-w-2xl mx-auto space-y-2">
          <p>
            Cognitive Sync™ and MERKABAH OS™ are proprietary software of Aura Lift
            Essentials LLC. Use requires an active paid subscription or written
            lifetime grant. See <Link to="/" className="underline">LICENSE</Link>.
          </p>
          <p>
            © 2024–2026 Aura Lift Essentials LLC™ · Made & created by Ryan Puddy,
            Web3 Architect. Corporate use requires a written commercial license.
          </p>
        </div>
      </main>
    </div>
  );
}
