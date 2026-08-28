import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Plug, RefreshCw, CheckCircle2, AlertTriangle, MinusCircle, XCircle,
  Share2, ChevronDown, Download, Play, Pause, Globe, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { getConnectorStatus, type ConnectorState } from "@/lib/connector-status.functions";
import {
  dailyStats, download, pushHistory, readHistory, summarize, toCsv, type Snapshot,
} from "@/lib/connector-history";

const ICONS = {
  ok: <CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />,
  unverified: <AlertTriangle className="h-3.5 w-3.5 text-brand-cyan" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  missing: <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />,
} as const;

const POLL_MS = 30_000;

export function ConnectorStatusPanel() {
  const [rows, setRows] = useState<ConnectorState[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getConnectorStatus();
      setRows(r.connectors);
      setHistory(pushHistory(summarize(r.connectors)));
      setLastAt(new Date().toLocaleTimeString());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHistory(readHistory());
    load();
  }, [load]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(() => { void load(); }, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, load]);

  const live = rows.filter((r) => r.status === "ok" || r.status === "unverified").length;
  const broken = rows.filter((r) => r.status === "failed").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  const days = dailyStats(history, 7);
  const today = days[days.length - 1];
  const prev = days[days.length - 2];
  const trend = today && prev ? today.uptimePct - prev.uptimePct : 0;

  const share = async () => {
    const url = `${window.location.origin}/status`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", { description: url });
    } catch {
      toast.info(url);
    }
  };

  const exportReport = (kind: "csv" | "json") => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "csv") {
      download(`connector-report-${stamp}.csv`, toCsv(history), "text/csv");
    } else {
      download(
        `connector-report-${stamp}.json`,
        JSON.stringify({ generated_at: new Date().toISOString(), connectors: rows, daily: days, history }, null, 2),
        "application/json",
      );
    }
    toast.success(`Report exported (${kind.toUpperCase()})`);
  };

  return (
    <section className="cathedral-card rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-brand-blue" />
          <h2 className="font-display text-lg tracking-wider">CONNECTOR STATUS</h2>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Globe className="h-3 w-3" /> global
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAuto((a) => !a)} title="Auto-refresh every 30s">
            {auto ? <Pause className="h-3 w-3 mr-1.5" /> : <Play className="h-3 w-3 mr-1.5" />}
            {auto ? "Auto 30s" : "Paused"}
          </Button>
          <Button size="sm" variant="outline" onClick={share}>
            <Share2 className="h-3 w-3 mr-1.5" /> Share
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportReport("csv")}>
            <Download className="h-3 w-3 mr-1.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportReport("json")}>
            <Download className="h-3 w-3 mr-1.5" /> JSON
          </Button>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Live" value={live} accent="var(--brand-green)" />
        <Stat label="Failing" value={broken} accent="var(--brand-violet)" />
        <Stat label="Not linked" value={missing} accent="var(--brand-cyan)" />
        <Stat
          label={`Uptime today ${trend ? (trend > 0 ? `+${trend}%` : `${trend}%`) : ""}`}
          value={today ? today.uptimePct : 0}
          suffix="%"
          accent="var(--brand-blue)"
        />
      </div>

      <ul className="space-y-1">
        {rows.map((r) => {
          const expanded = open === r.id;
          const hist = history.slice(-12).map((s) => s.states.find((x) => x.id === r.id));
          return (
            <li key={r.id} className="border-b border-border/40 last:border-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.id)}
                className="w-full flex items-center gap-2 text-sm py-1.5 text-left hover:opacity-80"
              >
                {ICONS[r.status]}
                <span className="flex-1 truncate">{r.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.gateway ? "gateway" : "direct"}
                </span>
                {r.latency_ms != null && (
                  <span className="text-[10px] font-mono text-muted-foreground">{r.latency_ms}ms</span>
                )}
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && (
                <div className="pb-3 pl-6 space-y-1.5 text-xs text-muted-foreground">
                  <div>Status: <span className="font-mono uppercase">{r.status}</span></div>
                  <div>Env var: <span className="font-mono">{r.envVar}</span></div>
                  <div>Mode: {r.gateway ? "Lovable connector gateway" : "Direct provider API"}</div>
                  {r.message && <div>Detail: {r.message}</div>}
                  <div className="flex items-center gap-1 pt-1">
                    <span className="mr-1">Recent checks:</span>
                    {hist.map((h, i) => (
                      <span
                        key={i}
                        title={h?.status ?? "n/a"}
                        className="h-3 w-1.5 rounded-sm"
                        style={{
                          background:
                            h?.status === "ok" ? "var(--brand-green)"
                            : h?.status === "unverified" ? "var(--brand-cyan)"
                            : h?.status === "failed" ? "hsl(var(--destructive))"
                            : "hsl(var(--muted))",
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {!loading && rows.length === 0 && (
          <li className="text-sm text-muted-foreground">No connector data available.</li>
        )}
      </ul>

      {days.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-brand-cyan" />
            <h3 className="font-display text-xs tracking-widest uppercase">Daily stats &amp; trends</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-normal">Day</th>
                  <th className="py-1 pr-3 font-normal">Checks</th>
                  <th className="py-1 pr-3 font-normal">Uptime</th>
                  <th className="py-1 pr-3 font-normal">Avg latency</th>
                  <th className="py-1 font-normal">Failures</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day} className="border-t border-border/30">
                    <td className="py-1 pr-3 font-mono">{d.day}</td>
                    <td className="py-1 pr-3">{d.checks}</td>
                    <td className="py-1 pr-3">{d.uptimePct}%</td>
                    <td className="py-1 pr-3">{d.avgLatency != null ? `${d.avgLatency}ms` : "—"}</td>
                    <td className="py-1">{d.failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
        {lastAt ? `Last check ${lastAt}` : "Awaiting first check"} · history {history.length} snapshots
      </p>
    </section>
  );
}

function Stat({ label, value, accent, suffix }: { label: string; value: number; accent: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="font-display text-2xl" style={{ color: accent }}>{value}{suffix}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
