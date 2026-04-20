import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github, Shield, CheckCircle2, KeyRound, RefreshCw } from "lucide-react";
import { syncGithubRepos, getGithubTokenStatus } from "@/lib/github.functions";
import { toast } from "sonner";

const LAST_SYNC_KEY = "github:last-synced-at";

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export const Route = createFileRoute("/github")({
  component: () => (
    <RequireAuth><AppShell><Page /></AppShell></RequireAuth>
  ),
});

function Page() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [stored, setStored] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LAST_SYNC_KEY);
  });
  const [, forceTick] = useState(0);
  const autoRan = useRef(false);

  // Re-render every 30s so the relative timestamp stays fresh.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const sync = async (opts?: { silent?: boolean }) => {
    setBusy(true);
    try {
      const override = showOverride ? token.trim() : undefined;
      if (showOverride && !override) {
        toast.error("Paste a token or disable override");
        return;
      }
      const r = await syncGithubRepos({ data: { token: override } });
      const orgSummary = r.orgs?.length
        ? ` · orgs: ${r.orgs.join(", ")}`
        : " · no orgs found";
      if (!opts?.silent) {
        toast.success(
          `Synced: ${r.added} added, ${r.updated} updated (${r.total} total)${orgSummary}`,
        );
      } else if (r.added || r.updated) {
        toast.success(`Auto-sync: ${r.added} added, ${r.updated} updated`);
      }
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSync(now);
      setToken("");
    } catch (e: any) {
      if (!opts?.silent) toast.error(e?.message ?? "Sync failed");
      console.warn("github sync failed", e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    getGithubTokenStatus()
      .then((r) => {
        setStored(r.configured);
        // Auto-sync once on load if a stored token is available and the last
        // sync was more than 5 minutes ago (or never).
        if (r.configured && !autoRan.current) {
          autoRan.current = true;
          const last = localStorage.getItem(LAST_SYNC_KEY);
          const stale = !last || Date.now() - new Date(last).getTime() > 5 * 60_000;
          if (stale) void sync({ silent: true });
        }
      })
      .catch(() => setStored(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Github className="h-7 w-7 text-primary" />
        <h1 className="font-display text-3xl">GitHub sync</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Pull all your repos into the library in one shot. Each repo becomes a project with name, description, language,
        and last-pushed timestamp. Re-running keeps things in sync (existing repos are updated, not duplicated).
      </p>

      <div className="glow-border rounded-lg p-6 mb-6 space-y-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          <span>
            Last synced: <span className="text-foreground font-medium">{formatRelative(lastSync)}</span>
            {lastSync && (
              <span className="ml-1 opacity-60">({new Date(lastSync).toLocaleString()})</span>
            )}
          </span>
        </div>

        {stored === null ? (
          <div className="text-sm text-muted-foreground">Checking stored token…</div>
        ) : stored ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="text-foreground font-medium">Stored GITHUB_TOKEN active</div>
              <div className="text-muted-foreground">
                Sync uses your backend-stored token automatically. No paste needed.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-pulse flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              No backend GITHUB_TOKEN found. Paste a personal token below, or add one to backend secrets to skip this
              step. Create a fine-grained token with <em>Contents: read</em> and <em>Metadata: read</em> at{" "}
              <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                github.com/settings/tokens
              </a>.
            </div>
          </div>
        )}

        {(stored === false || showOverride) && (
          <div>
            <Label htmlFor="tok">
              {stored ? "Override token (optional)" : "GitHub Personal Access Token"}
            </Label>
            <Input
              id="tok"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              autoComplete="off"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => sync()} disabled={busy} className="bg-primary text-primary-foreground hover:opacity-90 flex-1 min-w-[160px]">
            {busy ? "Syncing…" : "Sync repositories"}
          </Button>
          {stored && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowOverride((v) => !v)}
              className="gap-2"
            >
              <KeyRound className="h-4 w-4" />
              {showOverride ? "Use stored token" : "Override token"}
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Heads up: this only fetches repos visible to the active token. Private orgs may need additional scope.
      </p>
    </div>
  );
}
