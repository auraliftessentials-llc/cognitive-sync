import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Activity, Cloud, Bot, Server, Zap, RefreshCw, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  listConstellation,
  seedTrinity,
  probeAll,
  type ConstellationNode,
} from "@/lib/constellation.functions";

export const Route = createFileRoute("/constellation")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <Constellation />
      </AppShell>
    </RequireAuth>
  ),
});

const KIND_ICON: Record<string, any> = {
  project: Server,
  agent: Bot,
  cloud: Cloud,
  datastore: Server,
  bridge: Zap,
  external: ExternalLink,
};

const STATUS_RING: Record<string, string> = {
  online: "ring-emerald-400/60 shadow-[0_0_28px_-4px_rgba(52,211,153,0.55)]",
  degraded: "ring-amber-400/60 shadow-[0_0_28px_-4px_rgba(251,191,36,0.55)]",
  offline: "ring-rose-500/60 shadow-[0_0_28px_-4px_rgba(244,63,94,0.55)]",
  unknown: "ring-muted-foreground/30",
  provisioning: "ring-cyan-400/60 shadow-[0_0_28px_-4px_rgba(34,211,238,0.55)]",
};

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-400",
  degraded: "bg-amber-400",
  offline: "bg-rose-500",
  unknown: "bg-muted-foreground/40",
  provisioning: "bg-cyan-400 animate-pulse",
};

function Constellation() {
  const [nodes, setNodes] = useState<ConstellationNode[]>([]);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    try {
      const r = await listConstellation();
      setNodes(r.nodes);
      // Auto-seed once if empty
      if (r.nodes.length === 0 && !seeding) {
        setSeeding(true);
        const s = await seedTrinity();
        if (s.inserted > 0) toast.success(`Seeded ${s.inserted} Trinity nodes`);
        const r2 = await listConstellation();
        setNodes(r2.nodes);
        setSeeding(false);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load constellation");
    }
  };

  const runProbe = async () => {
    setBusy(true);
    try {
      const r = await probeAll();
      setNodes(r.nodes);
      toast.success(`Probed ${r.probed} nodes`);
    } catch (e: any) {
      toast.error(e?.message ?? "Probe failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = nodes.reduce<Record<string, ConstellationNode[]>>((acc, n) => {
    (acc[n.kind] ??= []).push(n);
    return acc;
  }, {});

  const onlineCount = nodes.filter((n) => n.status === "online").length;

  return (
    <div className="container max-w-7xl py-10 px-4 md:px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground mb-2">
            MERKABAH · Constellation
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-wide uppercase merkabah-text">
            Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Every node in your empire — Dominion, OMEGA, Oro Omega, AWS, agents — racing through one brain.
            <span className="text-foreground"> {onlineCount}/{nodes.length} online.</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={busy}>
            <Activity className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button onClick={runProbe} disabled={busy} className="bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white border-0">
            <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Probing…" : "Probe All Nodes"}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="glow-border rounded-xl p-10 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-cyan-400 mb-3" />
          <p className="text-sm text-muted-foreground">Seeding Trinity…</p>
        </div>
      )}

      {/* Grouped grid */}
      {Object.entries(grouped).map(([kind, list]) => (
        <section key={kind} className="mb-10">
          <div className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-3">
            {kind} · {list.length}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((node) => {
              const Icon = KIND_ICON[node.kind] ?? Server;
              return (
                <div
                  key={node.id}
                  className={`group relative rounded-xl bg-card/50 backdrop-blur border border-border/60 p-5 ring-1 ${STATUS_RING[node.status] ?? STATUS_RING.unknown} transition-all hover:-translate-y-0.5`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-violet-600/20 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-cyan-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{node.name}</div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {node.kind}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[node.status] ?? STATUS_DOT.unknown}`} />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {node.status}
                      </span>
                    </div>
                  </div>

                  {node.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{node.description}</p>
                  )}

                  {node.metadata && Object.keys(node.metadata).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {Object.entries(node.metadata).slice(0, 4).map(([k, v]) => (
                        <span key={k} className="text-[10px] rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-muted-foreground">
                          <span className="text-foreground/80">{k}:</span> {String(v).slice(0, 24)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-2 mt-2">
                    <span>
                      {node.last_health_at
                        ? `checked ${new Date(node.last_health_at).toLocaleTimeString()}`
                        : "never probed"}
                    </span>
                    {node.endpoint_url && (
                      <a
                        href={node.endpoint_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-cyan-300"
                      >
                        open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
