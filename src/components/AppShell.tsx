import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Brain, FolderGit2, MessageSquare, Sparkles, User, LogOut, Github } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Pulse", icon: Brain },
  { to: "/projects", label: "Library", icon: FolderGit2 },
  { to: "/suggestions", label: "Moves", icon: Sparkles },
  { to: "/chat", label: "Brain", icon: MessageSquare },
  { to: "/github", label: "GitHub", icon: Github },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav2 = useNavigate();
  const { signOut, user, isSuperAdmin, isAdmin } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col p-4 sticky top-0 h-screen">
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-3 mb-6">
          <div className="relative">
            <Brain className="h-7 w-7 text-primary" />
            <div className="absolute -top-1 -right-1 pulse-dot" />
          </div>
          <div>
            <div className="font-display text-sm tracking-wider">NEURAL.OPS</div>
            <div className="text-[10px] text-muted-foreground">command center</div>
          </div>
        </Link>

        <nav className="flex flex-col gap-1 flex-1">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = loc.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/30 glow-text"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border pt-3 mt-3">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="text-xs text-muted-foreground truncate flex-1">{user?.email}</div>
            {isSuperAdmin ? (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40 font-display">
                super
              </span>
            ) : isAdmin ? (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-foreground border border-border font-display">
                admin
              </span>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await signOut();
              nav2({ to: "/auth" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
