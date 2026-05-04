/**
 * Live Race Panel — at-a-glance status for the three brain peers.
 *
 * Shows:
 *   • Availability dot per peer (xAI Grok 4 server, Puter.js client, Merkabah router)
 *   • Last-race winner + latency for each peer (✓ / ✗ / —)
 *   • Overall winner + latency badge at the top
 *
 * Updates live via the race-telemetry subscribe channel (cross-tab synced).
 */
import { useEffect, useState } from "react";
import { Trophy, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRecent,
  subscribe,
  type RaceTelemetryEntry,
} from "@/lib/race-telemetry";
import { checkPuterAvailability, type PuterAvailability } from "@/lib/puter-health";

type PeerKey = "xai-grok-4" | "puter-delayed" | "merkabah-router";

const PEERS: { key: PeerKey; label: string; sub: string }[] = [
  { key: "xai-grok-4",      label: "Grok 4",     sub: "xAI · server" },
  { key: "puter-delayed",   label: "Puter.js",   sub: "Grok 4 · client" },
  { key: "merkabah-router", label: "Router",     sub: "tool-aware" },
];

export function LiveRacePanel() {
  const [last, setLast] = useState<RaceTelemetryEntry | null>(null);
  const [puter, setPuter] = useState<PuterAvailability>({ available: false, reason: "ssr" });

  useEffect(() => {
    const refreshPuter = () => setPuter(checkPuterAvailability());
    refreshPuter();
    const unsub = subscribe(() => {
      const recent = getRecent(1);
      setLast(recent[0] ?? null);
      refreshPuter();
    });
    const id = setInterval(refreshPuter, 10_000);
    window.addEventListener("online", refreshPuter);
    window.addEventListener("offline", refreshPuter);
    return () => {
      unsub();
      clearInterval(id);
      window.removeEventListener("online", refreshPuter);
      window.removeEventListener("offline", refreshPuter);
    };
  }, []);

  const trailByKey = new Map(
    (last?.trail ?? []).map((t) => [t.competitor, t]),
  );
  const winnerKey = last?.winner?.competitor;

  const availability = (key: PeerKey): { ok: boolean; note?: string } => {
    if (key === "puter-delayed") {
      return { ok: puter.available, note: puter.reason };
    }
    // Server peers: assume available unless the last race shows them failing
    // (the BrainStatusBar above already does deep health probes).
    const t = trailByKey.get(key);
    if (t && !t.ok) return { ok: false, note: t.error?.slice(0, 40) };
    return { ok: true };
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1">
          <Zap className="h-3 w-3" /> Live Race
        </span>
        {last?.winner ? (
          <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-mono tabular-nums">
            <Trophy className="h-2.5 w-2.5" />
            {last.winner.competitor.split(":")[0]} · {last.winner.latency_ms}ms
          </span>
        ) : (
          <span className="text-[9px] text-muted-foreground italic">idle</span>
        )}
      </div>

      <div className="space-y-1">
        {PEERS.map((p) => {
          const a = availability(p.key);
          const t = trailByKey.get(p.key);
          const isWinner = winnerKey === p.key;
          return (
            <div
              key={p.key}
              className={cn(
                "flex items-center justify-between gap-2 rounded border px-1.5 py-1 text-[9px]",
                isWinner
                  ? "border-emerald-400/50 bg-emerald-400/5"
                  : "border-border/40 bg-background/40",
              )}
              title={a.note ? `${p.label}: ${a.note}` : p.label}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    a.ok ? "bg-emerald-400 animate-pulse" : "bg-red-500",
                  )}
                />
                <div className="min-w-0">
                  <div className="text-foreground/90 font-mono truncate">{p.label}</div>
                  <div className="text-[8px] text-muted-foreground truncate">{p.sub}</div>
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums font-mono">
                {t ? (
                  <span className={t.ok ? "text-emerald-400" : "text-red-400"}>
                    {t.ok ? `${t.latency_ms}ms` : "fail"}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
                {isWinner && (
                  <div className="text-[8px] text-emerald-400/80 uppercase tracking-wider">won</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
