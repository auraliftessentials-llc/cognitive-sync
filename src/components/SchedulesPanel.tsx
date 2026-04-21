import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Clock, Plus, RefreshCw, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import {
  listSchedules,
  createSchedule,
  toggleSchedule,
  deleteSchedule,
  type CliSchedule,
} from "@/lib/cli-schedules.functions";

const CRON_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily 9am UTC", value: "0 9 * * *" },
  { label: "Mon 9am UTC", value: "0 9 * * 1" },
];

export function SchedulesPanel() {
  const [rows, setRows] = useState<CliSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await listSchedules();
      setRows(r.schedules);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim() || !cron.trim() || !prompt.trim()) {
      toast.error("Name, cron, and prompt are required");
      return;
    }
    setCreating(true);
    try {
      await createSchedule({ data: { name: name.trim(), cron: cron.trim(), prompt: prompt.trim() } });
      setName(""); setPrompt("");
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

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-display tracking-wider text-sm">CLI SCHEDULES</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
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
        <Button onClick={handleCreate} disabled={creating} size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create schedule
        </Button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground italic">No schedules yet.</p>
        )}
        {rows.map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded border bg-card">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{s.name}</span>
                <code className="text-[10px] font-mono text-primary">{s.cron}</code>
                <Badge variant="outline" className="text-[10px]">{s.agent_slug}</Badge>
                {s.last_status === "ok" && <Badge variant="default" className="text-[10px]">ok</Badge>}
                {s.last_status === "error" && <Badge variant="destructive" className="text-[10px]">error</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{s.prompt}</p>
              {s.last_run_at && (
                <p className="text-[10px] text-muted-foreground">
                  Last run {new Date(s.last_run_at).toLocaleString()}
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
              <Switch checked={s.enabled} onCheckedChange={() => handleToggle(s)} />
              <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
