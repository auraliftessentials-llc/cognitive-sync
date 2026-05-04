import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAccessState, type AccessState } from "@/lib/subscription.functions";
import { Crown, ShieldCheck, Clock, CreditCard } from "lucide-react";
import { Link } from "@tanstack/react-router";

function fmt(ms: number) {
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function TrialBanner() {
  const fn = useServerFn(getAccessState);
  const [s, setS] = useState<AccessState | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fn();
        if (alive) setS(r);
      } catch {
        /* ignore */
      }
    })();
    return () => { alive = false; };
  }, [fn]);

  if (!s) return null;

  if (s.isSuperAdmin) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 flex items-center gap-3 text-sm">
        <Crown className="h-4 w-4 text-primary" />
        <span className="font-medium tracking-wide uppercase text-primary">Sovereign · Lifetime</span>
        <span className="text-muted-foreground">Ryan Stephen Puddy — unlimited access</span>
      </div>
    );
  }

  if (s.tier !== "free_trial") {
    return (
      <div className="rounded-lg border border-primary/20 bg-card px-4 py-2 flex items-center gap-3 text-sm">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="font-medium tracking-wide uppercase">{s.tier}</span>
        <span className="text-muted-foreground">subscription active</span>
      </div>
    );
  }

  const expired = s.msRemaining <= 0;
  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3 text-sm ${
      expired ? "border-destructive/40 bg-destructive/5" : "border-primary/20 bg-card"
    }`}>
      <Clock className={`h-4 w-4 ${expired ? "text-destructive" : "text-primary"}`} />
      <span className="font-medium uppercase tracking-wide">
        {expired ? "Trial expired" : "3-day free trial"}
      </span>
      <span className="text-muted-foreground">{fmt(s.msRemaining)}</span>
      {!s.paymentMethodAttached && (
        <Link
          to="/billing"
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs font-medium tracking-wide uppercase hover:opacity-90"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Add payment method
        </Link>
      )}
    </div>
  );
}
