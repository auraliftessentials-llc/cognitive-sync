import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plug, RefreshCw, CheckCircle2, AlertTriangle, MinusCircle, XCircle } from "lucide-react";
import { getConnectorStatus, type ConnectorState } from "@/lib/connector-status.functions";

const ICONS = {
  ok: <CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />,
  unverified: <AlertTriangle className="h-3.5 w-3.5 text-brand-cyan" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  missing: <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />,
} as const;

export function ConnectorStatusPanel() {
  const [rows, setRows] = useState<ConnectorState[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getConnectorStatus();
      setRows(r.connectors);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const live = rows.filter((r) => r.status === "ok" || r.status === "unverified").length;
  const broken = rows.filter((r) => r.status === "failed").length;
  const missing = rows.filter((r) => r.status === "missing").length;

  return (
    <section className="cathedral-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-brand-blue" />
          <h2 className="font-display text-lg tracking-wider">CONNECTOR STATUS</h2>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Live" value={live} accent="var(--brand-green)" />
        <Stat label="Failing" value={broken} accent="var(--brand-violet)" />
        <Stat label="Not linked" value={missing} accent="var(--brand-cyan)" />
      </div>

      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-border/40 last:border-0">
            {ICONS[r.status]}
            <span className="flex-1 truncate">{r.label}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {r.gateway ? "gateway" : "direct"}
            </span>
            {r.latency_ms != null && (
              <span className="text-[10px] font-mono text-muted-foreground">{r.latency_ms}ms</span>
            )}
          </li>
        ))}
        {!loading && rows.length === 0 && (
          <li className="text-sm text-muted-foreground">No connector data available.</li>
        )}
      </ul>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="font-display text-2xl" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
