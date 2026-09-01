import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Library as LibraryIcon,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  ExternalLink,
  Lock,
  Globe,
  DollarSign,
  Star,
  GitBranch,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getLibraryOverview,
  setProjectMeta,
  autoClassifyLibrary,
  type ProjectCategory,
  type RevenueStatus,
} from "@/lib/library.functions";
import { syncGithubRepos, syncGithubUser } from "@/lib/github.functions";
import { asArray, asRecord } from "@/lib/safe-data";

export const Route = createFileRoute("/library")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <Page />
      </AppShell>
    </RequireAuth>
  ),
});

const CATEGORY_META: Record<ProjectCategory, { label: string; tone: string }> = {
  master_os_omega: { label: "Master OS Omega", tone: "from-cyan-500/20 to-blue-500/10" },
  grokify: { label: "Grokify", tone: "from-violet-500/20 to-fuchsia-500/10" },
  oralift: { label: "Oralift Essentials", tone: "from-amber-500/20 to-rose-500/10" },
  agent_systems: { label: "Agent Systems", tone: "from-emerald-500/20 to-teal-500/10" },
  reference: { label: "Reference", tone: "from-slate-500/20 to-zinc-500/10" },
  archive: { label: "Archive", tone: "from-zinc-700/20 to-zinc-900/10" },
  unclassified: { label: "Unclassified", tone: "from-muted/40 to-muted/10" },
};

const REVENUE_META: Record<RevenueStatus, { label: string; class: string }> = {
  live: { label: "LIVE", class: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  ready_to_launch: { label: "READY", class: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  in_build: { label: "IN BUILD", class: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  idea: { label: "IDEA", class: "bg-slate-500/20 text-slate-300 border-slate-500/40" },
  paused: { label: "PAUSED", class: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
};

function Page() {
  const { isSuperAdmin, loading, session } = useAuth();
  // Sign-in is currently bypassed: only bounce a signed-in non-admin.
  const allowed = isSuperAdmin || !session;
  const nav = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof getLibraryOverview>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !allowed) nav({ to: "/dashboard" });
  }, [loading, allowed, nav]);

  const refresh = async () => {
    try {
      const d = await getLibraryOverview();
      setData(d);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load library");
    }
  };

  useEffect(() => {
    if (allowed) void refresh();
  }, [allowed]);

  const runSync = async () => {
    setBusy(true);
    try {
      // Try authenticated sync first (covers private repos via GITHUB_TOKEN)
      try {
        const r = await syncGithubRepos({ data: {} });
        toast.success(`Synced: ${r.added} added · ${r.updated} updated · ${r.total} total`);
      } catch {
        // Fallback: public profile sync
        const r = await syncGithubUser({ data: { username: "RYANPUDDY" } });
        toast.success(`Public sync: ${r.added} added · ${r.updated} updated · ${r.total} total`);
      }
      const c = await autoClassifyLibrary();
      if (c.changed > 0) toast.success(`Auto-classified ${c.changed} project(s)`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !allowed || !data) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Loading library cockpit…
      </div>
    );
  }

  const groups = (asRecord<Record<ProjectCategory, any[]>>((data as any).groups) ?? {}) as Partial<Record<ProjectCategory, any[]>>;
  const moneyFocus = asArray<any>((data as any).moneyFocus);
  const privacyAudit = asArray<any>((data as any).privacyAudit);
  const stats = asRecord<Record<string, number>>((data as any).stats);

  return (
    <div className="p-8 max-w-7xl space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <LibraryIcon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="font-display text-3xl tracking-wide uppercase">Project Library</h1>
            <p className="text-sm text-muted-foreground">
              The cockpit. Every RYANPUDDY repo, grouped by focus, with money-readiness flags.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/github"><GitBranch className="h-4 w-4 mr-1" />GitHub sync</Link>
          </Button>
          <Button onClick={runSync} disabled={busy} size="sm" className="bg-primary text-primary-foreground">
            <RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total" value={stats.total ?? 0} />
        <Stat label="Public" value={stats.public ?? 0} tone={(stats.public ?? 0) > 0 ? "alert" : "ok"} />
        <Stat label="Private" value={stats.private ?? 0} tone="ok" />
        <Stat label="Live" value={stats.live ?? 0} />
        <Stat label="Ready" value={stats.ready ?? 0} />
      </div>

      {/* Money Focus */}
      <section className="glow-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-xl tracking-wide uppercase">Money Focus</h2>
          <span className="text-xs text-muted-foreground">Live + ready-to-launch, by priority</span>
        </div>
        {moneyFocus.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No projects flagged Live or Ready yet. Tag a project below to populate this list.
          </p>
        ) : (
          <div className="grid gap-2">
            {moneyFocus.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded bg-muted/20">
                <div className="flex items-center gap-2 min-w-0">
                  <RevenuePill status={p.revenue_status} />
                  <div className="truncate font-medium">{p.name}</div>
                  <PriorityStars n={p.focus_priority ?? 3} />
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-[40%]">
                  {p.next_action || <em className="opacity-50">No next action set</em>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Privacy Audit */}
      {privacyAudit.length > 0 && (
        <section className="glow-border rounded-lg p-6 border-amber-500/40">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            <h2 className="font-display text-xl tracking-wide uppercase">Privacy Audit</h2>
            <span className="text-xs text-amber-300">{privacyAudit.length} public repo(s)</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            GitHub doesn't let third-party apps flip visibility. Click each repo and go to{" "}
            <em>Settings → Change visibility → Private</em>. Once flipped, the next sync clears it from this list.
          </p>
          <div className="grid gap-1.5">
            {privacyAudit.map((r: any) => (
              <a
                key={r.id}
                href={`${r.repo_url}/settings`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 py-1.5 px-3 rounded bg-amber-500/10 hover:bg-amber-500/20 text-sm transition"
              >
                <Globe className="h-3.5 w-3.5 text-amber-400" />
                <span className="flex-1 truncate">{r.github_full_name}</span>
                <span className="text-xs text-amber-300">Make private →</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Category groups */}
      {(Object.keys(CATEGORY_META) as ProjectCategory[]).map((cat) => {
        const items = asArray<any>(groups[cat]);
        if (cat === "unclassified" && items.length === 0) return null;
        if (cat === "archive" && items.length === 0) return null;
        return (
          <section key={cat} className={`rounded-lg p-5 bg-gradient-to-br ${CATEGORY_META[cat].tone} border border-border/40`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg tracking-wide uppercase">
                {CATEGORY_META[cat].label}
              </h3>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No projects yet. Tag one below.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {items.map((p: any) => (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    editing={editingId === p.id}
                    onEdit={() => setEditingId(editingId === p.id ? null : p.id)}
                    onSaved={() => { setEditingId(null); void refresh(); }}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "alert" }) {
  const toneClass = tone === "alert" && value > 0 ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/40 p-3 bg-card/40">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-display ${toneClass}`}>{value}</div>
    </div>
  );
}

function RevenuePill({ status }: { status: RevenueStatus }) {
  const m = REVENUE_META[status] ?? REVENUE_META.idea;
  return <span className={`text-[10px] px-2 py-0.5 rounded border font-medium tracking-wider ${m.class}`}>{m.label}</span>;
}

function PriorityStars({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3 w-3 ${i < n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

function ProjectCard({
  p,
  editing,
  onEdit,
  onSaved,
}: {
  p: any;
  editing: boolean;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<ProjectCategory>(p.category ?? "unclassified");
  const [revenue, setRevenue] = useState<RevenueStatus>(p.revenue_status ?? "idea");
  const [priority, setPriority] = useState<number>(p.focus_priority ?? 3);
  const [nextAction, setNextAction] = useState<string>(p.next_action ?? "");
  const [notes, setNotes] = useState<string>(p.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setProjectMeta({
        data: {
          id: p.id,
          category,
          revenue_status: revenue,
          focus_priority: priority,
          next_action: nextAction || null,
          notes: notes || null,
        },
      });
      toast.success("Saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate">
            {p.github_private === true ? (
              <Lock className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            ) : p.github_private === false ? (
              <Globe className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            ) : null}
            <span className="font-medium truncate">{p.name}</span>
          </div>
          {p.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <RevenuePill status={p.revenue_status ?? "idea"} />
          <PriorityStars n={p.focus_priority ?? 3} />
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {typeof p.github_stars === "number" && <span>★ {p.github_stars}</span>}
        {p.github_default_branch && <span>{p.github_default_branch}</span>}
        {p.github_last_commit_at && (
          <span>{new Date(p.github_last_commit_at).toLocaleDateString()}</span>
        )}
        {p.repo_url && (
          <a href={p.repo_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 hover:text-primary">
            <ExternalLink className="h-3 w-3" /> open
          </a>
        )}
      </div>
      {p.next_action && !editing && (
        <div className="text-xs px-2 py-1 rounded bg-primary/10 text-primary-foreground/80">
          → {p.next_action}
        </div>
      )}
      <Button size="sm" variant="ghost" onClick={onEdit} className="w-full text-xs h-7">
        {editing ? "Cancel" : "Edit tags & focus"}
      </Button>

      {editing && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
              >
                {(Object.keys(CATEGORY_META) as ProjectCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Revenue status</span>
              <select
                value={revenue}
                onChange={(e) => setRevenue(e.target.value as RevenueStatus)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
              >
                {(Object.keys(REVENUE_META) as RevenueStatus[]).map((r) => (
                  <option key={r} value={r}>{REVENUE_META[r].label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs space-y-1 block">
            <span className="text-muted-foreground">Focus priority (1–5)</span>
            <Input
              type="number"
              min={1}
              max={5}
              value={priority}
              onChange={(e) => setPriority(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
              className="h-8"
            />
          </label>
          <label className="text-xs space-y-1 block">
            <span className="text-muted-foreground">Next action (today)</span>
            <Input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Ship pricing page"
              className="h-8"
            />
          </label>
          <label className="text-xs space-y-1 block">
            <span className="text-muted-foreground">Private notes</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Strategy, blockers, ideas…"
            />
          </label>
          <Button size="sm" onClick={save} disabled={saving} className="w-full bg-primary text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
