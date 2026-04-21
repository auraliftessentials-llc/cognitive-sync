import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  ShieldCheck,
  Users,
  FolderGit2,
  MessageSquare,
  Sparkles,
  Activity,
  Brain,
  Trash2,
  Search,
  RefreshCw,
  Crown,
  Zap,
  Radio,
  ScrollText,
  ToggleLeft,
  BarChart3,
  Building2,
  Mail,
  Plug,
  Inbox,
  UserCheck,
  Unplug,
  Terminal,
} from "lucide-react";
import { CliTokensPanel } from "@/components/CliTokensPanel";
import { SchedulesPanel } from "@/components/SchedulesPanel";
import {
  getAdminOverview,
  setUserRole,
  deleteUserAccount,
  generateFleetInsights,
} from "@/lib/admin.functions";
import {
  getFleetAnalytics,
  getAuditLog,
  getFeatureFlags,
  setFeatureFlag,
} from "@/lib/fleet.functions";
import { listMyWorkspaces } from "@/lib/workspace.functions";
import {
  getZohoAuthUrl,
  getZohoStatus,
  disconnectZoho,
  getZohoMail,
  getZohoCrmLeads,
} from "@/lib/zoho.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Command Bridge — Neural Ops" },
      { name: "description", content: "Super-admin command bridge" },
    ],
  }),
  component: AdminPage,
});

type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  roles: string[];
  display_name: string | null;
  avatar_url: string | null;
  project_count: number;
  active_projects: number;
  last_activity: string | null;
  suggestion_count: number;
  message_count: number;
};

type Stats = {
  total_users: number;
  total_super_admins: number;
  total_admins: number;
  active_last_7d: number;
  total_projects: number;
  total_active_projects: number;
  total_conversations: number;
  total_messages: number;
  total_suggestions: number;
};

type AuditEntry = {
  id: string;
  workspace_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type Flag = { id: string; key: string; enabled: boolean; description: string | null };
type Workspace = { id: string; name: string; slug: string; role: string };

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#34d399",
  "#facc15",
  "#60a5fa",
];

function AdminPage() {
  const { user, isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();

  // Overview
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [briefing, setBriefing] = useState<string>("");
  const [briefingLoading, setBriefingLoading] = useState(false);

  // Charts
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [analytics, setAnalytics] = useState<{
    series: { day: string; signups: number; projects: number; messages: number; audit: number }[];
    techDist: { name: string; value: number }[];
    statusDist: { name: string; value: number }[];
    wsActivity: { name: string; projects: number }[];
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Audit + Live feed
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [liveOn, setLiveOn] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  // Flags
  const [flags, setFlags] = useState<Flag[]>([]);

  // Workspaces
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Zoho
  const [zohoConn, setZohoConn] = useState<{
    email: string;
    scopes: string[];
    expires_at: string;
    created_at: string;
    updated_at: string;
  } | null>(null);
  const [zohoLoading, setZohoLoading] = useState(false);
  const [zohoMail, setZohoMail] = useState<any[]>([]);
  const [zohoLeads, setZohoLeads] = useState<any[]>([]);
  const [zohoMailLoading, setZohoMailLoading] = useState(false);
  const [zohoLeadsLoading, setZohoLeadsLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
    else if (!loading && user && !isSuperAdmin) nav({ to: "/dashboard" });
  }, [loading, user, isSuperAdmin, nav]);

  const loadOverview = async () => {
    setFetching(true);
    try {
      const res = await getAdminOverview();
      setUsers(res.users);
      setStats(res.stats);
      setRecentProjects(res.recentProjects);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setFetching(false);
    }
  };

  const loadAnalytics = async (d: 7 | 30 | 90) => {
    setAnalyticsLoading(true);
    try {
      const res = await getFleetAnalytics({ data: { days: d } });
      setAnalytics(res);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadAudit = async () => {
    try {
      const res = await getAuditLog({ data: { limit: 200 } });
      setAudit(res.entries as AuditEntry[]);
      setLiveCount(0);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const loadFlags = async () => {
    try {
      const res = await getFeatureFlags();
      setFlags(res.flags as Flag[]);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const res = await listMyWorkspaces();
      setWorkspaces(res.workspaces as Workspace[]);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const loadZohoStatus = async () => {
    try {
      const res = await getZohoStatus();
      setZohoConn(res.connection);
    } catch {
      /* silent — likely no connection yet */
    }
  };

  const connectZoho = async () => {
    setZohoLoading(true);
    try {
      const res = await getZohoAuthUrl();
      if (!res.configured) {
        toast.error("Zoho not configured. Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.");
        return;
      }
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start Zoho OAuth");
    } finally {
      setZohoLoading(false);
    }
  };

  const handleDisconnectZoho = async () => {
    try {
      await disconnectZoho();
      setZohoConn(null);
      setZohoMail([]);
      setZohoLeads([]);
      toast.success("Zoho disconnected");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const loadZohoMail = async () => {
    setZohoMailLoading(true);
    try {
      const res = await getZohoMail();
      setZohoMail(res.messages ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load mail");
    } finally {
      setZohoMailLoading(false);
    }
  };

  const loadZohoLeads = async () => {
    setZohoLeadsLoading(true);
    try {
      const res = await getZohoCrmLeads();
      setZohoLeads(res.leads ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load CRM leads");
    } finally {
      setZohoLeadsLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadOverview();
    loadAnalytics(days);
    loadAudit();
    loadFlags();
    loadWorkspaces();
    loadZohoStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      toast.success("Zoho connected!");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) loadAnalytics(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Realtime audit subscription
  const liveOnRef = useRef(liveOn);
  liveOnRef.current = liveOn;
  useEffect(() => {
    if (!isSuperAdmin) return;
    const channel = supabase
      .channel("admin-audit-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log" },
        (payload) => {
          if (!liveOnRef.current) return;
          const row = payload.new as AuditEntry;
          setAudit((cur) => [row, ...cur].slice(0, 200));
          setLiveCount((c) => c + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSuperAdmin]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q) ||
        u.roles.some((r) => r.includes(q)),
    );
  }, [users, search]);

  const toggleRole = async (target: AdminUser, role: "admin" | "super_admin") => {
    const has = target.roles.includes(role);
    try {
      await setUserRole({ data: { targetUserId: target.id, role, action: has ? "revoke" : "grant" } });
      toast.success(`${has ? "Revoked" : "Granted"} ${role}`);
      loadOverview();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteUserAccount({ data: { targetUserId: confirmDelete.id } });
      toast.success("User deleted");
      setConfirmDelete(null);
      loadOverview();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const runBriefing = async () => {
    setBriefingLoading(true);
    setBriefing("");
    try {
      const r = await generateFleetInsights();
      setBriefing(r.briefing);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBriefingLoading(false);
    }
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    setFlags((cur) => cur.map((f) => (f.key === key ? { ...f, enabled } : f)));
    try {
      await setFeatureFlag({ data: { key, enabled } });
      toast.success(`${key} ${enabled ? "enabled" : "disabled"}`);
    } catch (e: any) {
      toast.error(e.message);
      loadFlags();
    }
  };

  if (loading || !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Verifying clearance…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-10 max-w-[1500px] mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary mb-2">
              <Crown className="h-3 w-3" /> Command Bridge
            </div>
            <h1 className="font-display text-4xl lg:text-5xl glow-text">SUPER ADMIN</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Full fleet visibility · realtime telemetry · system intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-muted/20 text-xs">
              <span className={`h-2 w-2 rounded-full ${liveOn ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
              <span className="text-muted-foreground">Live</span>
              <Switch checked={liveOn} onCheckedChange={setLiveOn} className="scale-75" />
            </div>
            <Button variant="outline" size="sm" onClick={loadOverview} disabled={fetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={runBriefing} disabled={briefingLoading}>
              <Brain className="h-4 w-4 mr-2" />
              {briefingLoading ? "Analyzing…" : "Run Fleet AI"}
            </Button>
          </div>
        </header>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Kpi label="Users" value={stats?.total_users ?? "—"} icon={Users} accent />
          <Kpi label="Active 7d" value={stats?.active_last_7d ?? "—"} icon={Activity} />
          <Kpi label="Projects" value={stats?.total_projects ?? "—"} icon={FolderGit2} />
          <Kpi label="Active Proj" value={stats?.total_active_projects ?? "—"} icon={Zap} />
          <Kpi label="AI Msgs" value={stats?.total_messages ?? "—"} icon={MessageSquare} />
          <Kpi label="Suggestions" value={stats?.total_suggestions ?? "—"} icon={Sparkles} />
        </div>

        {/* Briefing */}
        {(briefing || briefingLoading) && (
          <Card className="p-6 border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg tracking-wider">FLEET INTELLIGENCE BRIEFING</h2>
              {briefingLoading && (
                <span className="text-xs text-muted-foreground animate-pulse">analyzing…</span>
              )}
            </div>
            <div
              className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-mono text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMd(briefing) }}
            />
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 md:grid-cols-8 w-full max-w-5xl">
            <TabsTrigger value="overview"><Users className="h-3.5 w-3.5 mr-1.5" />Overview</TabsTrigger>
            <TabsTrigger value="members"><Building2 className="h-3.5 w-3.5 mr-1.5" />Members</TabsTrigger>
            <TabsTrigger value="charts"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Charts</TabsTrigger>
            <TabsTrigger value="audit"><ScrollText className="h-3.5 w-3.5 mr-1.5" />Audit</TabsTrigger>
            <TabsTrigger value="live" className="relative">
              <Radio className="h-3.5 w-3.5 mr-1.5" />Live
              {liveCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-mono">
                  {liveCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="flags"><ToggleLeft className="h-3.5 w-3.5 mr-1.5" />Flags</TabsTrigger>
            <TabsTrigger value="zoho"><Mail className="h-3.5 w-3.5 mr-1.5" />Zoho</TabsTrigger>
            <TabsTrigger value="cli"><Terminal className="h-3.5 w-3.5 mr-1.5" />CLI</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display tracking-wider text-sm text-muted-foreground">
                    USERS · {filtered.length}
                  </h2>
                  <div className="relative w-64">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8"
                      placeholder="Search email, name, role…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2">User</th>
                          <th className="text-left px-3 py-2">Roles</th>
                          <th className="text-right px-3 py-2">Proj</th>
                          <th className="text-right px-3 py-2">Msgs</th>
                          <th className="text-left px-3 py-2">Last seen</th>
                          <th className="text-right px-3 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((u) => (
                          <tr key={u.id} className="border-t border-border/50 hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <div className="font-medium truncate max-w-[200px]">
                                {u.display_name || u.email.split("@")[0]}
                              </div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {u.email}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1 flex-wrap">
                                {u.roles.includes("super_admin") && (
                                  <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px]">
                                    <Crown className="h-2.5 w-2.5 mr-1" />SUPER
                                  </Badge>
                                )}
                                {u.roles.includes("admin") && (
                                  <Badge variant="outline" className="text-[10px]">
                                    <ShieldCheck className="h-2.5 w-2.5 mr-1" />ADMIN
                                  </Badge>
                                )}
                                {u.roles.length === 0 && (
                                  <span className="text-xs text-muted-foreground">user</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {u.project_count}
                              {u.active_projects > 0 && (
                                <span className="text-xs text-primary ml-1">·{u.active_projects}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {u.message_count}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : "never"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => toggleRole(u, "admin")}
                                  title={u.roles.includes("admin") ? "Revoke admin" : "Grant admin"}
                                >
                                  <Shield className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => toggleRole(u, "super_admin")}
                                  title={u.roles.includes("super_admin") ? "Revoke super" : "Grant super"}
                                >
                                  <Crown className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => setConfirmDelete(u)}
                                  disabled={u.id === user?.id}
                                  title="Delete user"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filtered.length === 0 && !fetching && (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                              No users match.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              <div className="space-y-4">
                <h2 className="font-display tracking-wider text-sm text-muted-foreground">
                  RECENT FLEET ACTIVITY
                </h2>
                <Card className="p-4 space-y-3">
                  {recentProjects.length === 0 && (
                    <p className="text-xs text-muted-foreground">No recent projects.</p>
                  )}
                  {recentProjects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start gap-3 pb-3 border-b border-border/50 last:border-0 last:pb-0"
                    >
                      <div
                        className={`mt-1 h-2 w-2 rounded-full ${
                          p.status === "active" ? "bg-primary animate-pulse" : "bg-muted"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {p.status} · P{p.priority} · {timeAgo(p.last_worked_on || p.updated_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>

                <Card className="p-4 bg-muted/30">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                    Role distribution
                  </div>
                  <div className="space-y-2">
                    <RoleBar label="Super admins" count={stats?.total_super_admins ?? 0} total={stats?.total_users ?? 1} />
                    <RoleBar label="Admins" count={stats?.total_admins ?? 0} total={stats?.total_users ?? 1} />
                    <RoleBar
                      label="Standard"
                      count={
                        (stats?.total_users ?? 0) -
                        (stats?.total_admins ?? 0) -
                        (stats?.total_super_admins ?? 0)
                      }
                      total={stats?.total_users ?? 1}
                    />
                  </div>
                </Card>

                <Link
                  to="/dashboard"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  ← back to pulse
                </Link>
              </div>
            </div>
          </TabsContent>

          {/* MEMBERS / WORKSPACES */}
          <TabsContent value="members" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display tracking-wider text-sm text-muted-foreground">
                WORKSPACES · {workspaces.length}
              </h2>
              <Button variant="outline" size="sm" onClick={loadWorkspaces}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaces.map((w) => (
                <Card key={w.id} className="p-4 hover:border-primary/40 transition">
                  <div className="flex items-start justify-between mb-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <Badge variant="outline" className="text-[10px] uppercase">{w.role}</Badge>
                  </div>
                  <div className="font-display tracking-wide truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{w.slug}</div>
                </Card>
              ))}
              {workspaces.length === 0 && (
                <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">
                  No workspaces yet.
                </Card>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Detailed member management (invite, role change, remove) — coming next phase. Workspaces auto-created per signup.
            </p>
          </TabsContent>

          {/* CHARTS */}
          <TabsContent value="charts" className="mt-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-display tracking-wider text-sm text-muted-foreground">
                DEEP ANALYTICS · last {days}d
              </h2>
              <div className="flex gap-1 rounded-md border border-border/60 bg-muted/20 p-1">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d as 7 | 30 | 90)}
                    className={`px-3 py-1 text-xs rounded transition ${
                      days === d
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {analyticsLoading && (
              <p className="text-xs text-muted-foreground animate-pulse">Crunching telemetry…</p>
            )}

            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                Activity timeseries
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics?.series ?? []}>
                    <defs>
                      <linearGradient id="gSign" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gProj" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gMsg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="signups" stroke="hsl(var(--primary))" fill="url(#gSign)" />
                    <Area type="monotone" dataKey="projects" stroke="#22d3ee" fill="url(#gProj)" />
                    <Area type="monotone" dataKey="messages" stroke="#a78bfa" fill="url(#gMsg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Tech stack distribution
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.techDist ?? []}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(e: any) => `${e.name} (${e.value})`}
                        labelLine={false}
                      >
                        {(analytics?.techDist ?? []).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Project status
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.statusDist ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                Workspace activity (top 10)
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.wsActivity ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="hsl(var(--muted-foreground))"
                      width={140}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="projects" fill="#22d3ee" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          {/* AUDIT */}
          <TabsContent value="audit" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display tracking-wider text-sm text-muted-foreground">
                AUDIT LOG · {audit.length}
              </h2>
              <Button variant="outline" size="sm" onClick={loadAudit}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />Reload
              </Button>
            </div>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">When</th>
                      <th className="text-left px-3 py-2">Actor</th>
                      <th className="text-left px-3 py-2">Action</th>
                      <th className="text-left px-3 py-2">Target</th>
                      <th className="text-left px-3 py-2">Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a) => (
                      <tr key={a.id} className="border-t border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(a.created_at)}
                        </td>
                        <td className="px-3 py-2 text-xs truncate max-w-[180px]">
                          {a.actor_email ?? a.actor_id?.slice(0, 8) ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {a.action}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[180px]">
                          {a.target_type ? `${a.target_type}/${a.target_id?.slice(0, 8)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-[10px] font-mono text-muted-foreground truncate max-w-[280px]">
                          {Object.keys(a.metadata ?? {}).length ? JSON.stringify(a.metadata) : "—"}
                        </td>
                      </tr>
                    ))}
                    {audit.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                          No audit events yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* LIVE FEED */}
          <TabsContent value="live" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display tracking-wider text-sm text-muted-foreground">
                  LIVE TELEMETRY
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Realtime stream of audit events via Supabase Realtime · {liveCount} new this session
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${liveOn ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
                <span className="text-xs">{liveOn ? "STREAMING" : "PAUSED"}</span>
                <Switch checked={liveOn} onCheckedChange={setLiveOn} />
              </div>
            </div>
            <Card className="p-0 overflow-hidden">
              <div className="bg-black/40 font-mono text-xs max-h-[600px] overflow-y-auto">
                {audit.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground">
                    Awaiting telemetry…
                  </div>
                )}
                {audit.slice(0, 80).map((a, i) => (
                  <div
                    key={a.id}
                    className={`px-4 py-2 border-b border-border/30 flex items-start gap-3 ${
                      i === 0 && liveCount > 0 ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="text-muted-foreground shrink-0">
                      {new Date(a.created_at).toISOString().slice(11, 19)}
                    </span>
                    <span className="text-primary shrink-0">{a.action}</span>
                    <span className="text-muted-foreground truncate flex-1">
                      {a.actor_email ?? "system"}
                      {a.target_type && ` → ${a.target_type}`}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* FLAGS */}
          <TabsContent value="flags" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display tracking-wider text-sm text-muted-foreground">
                FEATURE FLAGS · {flags.length}
              </h2>
              <Button variant="outline" size="sm" onClick={loadFlags}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />Reload
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {flags.map((f) => (
                <Card key={f.key} className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm">{f.key}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {f.description ?? "No description"}
                    </div>
                  </div>
                  <Switch checked={f.enabled} onCheckedChange={(v) => toggleFlag(f.key, v)} />
                </Card>
              ))}
              {flags.length === 0 && (
                <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">
                  No feature flags defined yet. Insert rows into{" "}
                  <code className="font-mono">feature_flags</code> to get started.
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ZOHO */}
          <TabsContent value="zoho" className="mt-6 space-y-6">
            <Card className="p-6 border-primary/30">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
                    <Plug className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl tracking-wider">ZOHO CONNECTION</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mail · CRM · Accounts. One OAuth login covers all your Zoho-authenticated emails.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {zohoConn ? (
                    <>
                      <Button variant="outline" size="sm" onClick={loadZohoStatus}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                      <Button variant="destructive" size="sm" onClick={handleDisconnectZoho}>
                        <Unplug className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={connectZoho} disabled={zohoLoading}>
                      <Plug className="h-4 w-4 mr-2" />
                      {zohoLoading ? "Connecting…" : "Connect Zoho"}
                    </Button>
                  )}
                </div>
              </div>

              {zohoConn ? (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-md border border-border/60 bg-muted/10">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Connected as
                    </div>
                    <div className="font-mono text-sm flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5 text-primary" />
                      {zohoConn.email}
                    </div>
                  </div>
                  <div className="p-3 rounded-md border border-border/60 bg-muted/10">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Token expires
                    </div>
                    <div className="font-mono text-sm">
                      {new Date(zohoConn.expires_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 rounded-md border border-border/60 bg-muted/10">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Scopes
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {zohoConn.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px] font-mono">
                          {s.split(".").slice(-2).join(".")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 p-4 rounded-md border border-dashed border-border/60 bg-muted/5 text-sm text-muted-foreground">
                  Click <span className="text-foreground font-medium">Connect Zoho</span> to authorize.
                  After Zoho login, all of your Zoho-managed emails (e.g. ryanpuddy@profireaper.com) will
                  flow through this connection.
                </div>
              )}
            </Card>

            {zohoConn && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mail */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Inbox className="h-4 w-4 text-primary" />
                      <h3 className="font-display tracking-wider text-sm">RECENT MAIL</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadZohoMail} disabled={zohoMailLoading}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${zohoMailLoading ? "animate-spin" : ""}`} />
                      Load
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[480px] overflow-y-auto">
                    {zohoMail.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-8 text-center">
                        {zohoMailLoading ? "Loading…" : "Click Load to fetch recent messages."}
                      </div>
                    ) : (
                      zohoMail.map((m: any, i: number) => (
                        <div
                          key={m.messageId ?? i}
                          className="p-3 rounded-md border border-border/40 bg-muted/5 hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="font-mono text-xs text-primary truncate">
                              {m.fromAddress ?? m.sender ?? "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                              {m.receivedTime
                                ? new Date(Number(m.receivedTime)).toLocaleDateString()
                                : ""}
                            </div>
                          </div>
                          <div className="text-sm font-medium truncate">{m.subject ?? "(no subject)"}</div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {m.summary ?? ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* CRM Leads */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-display tracking-wider text-sm">CRM LEADS</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadZohoLeads} disabled={zohoLeadsLoading}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${zohoLeadsLoading ? "animate-spin" : ""}`} />
                      Load
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[480px] overflow-y-auto">
                    {zohoLeads.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-8 text-center">
                        {zohoLeadsLoading ? "Loading…" : "Click Load to fetch recent leads."}
                      </div>
                    ) : (
                      zohoLeads.map((l: any) => (
                        <div
                          key={l.id}
                          className="p-3 rounded-md border border-border/40 bg-muted/5 hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="text-sm font-medium truncate">
                              {l.Full_Name ?? (`${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim() || "—")}
                            </div>
                            {l.Lead_Status && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {l.Lead_Status}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {l.Email ?? ""}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {l.Company ?? ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* CLI */}
          <TabsContent value="cli" className="mt-6 space-y-6">
            <CliTokensPanel />
            <SchedulesPanel />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes <span className="font-mono">{confirmDelete?.email}</span> and all their data.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: any;
  accent?: boolean;
}) {
  return (
    <Card className={`p-4 ${accent ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className={`text-2xl font-display tabular-nums ${accent ? "text-primary glow-text" : ""}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}

function RoleBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function renderMd(md: string) {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, '<h3 class="text-primary font-display tracking-wider mt-3 mb-1">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="text-primary font-display tracking-wider mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.*)$/gm, '<div class="ml-4">• $1</div>')
    .replace(/^(\d+)\. (.*)$/gm, '<div class="ml-4">$1. $2</div>');
}
