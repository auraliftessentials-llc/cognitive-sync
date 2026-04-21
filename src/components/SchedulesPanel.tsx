import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Clock, Plus, RefreshCw, Trash2, Play, Mail, Loader2, History, Activity, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listSchedules,
  createSchedule,
  toggleSchedule,
  deleteSchedule,
  runScheduleNow,
  listScheduleRuns,
  getCronHeartbeat,
  type CliSchedule,
  type CliScheduleRun,
} from "@/lib/cli-schedules.functions";

const CRON_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily 9am UTC", value: "0 9 * * *" },
  { label: "Mon 9am UTC", value: "0 9 * * 1" },
];

function formatRelative(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export function SchedulesPanel() {
  const [rows, setRows] = useState<CliSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [historyRuns, setHistoryRuns] = useState<CliScheduleRun[]>([]);
  const [heartbeat, setHeartbeat] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([listSchedules(), getCronHeartbeat()]);
      setRows(r.schedules);
      setHeartbeat(h.heartbeat);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const handleCreate = async () => {
    if (!name.trim() || !cron.trim() || !prompt.trim()) {
      toast.error("Name, cron, and prompt are required");
      return;
    }
    setCreating(true);
    try {
      await createSchedule({ data: {
        name: name.trim(), cron: cron.trim(), prompt: prompt.trim(),
        notify_email: notifyEmail.trim() || undefined,
      } });
      setName(""); setPrompt(""); setNotifyEmail("");
      await load();
      toast.success("Schedule created");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (s: CliSchedule) => {
    setRows((cur) => cur.map((r) => (r.id === s.id ? { ...r, enabled: !s.enabled } : r)));
    try {
      await toggleSchedule({ data: { id: s.id, enabled: !s.enabled } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      await deleteSchedule({ data: { id } });
      await load();
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  };

  const handleRunNow = async (s: CliSchedule) => {
    setRunningId(s.id);
    try {
      const r = await runScheduleNow({ data: { id: s.id } });
      toast.success(`Ran "${s.name}" in ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}`, {
        description: r.output?.slice(0, 120),
      });
      await load();
      if (openHistoryId === s.id) await openHistory(s.id);
    } catch (e: any) {
      toast.error(`"${s.name}" failed`, { description: e?.message ?? "" });
      await load();
    } finally {
      setRunningId(null);
    }
  };

  const openHistory = async (id: string) => {
    setOpenHistoryId(id);
    try {
      const r = await listScheduleRuns({ data: { id } });
      setHistoryRuns(r.runs);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load history");
    }
  };

  const heartbeatAge = heartbeat ? Date.now() - new Date(heartbeat.ticked_at).getTime() : Infinity;
  const heartbeatHealthy = heartbeatAge < 120_000; // last tick within 2 min

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-display tracking-wider text-sm">CLI SCHEDULES</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={heartbeatHealthy ? "default" : "destructive"} className="text-[10px] gap-1">
            <Activity className={`h-2.5 w-2.5 ${heartbeatHealthy ? "" : "animate-pulse"}`} />
            cron {heartbeat ? formatRelative(heartbeat.ticked_at) : "never"}
          </Badge>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-2 p-3 rounded border bg-muted/20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input placeholder="Name (e.g. Morning briefing)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Cron (m h dom mon dow, UTC)" value={cron} onChange={(e) => setCron(e.target.value)} className="font-mono" />
        </div>
        <div className="flex flex-wrap gap-1">
          {CRON_PRESETS.map((p) => (
            <Button key={p.value} variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setCron(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Textarea
          placeholder="Prompt to run (e.g. 'Summarise unread Zoho mail and propose 3 actions')"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <Input
          placeholder="Notify on failure (optional email)"
          value={notifyEmail}
          onChange={(e) => setNotifyEmail(e.target.value)}
          type="email"
        />
        <Button onClick={handleCreate} disabled={creating} size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create schedule
        </Button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground italic">No schedules yet.</p>
        )}
        {rows.map((s) => {
          const cf = (s as any).consecutive_failures ?? 0;
          const tr = (s as any).total_runs ?? 0;
          const tf = (s as any).total_failures ?? 0;
          const reliability = tr > 0 ? Math.round(((tr - tf) / tr) * 100) : null;
          return (
            <div key={s.id} className="flex flex-col gap-2 p-3 rounded border bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.name}</span>
                    <code className="text-[10px] font-mono text-primary">{s.cron}</code>
                    <Badge variant="outline" className="text-[10px]">{s.agent_slug}</Badge>
                    {s.last_status === "ok" && <Badge variant="default" className="text-[10px]">ok</Badge>}
                    {s.last_status === "error" && <Badge variant="destructive" className="text-[10px]">error</Badge>}
                    {cf > 0 && <Badge variant="destructive" className="text-[10px]">{cf}× failing</Badge>}
                    {reliability !== null && (
                      <Badge variant="outline" className="text-[10px]">
                        {reliability}% · {tr} runs
                      </Badge>
                    )}
                    {s.notify_email && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Mail className="h-2.5 w-2.5" /> {s.notify_email}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{s.prompt}</p>
                  {s.last_run_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Last run {formatRelative(s.last_run_at)} · {new Date(s.last_run_at).toLocaleString()}
                    </p>
                  )}
                  {s.last_output && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        <Play className="h-3 w-3 inline mr-1" />Last output
                      </summary>
                      <pre className="mt-1 p-2 rounded bg-muted/40 font-mono text-[10px] whitespace-pre-wrap max-h-48 overflow-auto">
                        {s.last_output}
                      </pre>
                    </details>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" variant="outline"
                    onClick={() => handleRunNow(s)}
                    disabled={runningId === s.id}
                    title="Run now"
                  >
                    {runningId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => openHistoryId === s.id ? setOpenHistoryId(null) : openHistory(s.id)}
                    title="History"
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Switch checked={s.enabled} onCheckedChange={() => handleToggle(s)} />
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {openHistoryId === s.id && (
                <div className="mt-2 border-t pt-2 space-y-1">
                  {historyRuns.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">No runs yet.</p>
                  )}
                  {historyRuns.map((run) => (
                    <div key={run.id} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/40 last:border-0">
                      {run.status === "ok" ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                      ) : run.status === "error" ? (
                        <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-muted-foreground">
                          <span>{formatRelative(run.started_at)}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1">{run.trigger}</Badge>
                          {run.attempt > 1 && <Badge variant="outline" className="text-[9px] h-4 px-1">try #{run.attempt}</Badge>}
                          {run.duration_ms !== null && <span>{run.duration_ms}ms</span>}
                          {run.provider && <span className="text-primary">{run.provider}</span>}
                        </div>
                        {run.error && (
                          <pre className="mt-1 text-destructive font-mono text-[10px] whitespace-pre-wrap line-clamp-2">{run.error}</pre>
                        )}
                        {run.output && run.status === "ok" && (
                          <p className="text-foreground/80 line-clamp-1">{run.output}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
