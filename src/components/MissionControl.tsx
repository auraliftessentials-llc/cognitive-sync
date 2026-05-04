import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMissionControl, type MissionControl } from "@/lib/mission-control.functions";
import { Activity, DollarSign, Cpu, Radio, Calendar, Sparkles } from "lucide-react";

export function MissionControlPanel() {
  const fn = useServerFn(getMissionControl);
  const [m, setM] = useState<MissionControl | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => fn().then((r) => alive && setM(r)).catch((e) => alive && setErr(e?.message ?? "error"));
    tick();
    const i = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(i); };
  }, [fn]);

  if (err) return <div className="text-xs text-destructive">Mission Control: {err}</div>;
  if (!m) return <div className="text-xs text-muted-foreground">Loading mission control…</div>;

  return (
    <section className="cathedral-card rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-brand-blue" />
        <h2 className="font-display text-lg tracking-wider">MISSION CONTROL</h2>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">live · 30s</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={DollarSign} label="Spend 24h"  value={`$${m.spend.last24hUsd.toFixed(2)}`} />
        <Stat icon={DollarSign} label="Spend 30d"  value={`$${m.spend.last30dUsd.toFixed(2)}`} />
        <Stat icon={Cpu}        label="AI calls 24h" value={m.spend.calls24h} />
        <Stat icon={Sparkles}   label="Intel 24h"  value={m.intel24h} />
        <Stat icon={Radio}      label="Bridges"    value={m.bridges.paired} />
        <Stat icon={Calendar}   label="Schedules"  value={`${m.schedules.enabled}/${m.schedules.total}`} />
        <Stat icon={Activity}   label="Sched fails" value={m.schedules.failures24h} accent={m.schedules.failures24h > 0 ? "destructive" : undefined} />
        <Stat icon={Cpu}        label="Brains live" value={m.brainHealth.filter((h) => h.status === "ok").length} />
      </div>

      {m.topModels.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Top models · 24h</div>
          <ul className="space-y-1.5 text-sm">
            {m.topModels.map((t) => (
              <li key={t.model} className="flex justify-between border-b border-border/30 py-1">
                <span className="font-mono text-xs">{t.model}</span>
                <span className="text-xs text-muted-foreground">{t.calls} calls · ${t.cost.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {m.brainHealth.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Brain health</div>
          <div className="flex flex-wrap gap-1.5">
            {m.brainHealth.map((h) => (
              <span key={h.provider} className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider ${
                h.status === "ok" ? "bg-brand-green/10 text-brand-green" :
                h.status === "degraded" ? "bg-yellow-500/10 text-yellow-500" :
                h.status === "unconfigured" ? "bg-muted text-muted-foreground" :
                "bg-destructive/10 text-destructive"
              }`}>
                {h.provider}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: any; accent?: "destructive" }) {
  return (
    <div className={`rounded-lg border bg-card/60 p-3 ${accent === "destructive" ? "border-destructive/40" : "border-border/60"}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
