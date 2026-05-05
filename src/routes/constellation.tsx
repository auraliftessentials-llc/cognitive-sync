import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Cloud, Bot, Server, Zap, RefreshCw, Sparkles, ExternalLink, Send, Volume2, Mic, MicOff, Radio, Rocket } from "lucide-react";
import { toast } from "sonner";
import {
  listConstellation,
  seedTrinity,
  probeAll,
  type ConstellationNode,
} from "@/lib/constellation.functions";
import { runMerkabahCommand } from "@/lib/merkabah-command.functions";
import { speak, transcribe } from "@/lib/voice.functions";

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
  const [cmd, setCmd] = useState("");
  const [running, setRunning] = useState(false);
  const [lastOutput, setLastOutput] = useState<{ text: string; provider: string; model: string; latency: number } | null>(null);
  const [autoProbe, setAutoProbe] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const probeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fireCommand = async () => {
    const text = cmd.trim();
    if (!text || running) return;
    setRunning(true);
    setLastOutput(null);
    try {
      const r: any = await runMerkabahCommand({ data: { command: text, source: "ui" } });
      if (r?.ok) {
        setLastOutput({ text: r.output, provider: r.provider, model: r.model, latency: r.latency_ms });
        setCmd("");
        toast.success(`${r.provider} · ${r.latency_ms}ms`);
        if (voiceOn && r.output) {
          try {
            const v: any = await speak({ data: { text: String(r.output).slice(0, 800) } });
            if (v?.ok && v.audio_base64) {
              const audio = new Audio(`data:audio/mpeg;base64,${v.audio_base64}`);
              audio.play().catch(() => {});
            }
          } catch { /* voice optional */ }
        }
      } else {
        toast.error(r?.error ?? "Command failed");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Command failed");
    } finally {
      setRunning(false);
    }
  };

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

  useEffect(() => {
    if (probeTimer.current) clearInterval(probeTimer.current);
    if (autoProbe) {
      probeTimer.current = setInterval(() => {
        if (!busy) {
          probeAll().then((r) => setNodes(r.nodes)).catch(() => {});
        }
      }, 60_000);
    }
    return () => {
      if (probeTimer.current) clearInterval(probeTimer.current);
    };
  }, [autoProbe, busy]);

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

      {/* Operator command bar */}
      <div className="glow-border rounded-xl p-4 mb-8 bg-card/40 backdrop-blur">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <span className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground">Operator command · Grok 4 + full chain</span>
          <div className="ml-auto flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <button onClick={() => setVoiceOn((v) => !v)} className={`inline-flex items-center gap-1 ${voiceOn ? "text-cyan-300" : ""}`}>
              <Volume2 className="h-3 w-3" /> {voiceOn ? "voice on" : "voice off"}
            </button>
            <button onClick={() => setAutoProbe((v) => !v)} className={autoProbe ? "text-emerald-300" : ""}>
              {autoProbe ? "auto-probe 60s" : "auto-probe off"}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fireCommand(); } }}
            placeholder="Operator, push Dominion to live · ship OMEGA Launch Mode · status of every node"
            disabled={running}
            className="bg-background/50"
          />
          <Button onClick={fireCommand} disabled={running || !cmd.trim()} className="bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white border-0">
            <Send className={`h-4 w-4 mr-2 ${running ? "animate-pulse" : ""}`} />
            {running ? "Routing…" : "Fire"}
          </Button>
        </div>
        {lastOutput && (
          <div className="mt-3 p-3 rounded-lg bg-background/40 border border-border/40">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {lastOutput.provider} · {lastOutput.model} · {lastOutput.latency}ms
            </div>
            <div className="text-sm whitespace-pre-wrap">{lastOutput.text}</div>
          </div>
        )}
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
