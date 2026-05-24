import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Brain, Sparkles, GitBranch, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectMacBookButton } from "@/components/ConnectMacBookButton";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && user) nav({ to: "/dashboard" });
  }, [user, loading, nav]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 neural-grid opacity-40 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--gradient-radial)" }} />

      <header className="relative z-10 flex items-center justify-between p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          <span className="font-display text-sm tracking-wider">NEURAL.OPS</span>
        </div>
        <Link to="/auth">
          <Button variant="outline" size="sm">Sign in</Button>
        </Link>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-6 -mt-2 flex justify-end">
        <ConnectMacBookButton />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-32">
        <div className="flex items-center gap-2 mb-6 animate-fade-in-up">
          <div className="pulse-dot" />
          <span className="text-xs font-display text-pulse tracking-widest uppercase">cognitive layer online</span>
        </div>

        <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] mb-8 animate-fade-in-up">
          One brain for your{" "}
          <span className="glow-text text-primary">entire</span>{" "}
          project library.
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12 animate-fade-in-up">
          Stop juggling tabs, repos, and half-finished ideas. Neural Ops syncs your project library, learns
          how you think, and tells you the next move you should actually make.
        </p>

        <div className="flex flex-wrap gap-4 mb-6 animate-fade-in-up">
          <Link to="/auth">
            <Button size="lg" className="bg-primary text-primary-foreground hover:opacity-90">
              Boot the brain <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline">
              See pricing
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mb-20 animate-fade-in-up">
          Paid access only. Trial requires a payment method on file. No free tier.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {[
            { icon: GitBranch, title: "Project Library", body: "Add projects manually or sync from GitHub. One source of truth." },
            { icon: Sparkles, title: "Auto Next-Moves", body: "Agents analyze your library + skills and surface what to do next." },
            { icon: MessageSquare, title: "Chat with your work", body: "Ask the brain anything — it answers using your actual data." },
            { icon: Brain, title: "Cognitive profile", body: "Tell it how you think once. Every suggestion uses that context." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="glow-border rounded-lg p-5 animate-fade-in-up">
              <Icon className="h-5 w-5 text-primary mb-3" />
              <div className="font-display text-sm mb-1">{title}</div>
              <div className="text-sm text-muted-foreground">{body}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
