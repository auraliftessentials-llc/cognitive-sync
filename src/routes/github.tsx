import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github, Shield } from "lucide-react";
import { syncGithubRepos } from "@/lib/github.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/github")({
  component: () => (
    <RequireAuth><AppShell><Page /></AppShell></RequireAuth>
  ),
});

function Page() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    if (!token.trim()) return toast.error("Paste a GitHub token");
    setBusy(true);
    try {
      const r = await syncGithubRepos({ data: { token: token.trim() } });
      toast.success(`Synced: ${r.added} added, ${r.updated} updated (${r.total} total)`);
      setToken("");
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

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

      <div className="glow-border rounded-lg p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <Shield className="h-5 w-5 text-pulse flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Honest note:</strong> your token is sent to the server only for this one sync
            request and is <strong>not stored</strong>. Run sync again whenever you want fresh data. For best results, create
            a fine-grained token with <em>Contents: read</em> and <em>Metadata: read</em> scope at{" "}
            <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              github.com/settings/tokens
            </a>.
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="tok">GitHub Personal Access Token</Label>
            <Input
              id="tok"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              autoComplete="off"
            />
          </div>
          <Button onClick={sync} disabled={busy} className="w-full bg-primary text-primary-foreground hover:opacity-90">
            {busy ? "Syncing…" : "Sync repositories"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Heads up: this only fetches repos visible to the token. Private orgs may need additional scope.
      </p>
    </div>
  );
}
