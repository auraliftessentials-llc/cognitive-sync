/**
 * Persistent brain status bar — sits in the AppShell sidebar footer and
 * polls health every 60s. Click to refresh on demand. Click a pill to see
 * raw error message in a tooltip.
 */
import { useEffect, useState, useTransition } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBrainHealthCached, refreshBrainHealth, type BrainHealthSnapshot } from "@/lib/health.functions";
import { RefreshCw, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RaceTelemetryPanel } from "@/components/RaceTelemetryPanel";

const POLL_MS = 60_000;

const STATUS_STYLES: Record<string, { dot: string; ring: string; label: string }> = {
  ok:           { dot: "bg-emerald-400",  ring: "ring-emerald-400/30",  label: "OK" },
  degraded:     { dot: "bg-amber-400",    ring: "ring-amber-400/30",    label: "Degraded" },
  down:         { dot: "bg-red-500",      ring: "ring-red-500/30",      label: "Down" },
  unconfigured: { dot: "bg-muted-foreground", ring: "ring-border/50",   label: "Not set" },
};

export function BrainStatusBar() {
  const [snap, setSnap] = useState<BrainHealthSnapshot | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [showRace, setShowRace] = useState(false);
  const cached = useServerFn(getBrainHealthCached);
  const refresh = useServerFn(refreshBrainHealth);

  const loadCached = () => {
    startTransition(async () => {
      try {
        const s = await cached();
        setSnap(s);
      } catch { /* silent */ }
    });
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      const s = await refresh();
      setSnap(s);
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    loadCached();
    // Kick a live refresh on first mount so we don't show stale data forever.
    void doRefresh();
    const id = setInterval(loadCached, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = [
    ...(snap?.providers ?? []).map((p) => ({ key: p.provider, label: p.label, status: p.status, message: p.message, http: p.http, latency: p.latency_ms })),
    ...(snap?.auxiliary ?? []).map((a) => ({ key: a.id, label: a.label, status: a.status, message: a.message, http: a.http, latency: a.latency_ms })),
  ];

  const downCount = all.filter((x) => x.status === "down").length;
  const degradedCount = all.filter((x) => x.status === "degraded").length;
  const overall: "ok" | "degraded" | "down" =
    downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "ok";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="border border-border/60 bg-muted/20 rounded-md px-2 py-2 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Activity className={cn("h-3 w-3", overall === "ok" ? "text-emerald-400" : overall === "degraded" ? "text-amber-400" : "text-red-500")} />
            <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Brains</span>
          </div>
          <button
            onClick={doRefresh}
            disabled={refreshing || pending}
            className="text-muted-foreground hover:text-foreground transition disabled:opacity-50"
            aria-label="Refresh brain health"
            title="Ping all providers"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {all.length === 0 && (
            <span className="text-[9px] text-muted-foreground italic">probing…</span>
          )}
          {all.map((x) => {
            const s = STATUS_STYLES[x.status] ?? STATUS_STYLES.down;
            return (
              <Tooltip key={x.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider hover:bg-background transition",
                      s.ring,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                    <span className="text-foreground/80 truncate max-w-[80px]">{shortLabel(x.label)}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="text-xs font-medium">{x.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.label}{x.http ? ` · HTTP ${x.http}` : ""}{x.latency ? ` · ${x.latency}ms` : ""}
                  </div>
                  {x.message && (
                    <div className="text-[10px] mt-1 break-words font-mono opacity-80">{x.message}</div>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

function shortLabel(label: string): string {
  return label
    .replace(" (Lovable)", "")
    .replace(" (xAI)", "")
    .replace("Gemini 3 Flash", "Gemini 3")
    .replace("Cloudflare", "CF");
}
