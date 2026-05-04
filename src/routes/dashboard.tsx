import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { MerkabahHero } from "@/components/MerkabahHero";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Brain, FolderGit2, Sparkles, Activity, ArrowRight, Crown, Terminal, Mail, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { generateSuggestions } from "@/lib/ai.functions";
import { getResendStatus, sendResendTest, type ResendStatus } from "@/lib/resend.functions";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CEOVoiceHub } from "@/components/CEOVoiceHub";
import { TrialBanner } from "@/components/TrialBanner";
import { FrontierIntelPanel } from "@/components/FrontierIntelPanel";

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

  const handle = (user?.email ?? "operator").split("@")[0];
  const operatorName = "THE OPERATOR";
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late watch" : hour < 12 ? "Sunrise" : hour < 18 ? "Daylight" : "Twilight";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <MerkabahHero
        operatorName={operatorName}
        greeting={`${greeting}, ${handle}`}
        subline="Your sovereign command layer. Brain-switch agents, work the pipeline, and ship moves that move markets."
        kpis={[
          { label: "Projects",      value: stats.projects,    accent: "var(--brand-blue)" },
          { label: "Active",        value: stats.active,      accent: "var(--brand-cyan)" },
          { label: "Open moves",    value: stats.suggestions, accent: "var(--brand-violet)" },
          { label: "Status",        value: "LIVE",            accent: "var(--brand-green)" },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <QuickAction to="/console" icon={Terminal} title="Open Console" subtitle="Terminal · slash commands · Zoho live">
          <kbd className="text-[10px] border rounded px-1">⌘K</kbd>
        </QuickAction>
        <QuickAction to="/agents" icon={Crown} title="CEO Grok" subtitle="Marketing genius · brain-switch · xAI">
          <span className="text-[10px] text-brand-blue font-bold">𝕏</span>
        </QuickAction>
        <QuickAction to="/suggestions" icon={Sparkles} title="Next moves" subtitle="AI-generated, ranked, actionable" />
      </div>

      <TrialBanner />

      <CEOVoiceHub />

      <FrontierIntelPanel />

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="cathedral-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg tracking-wider">NEXT MOVES</h2>
            <Button size="sm" variant="outline" onClick={generate} disabled={busy} className="border-brand-blue/40 text-brand-blue hover:bg-brand-blue/10">
              <Brain className="h-3 w-3 mr-2" />
              {busy ? "Thinking…" : "Generate"}
            </Button>
          </div>
          {topSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No suggestions yet. Add a few projects, then run the agent.
            </p>
          ) : (
            <ul className="space-y-3">
              {topSuggestions.map((s) => (
                <li key={s.id} className="border-l-2 border-brand-blue/60 pl-3 animate-fade-in-up">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{s.body}</div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/suggestions" className="mt-4 inline-flex text-xs text-brand-blue hover:underline">
            All moves <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </section>

        <section className="cathedral-card rounded-xl p-5">
          <h2 className="font-display text-lg mb-4 tracking-wider">RECENT ACTIVITY</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Library is empty. <Link to="/projects" className="text-brand-blue hover:underline">Add your first project</Link> or{" "}
              <Link to="/github" className="text-brand-blue hover:underline">sync GitHub</Link>.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                  <span className="truncate">{p.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ResendCard userEmail={user?.email ?? ""} />
    </div>
  );
}

function ResendCard({ userEmail }: { userEmail: string }) {
  const [status, setStatus] = useState<ResendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState(userEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => { setTo(userEmail); }, [userEmail]);

  const refresh = async () => {
    setLoading(true);
    try { setStatus(await getResendStatus()); }
    catch (e: any) { setStatus({ ok: false, configured: false, domains: [], message: e?.message ?? "Failed to load" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const send = async () => {
    if (!to) return toast.error("Enter a recipient email");
    setSending(true);
    try {
      const r = await sendResendTest({ data: { to } });
      toast.success(r.message);
    } catch (e: any) {
      toast.error(e?.message ?? "Send failed");
    } finally { setSending(false); }
  };

  const verified = status?.domains.filter((d) => d.status === "verified") ?? [];

  return (
    <section className="cathedral-card rounded-xl p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-brand-blue" />
          <h2 className="font-display text-lg tracking-wider">RESEND</h2>
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : status?.ok ? (
            <CheckCircle2 className="h-4 w-4 text-brand-green" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>Refresh</Button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{status?.message ?? "Checking…"}</p>

      {status?.domains && status.domains.length > 0 && (
        <ul className="text-xs space-y-1 mb-4">
          {status.domains.map((d) => (
            <li key={d.id} className="flex items-center justify-between border-b border-border/40 py-1">
              <span className="font-mono">{d.name}</span>
              <span className={`uppercase tracking-wider text-[10px] ${d.status === "verified" ? "text-brand-green" : "text-muted-foreground"}`}>{d.status}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="email"
          placeholder="recipient@example.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1"
        />
        <Button onClick={send} disabled={sending || !status?.configured} className="bg-brand-blue text-white hover:bg-brand-blue/90">
          {sending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Mail className="h-3 w-3 mr-2" />}
          Send test
        </Button>
      </div>
      {verified.length === 0 && status?.configured && (
        <p className="text-[11px] text-muted-foreground mt-2">No verified domain yet — sending from <code>onboarding@resend.dev</code> (test mode, only delivers to your own Resend account email).</p>
      )}
    </section>
  );
}

function QuickAction({
  to, icon: Icon, title, subtitle, children,
}: { to: string; icon: any; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group relative rounded-xl border border-border/60 bg-card/60 backdrop-blur p-4 hover:border-brand-blue/50 hover:bg-brand-blue/5 transition-all overflow-hidden"
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-brand-blue/10 blur-2xl group-hover:bg-brand-blue/20 transition" />
      <div className="relative flex items-center gap-3">
        <Icon className="h-5 w-5 text-brand-blue" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm tracking-wider">{title}</div>
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        </div>
        {children}
      </div>
    </Link>
  );
}
