import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Terminal, KeyRound, Copy, Trash2, Plus, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { listCliTokens, createCliToken, revokeCliToken } from "@/lib/cli-tokens.functions";

type Row = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export function CliTokensPanel() {
  const [tokens, setTokens] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [reveal, setReveal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listCliTokens();
      setTokens(r.tokens as Row[]);
    } catch (e: any) { toast.error(e?.message ?? "Failed to load tokens"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Give the token a name (e.g. 'MacBook Pro')"); return; }
    setCreating(true);
    try {
      const r = await createCliToken({ data: { name: name.trim() } });
      setReveal(r.token);
      setName("");
      await load();
      toast.success("Token created — copy it now, it won't be shown again");
    } catch (e: any) { toast.error(e?.message ?? "Failed to create token"); }
    finally { setCreating(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this token? CLI sessions using it will stop working immediately.")) return;
    try {
      await revokeCliToken({ data: { id } });
      toast.success("Revoked");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed to revoke"); }
  };

  const copyToken = async () => {
    if (!reveal) return;
    await navigator.clipboard.writeText(reveal);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4 border-primary/30">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h2 className="font-display tracking-wider text-sm">NEURAL CLI</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Install the local CLI and run every agent tool, query your data, and trigger jobs from your terminal.
        </p>
        <pre className="bg-muted/40 border rounded p-3 text-xs font-mono overflow-x-auto">
{`# from this repo
cd cli && npm link        # exposes \`neural\` on your PATH

neural login              # paste your token
neural ask "what should I work on next?"
neural projects
neural zoho mail
neural gh sync
neural help               # full command list`}
        </pre>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="font-display tracking-wider text-sm">CLI TOKENS</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Token name (e.g. MacBook Pro)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={creating}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create token
          </Button>
        </div>

        {reveal && (
          <Card className="p-4 bg-primary/5 border-primary/40 space-y-3">
            <div className="text-xs font-display tracking-wider text-primary">
              ⚠ COPY THIS TOKEN NOW — it will never be shown again
            </div>
            <div className="flex gap-2">
              <code className="flex-1 bg-background border rounded px-3 py-2 text-xs font-mono break-all">
                {reveal}
              </code>
              <Button size="sm" variant="outline" onClick={copyToken}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <pre className="text-xs font-mono bg-background border rounded p-2 overflow-x-auto">
{`neural login --token ${reveal.slice(0, 16)}…`}
            </pre>
            <Button size="sm" variant="ghost" onClick={() => setReveal(null)}>I've saved it — dismiss</Button>
          </Card>
        )}

        <div className="space-y-2">
          {tokens.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground italic">No tokens yet. Create one above.</p>
          )}
          {tokens.map((t) => {
            const revoked = !!t.revoked_at;
            const expired = t.expires_at && new Date(t.expires_at) < new Date();
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.name}</span>
                    <code className="text-[10px] font-mono text-muted-foreground">{t.token_prefix}…</code>
                    {revoked && <Badge variant="destructive" className="text-[10px]">revoked</Badge>}
                    {!revoked && expired && <Badge variant="secondary" className="text-[10px]">expired</Badge>}
                    {!revoked && !expired && <Badge variant="outline" className="text-[10px]">active</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Created {new Date(t.created_at).toLocaleDateString()}
                    {t.last_used_at && ` · Last used ${new Date(t.last_used_at).toLocaleString()}`}
                    {!t.last_used_at && " · Never used"}
                  </div>
                </div>
                {!revoked && (
                  <Button size="sm" variant="ghost" onClick={() => handleRevoke(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
