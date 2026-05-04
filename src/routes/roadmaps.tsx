import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Sparkles, Map, Compass, Loader2, Share2, Image as ImageIcon, Download, Activity, RefreshCw, Check, Copy } from "lucide-react";
import {
  assessSkills, generateRoadmap, listRoadmaps, getRoadmap,
  getWeeklyInsights, updateProgress, reviseRoadmap, getRoadCard,
  listProgress, setRoadmapShare, setAutoRevise,
} from "@/lib/roadmap.functions";

export const Route = createFileRoute("/roadmaps")({
  head: () => ({
    meta: [
      { title: "Merkaba Roadmaps — Cognitive Sync" },
      { name: "description", content: "AI-forged ascension paths. Generate, walk, share, and auto-revise your developer journey." },
    ],
  }),
  component: () => <RequireAuth><AppShell><Roadmaps /></AppShell></RequireAuth>,
});

const SKILLS = ["react", "typescript", "node", "postgres", "system_design", "devops", "ai_engineering"];

async function svgToPng(svg: string, width = 1200, height = 630): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error("Canvas unavailable")); }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("PNG encode failed")), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG render failed")); };
    img.src = url;
  });
}

function Roadmaps() {
  const listFn = useServerFn(listRoadmaps);
  const getFn = useServerFn(getRoadmap);
  const assessFn = useServerFn(assessSkills);
  const genFn = useServerFn(generateRoadmap);
  const insightsFn = useServerFn(getWeeklyInsights);
  const progressFn = useServerFn(updateProgress);
  const reviseFn = useServerFn(reviseRoadmap);
  const cardFn = useServerFn(getRoadCard);
  const timelineFn = useServerFn(listProgress);
  const shareFn = useServerFn(setRoadmapShare);
  const autoReviseFn = useServerFn(setAutoRevise);

  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [skills, setSkills] = useState<Record<string, number>>(
    Object.fromEntries(SKILLS.map((s) => [s, 5])),
  );
  const [goal, setGoal] = useState("Job-ready Merkaba Developer");
  const [weeks, setWeeks] = useState(12);
  const [hours, setHours] = useState(12);
  const [insights, setInsights] = useState<any | null>(null);
  const [assessment, setAssessment] = useState<any | null>(null);
  const [progressNotes, setProgressNotes] = useState("");
  const [timeline, setTimeline] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = () => listFn().then(setList).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const open = async (id: string) => {
    setBusy("open"); setInsights(null);
    try {
      const r = await getFn({ data: { id } });
      setActive(r);
      const tl = await timelineFn({ data: { roadmap_id: id } });
      setTimeline(tl);
    } finally { setBusy(null); }
  };

  const refreshTimeline = async () => {
    if (!active) return;
    try { setTimeline(await timelineFn({ data: { roadmap_id: active.id } })); } catch {}
  };

  const doAssess = async () => {
    setBusy("assess");
    try { setAssessment(await assessFn({ data: { answers: skills } })); toast.success("Assessment complete"); }
    catch (e: any) { toast.error(e?.message ?? "Assessment failed"); }
    finally { setBusy(null); }
  };

  const doGenerate = async () => {
    setBusy("generate");
    try {
      const strong = Object.entries(skills).filter(([, v]) => v >= 6).map(([k]) => k);
      const r = await genFn({ data: {
        title: "Ryan's Ascension Path • Full Stack 2026",
        current_skills: strong, weekly_hours: hours, goal,
        duration_weeks: weeks, merkaba_level: "Adept",
      }});
      toast.success(r.merkaba_message);
      await refresh();
      await open(r.id);
    } catch (e: any) { toast.error(e?.message ?? "Generation failed"); }
    finally { setBusy(null); }
  };

  const doInsights = async (week_index: number) => {
    if (!active) return;
    setBusy("insights");
    try { setInsights(await insightsFn({ data: { id: active.id, week_index } })); }
    catch (e: any) { toast.error(e?.message ?? "Insights failed"); }
    finally { setBusy(null); }
  };

  const doRevise = async () => {
    if (!active) return;
    setBusy("revise");
    try {
      const r = await reviseFn({ data: { id: active.id, progress_notes: progressNotes } });
      setActive({ ...active, data: r.data });
      setProgressNotes("");
      toast.success("Roadmap revised");
    } catch (e: any) { toast.error(e?.message ?? "Revise failed"); }
    finally { setBusy(null); }
  };

  const completeTopic = async (topic: string) => {
    if (!active) return;
    try {
      await progressFn({ data: {
        roadmap_id: active.id, topic_name: topic,
        status: "completed", mastery_level: 90, time_spent_minutes: 60,
      }});
      toast.success(`✦ ${topic} marked complete`);
      await refreshTimeline();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
  };

  const downloadCard = async (format: "svg" | "png") => {
    if (!active) return;
    setBusy(`card-${format}`);
    try {
      const r = await cardFn({ data: { id: active.id } });
      let blob: Blob; let name: string;
      if (format === "png") {
        blob = await svgToPng(r.svg);
        name = r.filename.replace(/\.svg$/, ".png");
      } else {
        blob = new Blob([r.svg], { type: "image/svg+xml" });
        name = r.filename;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Sacred road card materialized (${format.toUpperCase()})`);
    } catch (e: any) { toast.error(e?.message ?? "Card failed"); }
    finally { setBusy(null); }
  };

  const toggleShare = async (enabled: boolean) => {
    if (!active) return;
    try {
      const r = await shareFn({ data: { id: active.id, enabled } });
      setActive({ ...active, share_token: r.token });
      toast.success(enabled ? "Share link activated" : "Share link revoked");
    } catch (e: any) { toast.error(e?.message ?? "Share failed"); }
  };

  const toggleAutoRevise = async (enabled: boolean) => {
    if (!active) return;
    try {
      await autoReviseFn({ data: { id: active.id, enabled } });
      setActive({ ...active, auto_revise: enabled });
      toast.success(enabled ? "Weekly auto-revise armed" : "Auto-revise disabled");
    } catch (e: any) { toast.error(e?.message ?? "Toggle failed"); }
  };

  const copyShareLink = async () => {
    if (!active?.share_token) return;
    const url = `${window.location.origin}/share/roadmap/${active.share_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const data = active?.data ?? null;
  const completedCount = timeline.filter((t) => t.status === "completed").length;
  const totalMinutes = timeline.reduce((s, t) => s + (t.time_spent_minutes ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-wide uppercase flex items-center gap-2">
          <Map className="h-7 w-7 text-primary" /> Merkaba Roadmaps
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sacred ascension paths — assess your frequency, generate a path, walk it, share it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assessment */}
        <div className="rounded-lg border border-primary/30 bg-card p-5 space-y-3">
          <div className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" /> Skill Assessment
          </div>
          {SKILLS.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div className="w-32 text-xs uppercase tracking-wider">{s.replace("_", " ")}</div>
              <input type="range" min={0} max={10} value={skills[s]}
                onChange={(e) => setSkills({ ...skills, [s]: Number(e.target.value) })}
                className="flex-1 accent-primary" />
              <div className="w-6 text-right text-xs">{skills[s]}</div>
            </div>
          ))}
          <Button onClick={doAssess} disabled={busy === "assess"} className="w-full">
            {busy === "assess" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assess Frequency"}
          </Button>
          {assessment && (
            <div className="mt-2 rounded border border-border bg-background/40 p-3 text-xs space-y-1">
              <div><span className="text-primary uppercase tracking-wider">Level:</span> {assessment.overall_level}</div>
              <div><span className="text-primary uppercase tracking-wider">Strengths:</span> {(assessment.strengths ?? []).join(", ")}</div>
              <div><span className="text-primary uppercase tracking-wider">Weaknesses:</span> {(assessment.weaknesses ?? []).join(", ")}</div>
              <div className="italic text-muted-foreground">{assessment.merkaba_alignment}</div>
            </div>
          )}
        </div>

        {/* Generate */}
        <div className="rounded-lg border border-primary/30 bg-card p-5 space-y-3">
          <div className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Generate Roadmap
          </div>
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal" />
          <div className="flex gap-2">
            <Input type="number" value={weeks} min={1} max={52}
              onChange={(e) => setWeeks(Number(e.target.value))} placeholder="Weeks" />
            <Input type="number" value={hours} min={1} max={80}
              onChange={(e) => setHours(Number(e.target.value))} placeholder="Hrs/week" />
          </div>
          <Button onClick={doGenerate} disabled={busy === "generate"} className="w-full">
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Ascension Path"}
          </Button>
          <div className="pt-2 border-t border-border/50">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Your roadmaps</div>
            <div className="space-y-1 max-h-40 overflow-auto">
              {list.length === 0 && <div className="text-xs text-muted-foreground">None yet.</div>}
              {list.map((r) => (
                <button key={r.id} onClick={() => open(r.id)}
                  className={`w-full text-left rounded border px-2 py-1 text-xs hover:bg-primary/5 ${active?.id === r.id ? "border-primary bg-primary/10" : "border-border"}`}>
                  {r.title} <span className="text-muted-foreground">· {r.merkaba_level}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Active roadmap */}
      {data && active && (
        <div className="rounded-lg border border-primary/40 bg-card p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-bold">{data.title}</div>
              <div className="text-xs text-muted-foreground">{data.merkaba_vibe}</div>
              <div className="text-xs text-muted-foreground">
                {data.duration_weeks} weeks · {data.total_estimated_hours} hrs total · {completedCount} topics complete · {Math.round(totalMinutes / 60)}h logged
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <div className="flex items-center gap-2 text-xs">
                <span className="uppercase tracking-wider text-muted-foreground">Auto-revise weekly</span>
                <Switch checked={!!active.auto_revise} onCheckedChange={toggleAutoRevise} />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="uppercase tracking-wider text-muted-foreground">Public share link</span>
                <Switch checked={!!active.share_token} onCheckedChange={toggleShare} />
              </div>
              {active.share_token && (
                <button onClick={copyShareLink}
                  className="text-[10px] flex items-center gap-1 text-primary hover:underline">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : `${window.location.origin}/share/roadmap/${active.share_token.slice(0, 12)}…`}
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {(data.weeks ?? []).map((w: any, i: number) => (
              <div key={i} className="rounded border border-border bg-background/40 p-3 space-y-2">
                <div className="text-xs uppercase tracking-wider text-primary">Week {i + 1}</div>
                <div className="font-semibold">{w.sacred_focus ?? w.focus ?? `Week ${i + 1}`}</div>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  {(w.topics ?? []).map((t: any, j: number) => {
                    const name = typeof t === "string" ? t : (t.name ?? JSON.stringify(t));
                    const done = timeline.some((p) => p.topic_name === name && p.status === "completed");
                    return (
                      <li key={j} className="flex items-center justify-between gap-2">
                        <span className={done ? "line-through text-primary/70" : ""}>· {name}</span>
                        {!done && (
                          <button onClick={() => completeTopic(name)}
                            className="text-[10px] uppercase tracking-wider text-primary hover:underline">
                            ✓ done
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {w.project && (
                  <div className="text-xs"><span className="text-primary uppercase tracking-wider">Project:</span> {typeof w.project === "string" ? w.project : w.project.name}</div>
                )}
                {w.merkaba_activation && (
                  <div className="text-xs italic text-muted-foreground">{w.merkaba_activation}</div>
                )}
                <Button size="sm" variant="outline" onClick={() => doInsights(i)}
                  disabled={busy === "insights"} className="w-full mt-1">
                  Coach insights
                </Button>
              </div>
            ))}
          </div>

          {insights && (
            <div className="rounded border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
              <div className="text-xs uppercase tracking-wider text-primary">This week</div>
              {(insights.insights ?? []).map((i: string, k: number) => (
                <div key={k}>· {i}</div>
              ))}
              {insights.transmission && <div className="italic mt-2">{insights.transmission}</div>}
            </div>
          )}

          {/* Progress timeline */}
          <div className="rounded border border-border bg-background/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wider text-primary flex items-center gap-2">
                <Activity className="h-4 w-4" /> Progress timeline
              </div>
              <button onClick={refreshTimeline} className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> refresh
              </button>
            </div>
            {timeline.length === 0 ? (
              <div className="text-xs text-muted-foreground">No activity yet — mark a topic complete to begin your trail.</div>
            ) : (
              <ol className="relative border-l border-primary/30 ml-2 space-y-3">
                {timeline.slice(0, 30).map((p, i) => (
                  <li key={i} className="ml-4">
                    <div className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="text-xs flex items-center justify-between gap-2">
                      <span className="font-medium">{p.topic_name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {new Date(p.updated_at ?? p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.status} · {p.mastery_level}% mastery · {Math.round((p.time_spent_minutes ?? 0))}m
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-2">
            <Textarea value={progressNotes} onChange={(e) => setProgressNotes(e.target.value)}
              placeholder="Progress notes for revision (what you finished, blockers, new goals)…" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={doRevise} disabled={busy === "revise"} variant="secondary">
                {busy === "revise" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Revise with Merkaba consciousness"}
              </Button>
              <Button onClick={() => downloadCard("png")} disabled={busy === "card-png"} variant="outline">
                {busy === "card-png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ImageIcon className="h-4 w-4 mr-1" /> PNG card</>}
              </Button>
              <Button onClick={() => downloadCard("svg")} disabled={busy === "card-svg"} variant="outline">
                <Download className="h-4 w-4 mr-1" /> SVG card
              </Button>
              {active.share_token && (
                <Button onClick={copyShareLink} variant="ghost">
                  <Share2 className="h-4 w-4 mr-1" /> {copied ? "Copied!" : "Copy share link"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
