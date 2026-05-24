import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Shield, KeyRound, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getAnthropicAdminStatus, getAnthropicOrgOverview } from "@/lib/anthropic-admin.functions";

export const Route = createFileRoute("/settings/anthropic-admin")({
  component: () => (
    <RequireAuth><AppShell><Page /></AppShell></RequireAuth>
  ),
});

function Page() {
  const { isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !isSuperAdmin) nav({ to: "/dashboard" });
  }, [loading, isSuperAdmin, nav]);

  useEffect(() => {
    if (isSuperAdmin) {
      getAnthropicAdminStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
    }
  }, [isSuperAdmin]);

  const load = async () => {
    setBusy(true);
    try {
      const r = await getAnthropicOrgOverview();
      setOverview(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load org overview");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !isSuperAdmin) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <div>
          <h1 className="font-display text-3xl tracking-wide uppercase">Anthropic Admin</h1>
          <p className="text-sm text-muted-foreground">
            Read-only org/workspace/key overview via <code>ANTHROPIC_ADMIN_KEY</code>. Throne-only.
          </p>
        </div>
      </header>

      <div className="glow-border rounded-lg p-6 space-y-4">
        {configured === null ? (
          <div className="text-sm text-muted-foreground">Checking secret…</div>
        ) : configured ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">ANTHROPIC_ADMIN_KEY configured</div>
              <div className="text-muted-foreground">Separate from your standard <code>ANTHROPIC_API_KEY</code>. Used only here.</div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">ANTHROPIC_ADMIN_KEY not set</div>
              <div className="text-muted-foreground">
                Add it via the secrets prompt (separate from your existing API key). Generate fresh at{" "}
                <a href="https://console.anthropic.com/settings/admin-keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  console.anthropic.com → Admin keys
                </a>.
              </div>
            </div>
          </div>
        )}

        <Button onClick={load} disabled={!configured || busy} className="bg-primary text-primary-foreground gap-2">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Loading…" : "Load org overview"}
        </Button>
      </div>

      {overview && (
        <div className="space-y-4">
          <Section title="Workspaces" payload={overview.workspaces} />
          <Section title="Users" payload={overview.users} />
          <Section title="API keys" payload={overview.apiKeys} />
        </div>
      )}
    </div>
  );
}

function Section({ title, payload }: { title: string; payload: any }) {
  return (
    <div className="rounded-lg border border-border/40 p-4 bg-card/40">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm tracking-wide uppercase">{title}</h2>
        {payload?.ok ? (
          <span className="text-xs text-emerald-400">ok</span>
        ) : (
          <span className="text-xs text-amber-400">err {payload?.status}</span>
        )}
      </div>
      <pre className="text-[11px] overflow-auto max-h-72 bg-background/50 p-2 rounded">
        {JSON.stringify(payload?.data ?? payload?.error ?? payload, null, 2)}
      </pre>
    </div>
  );
}
