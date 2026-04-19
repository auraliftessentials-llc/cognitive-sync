import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import {
  getAdminOverview,
  setUserRole,
  deleteUserAccount,
  generateFleetInsights,
} from "@/lib/admin.functions";
import { toast } from "sonner";

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

function AdminPage() {
  const { user, isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [briefing, setBriefing] = useState<string>("");
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
    else if (!loading && user && !isSuperAdmin) nav({ to: "/dashboard" });
  }, [loading, user, isSuperAdmin, nav]);

  const load = async () => {
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

  useEffect(() => {
    if (isSuperAdmin) load();
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
      load();
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
      load();
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

  if (loading || !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Verifying clearance…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-10 max-w-[1400px] mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary mb-2">
              <Crown className="h-3 w-3" /> Command Bridge
            </div>
            <h1 className="font-display text-4xl lg:text-5xl glow-text">SUPER ADMIN</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Full fleet visibility · role control · system intelligence
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={fetching}>
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

        {/* Fleet AI Briefing */}
        {(briefing || briefingLoading) && (
          <Card className="p-6 border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg tracking-wider">FLEET INTELLIGENCE BRIEFING</h2>
              {briefingLoading && <span className="text-xs text-muted-foreground animate-pulse">analyzing…</span>}
            </div>
            <div
              className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-mono text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMd(briefing) }}
            />
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display tracking-wider text-sm text-muted-foreground">USERS · {filtered.length}</h2>
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
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{u.email}</div>
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
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{u.message_count}</td>
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

          {/* Right rail: Recent activity */}
          <div className="space-y-4">
            <h2 className="font-display tracking-wider text-sm text-muted-foreground">RECENT FLEET ACTIVITY</h2>
            <Card className="p-4 space-y-3">
              {recentProjects.length === 0 && (
                <p className="text-xs text-muted-foreground">No recent projects.</p>
              )}
              {recentProjects.map((p) => (
                <div key={p.id} className="flex items-start gap-3 pb-3 border-b border-border/50 last:border-0 last:pb-0">
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
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Role distribution</div>
              <div className="space-y-2">
                <RoleBar label="Super admins" count={stats?.total_super_admins ?? 0} total={stats?.total_users ?? 1} />
                <RoleBar label="Admins" count={stats?.total_admins ?? 0} total={stats?.total_users ?? 1} />
                <RoleBar
                  label="Standard"
                  count={
                    (stats?.total_users ?? 0) - (stats?.total_admins ?? 0) - (stats?.total_super_admins ?? 0)
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
      <div className={`text-2xl font-display tabular-nums ${accent ? "text-primary glow-text" : ""}`}>{value}</div>
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

// minimal markdown renderer for the briefing
function renderMd(md: string) {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.*$)/gm, '<h3 class="font-display text-primary text-sm tracking-wider mt-4 mb-2">$1</h3>')
    .replace(/^\d+\.\s+(.*)$/gm, '<div class="ml-2">→ $1</div>')
    .replace(/^[-*]\s+(.*)$/gm, '<div class="ml-2">• $1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>');
}
