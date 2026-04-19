import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Brain, FolderGit2, Sparkles, Activity, ArrowRight } from "lucide-react";
import { generateSuggestions } from "@/lib/ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <RequireAuth><AppShell><Dashboard /></AppShell></RequireAuth>
  ),
});

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ projects: 0, active: 0, suggestions: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [topSuggestions, setTopSuggestions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const [{ count: total }, { count: active }, { count: sugCount }, { data: r }, { data: s }] =
      await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
        supabase.from("suggestions").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("dismissed", false),
        supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(5),
        supabase.from("suggestions").select("*").eq("user_id", user.id).eq("dismissed", false).order("created_at", { ascending: false }).limit(3),
      ]);
    setStats({ projects: total ?? 0, active: active ?? 0, suggestions: sugCount ?? 0 });
    setRecent(r ?? []);
    setTopSuggestions(s ?? []);
  };

  useEffect(() => { load(); }, [user]);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await generateSuggestions();
      toast.success(`Generated ${r.inserted} new suggestions`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-2 mb-2">
        <div className="pulse-dot" />
        <span className="text-xs font-display tracking-widest uppercase text-pulse">live pulse</span>
      </div>
      <h1 className="font-display text-3xl mb-8">The pulse</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Stat icon={FolderGit2} label="Projects" value={stats.projects} />
        <Stat icon={Activity} label="Active" value={stats.active} />
        <Stat icon={Sparkles} label="Open suggestions" value={stats.suggestions} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="glow-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg">Next moves</h2>
            <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
              <Brain className="h-3 w-3 mr-2" />
              {busy ? "Thinking…" : "Run agent"}
            </Button>
          </div>
          {topSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No suggestions yet. Add a few projects, then run the agent.
            </p>
          ) : (
            <ul className="space-y-3">
              {topSuggestions.map((s) => (
                <li key={s.id} className="border-l-2 border-primary/50 pl-3">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{s.body}</div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/suggestions" className="mt-4 inline-flex text-xs text-primary hover:underline">
            All suggestions <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </section>

        <section className="glow-border rounded-lg p-5">
          <h2 className="font-display text-lg mb-4">Recent activity</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Library is empty. <Link to="/projects" className="text-primary hover:underline">Add your first project</Link> or{" "}
              <Link to="/github" className="text-primary hover:underline">sync GitHub</Link>.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm py-1">
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="glow-border rounded-lg p-5">
      <Icon className="h-4 w-4 text-primary mb-2" />
      <div className="font-display text-3xl">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
