/**
 * Race telemetry panel — live view of the brain race.
 *
 * Shows per-competitor win counts, p50/p95 latencies, and a "pin" control
 * so the operator can lock a preferred peer (it gets zero head-start on
 * every race, effectively making it the default).
 *
 * Cross-tab synced — pin from one tab, every tab updates instantly.
 */
import { useEffect, useState } from "react";
import {
  clearTelemetry,
  getRecent,
  getStats,
  getUserPinnedProvider,
  setUserPinnedProvider,
  subscribe,
  type ProviderStat,
  type RaceTelemetryEntry,
} from "@/lib/race-telemetry";
import { Pin, PinOff, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function RaceTelemetryPanel() {
  const [stats, setStats] = useState<ProviderStat[]>([]);
  const [recent, setRecent] = useState<RaceTelemetryEntry[]>([]);
  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    setPinned(getUserPinnedProvider());
    const unsub = subscribe(() => {
      setStats(getStats());
      setRecent(getRecent(8));
      setPinned(getUserPinnedProvider());
    });
    return unsub;
  }, []);

  if (stats.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground italic px-1 py-2">
        No race data yet. Send a command to populate.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1">
          <Zap className="h-3 w-3" /> Race Stats
        </span>
        <button
          onClick={clearTelemetry}
          className="text-[9px] text-muted-foreground hover:text-red-400 transition flex items-center gap-1"
          title="Clear telemetry log"
        >
          <Trash2 className="h-2.5 w-2.5" /> reset
        </button>
      </div>

      <div className="space-y-1">
        {stats.map((s) => {
          const isPinned = pinned === s.competitor;
          return (
            <div
              key={s.competitor}
              className={cn(
                "flex items-center justify-between gap-1 rounded border border-border/40 bg-background/40 px-1.5 py-1 text-[9px]",
                isPinned && "border-brand-blue/60 bg-brand-blue/5",
              )}
            >
              <div className="flex items-center gap-1 min-w-0">
                <button
                  onClick={() => setUserPinnedProvider(isPinned ? null : s.competitor)}
                  className={cn(
                    "shrink-0 transition",
                    isPinned ? "text-brand-blue" : "text-muted-foreground hover:text-foreground",
                  )}
                  title={isPinned ? "Unpin (let race pick)" : "Pin as default — zero head-start"}
                  aria-label={isPinned ? "Unpin provider" : "Pin provider"}
                >
                  {isPinned ? <Pin className="h-2.5 w-2.5" /> : <PinOff className="h-2.5 w-2.5" />}
                </button>
                <span className="truncate text-foreground/80 font-mono">{s.competitor}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-muted-foreground tabular-nums">
                <span title="Wins">{s.wins}w</span>
                <span title="p50 latency">{s.p50_ms}ms</span>
                <span title="p95 latency" className="opacity-60">{s.p95_ms}ms</span>
              </div>
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div className="pt-1">
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-1">Recent</div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {recent.map((r, i) => (
              <div key={`${r.ts}-${i}`} className="flex items-center justify-between gap-1 text-[9px]">
                <span className="truncate text-muted-foreground/70 font-mono">
                  {r.prompt_preview.slice(0, 30)}
                </span>
                <span className={cn(
                  "shrink-0 font-mono tabular-nums",
                  r.winner ? "text-emerald-400" : "text-red-400",
                )}>
                  {r.winner ? `${r.winner.competitor.split(":")[0]}/${r.winner.latency_ms}ms` : "fail"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
