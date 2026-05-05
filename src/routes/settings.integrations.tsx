import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Webhook, Download, Plus, Trash2, Send, Copy, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  testWebhook,
} from "@/lib/webhooks.functions";
import { exportCommandsCsv } from "@/lib/command-export.functions";

export const Route = createFileRoute("/settings/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Merkabah OS" },
      { name: "description", content: "Webhooks, audit export, and external command relays for the Operator." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <Integrations />
      </AppShell>
    </RequireAuth>
  ),
});

type Hook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  last_delivery_at: string | null;
  last_status: string | null;
};

function Integrations() {
  const list = useServerFn(listWebhooks);
  const create = useServerFn(createWebhook);
  const update = useServerFn(updateWebhook);
  const del = useServerFn(deleteWebhook);
  const test = useServerFn(testWebhook);
  const deliveries = useServerFn(listWebhookDeliveries);
  const exportCsv = useServerFn(exportCommandsCsv);

  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliv, setDeliv] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState<{ id: string; secret: string } | null>(null);

  const refresh = async () => {
    try {
      const [h, d] = await Promise.all([list(), deliveries({ data: { limit: 30 } })]);
      setHooks((h as any).webhooks);
      setDeliv((d as any).deliveries);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  const onCreate = async () => {
    if (!name.trim() || !url.trim()) return toast.error("Name and URL required");
    setBusy(true);
    try {
      const r: any = await create({ data: { name: name.trim(), url: url.trim(), events: ["command.complete", "command.error"] } });
      setShowSecret({ id: r.webhook.id, secret: r.secret });
      setName("");
      setUrl("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (h: Hook) => {
    await update({ data: { id: h.id, enabled: !h.enabled } });
    refresh();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    await del({ data: { id } });
    refresh();
  };

  const onTest = async (id: string) => {
    const r: any = await test({ data: { id } });
    if (r.delivered) toast.success(`Delivered (${r.delivered})`);
    else toast.error(`Failed (${r.failed})`);
    refresh();
  };

  const onExport = async () => {
    setBusy(true);
    try {
      const r: any = await exportCsv({ data: { limit: 5000 } });
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `merkabah-commands-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Exported ${r.count} commands`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-6xl py-10 px-4 md:px-8 space-y-8">
      <div>
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground mb-2">MERKABAH · Integrations</div>
        <h1 className="font-display text-4xl tracking-wide uppercase merkabah-text">Webhooks & Export</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Stream every command event to your own systems. Export the full audit log as CSV for compliance.
        </p>
      </div>

      {/* Audit export */}
      <Card className="glow-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-display tracking-wide text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" /> Command Audit Export
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Download up to 5000 most recent commands as CSV — includes prompt, output, provider, model, latency, and errors.
          </div>
          <Button onClick={onExport} disabled={busy}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      {/* New webhook */}
      <Card className="glow-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-display tracking-wide text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="Friendly name (e.g. Slack relay)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="https://your-endpoint.example.com/hook" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <Button onClick={onCreate} disabled={busy}>
            <Plus className="h-4 w-4 mr-2" /> Create
          </Button>
          <p className="text-xs text-muted-foreground">
            Payloads are signed with HMAC-SHA256 in <code className="font-mono">x-merkabah-signature</code>. The secret is shown once after creation.
          </p>
        </CardContent>
      </Card>

      {showSecret && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-400">Save this secret — shown once</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-background/60 rounded px-3 py-2 break-all">{showSecret.secret}</code>
              <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(showSecret.secret); toast.success("Copied"); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSecret(null)}>Done</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhooks list */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="font-display tracking-wide text-base flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" /> Active Webhooks ({hooks.length})
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {hooks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No webhooks yet.</div>
          ) : (
            hooks.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{h.name}</span>
                    <Badge variant={h.enabled ? "default" : "outline"} className="text-[9px] uppercase">
                      {h.enabled ? "active" : "paused"}
                    </Badge>
                    {h.last_status && (
                      <Badge variant={h.last_status === "delivered" ? "secondary" : "destructive"} className="text-[9px] uppercase">
                        {h.last_status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">{h.url}</div>
                  <div className="text-[10px] text-muted-foreground">{h.events.join(" · ")}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onTest(h.id)}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Test
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onToggle(h)}>
                  {h.enabled ? "Pause" : "Resume"}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(h.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Recent deliveries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display tracking-wide text-base">Recent Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          {deliv.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No deliveries yet.</div>
          ) : (
            <div className="space-y-1 max-h-[360px] overflow-auto">
              {deliv.map((d) => (
                <div key={d.id} className="flex items-center gap-3 text-xs font-mono py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground w-20 shrink-0">{new Date(d.created_at).toLocaleTimeString()}</span>
                  {d.status === "delivered" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span className="text-primary w-32 shrink-0 truncate">{d.event}</span>
                  <span className="text-muted-foreground w-12">{d.http_status ?? "—"}</span>
                  <span className="text-muted-foreground w-16">{d.duration_ms ?? 0}ms</span>
                  <span className="truncate flex-1 text-muted-foreground">{d.error ?? "ok"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
