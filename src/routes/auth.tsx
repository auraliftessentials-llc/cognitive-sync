import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Github } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp, user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Auth gate disabled — anyone hitting /auth goes straight to /dashboard.
  useEffect(() => { nav({ to: "/dashboard", replace: true }); }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Email + password (6+ chars) required");
      return;
    }
    setBusy(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) {
      toast.error(error);
    } else if (mode === "signup") {
      toast.success("Account created. Signing you in…");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="absolute inset-0 neural-grid opacity-30 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm glow-border rounded-xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <Brain className="h-6 w-6 text-primary" />
          <span className="font-display text-sm tracking-wider">NEURAL.OPS</span>
        </div>
        <h1 className="font-display text-2xl mb-1">
          {mode === "signin" ? "Reconnect" : "Initialize"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "signin" ? "Sign in to your command center." : "Create your cognitive layer."}
        </p>

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await lovable.auth.signInWithOAuth("google", {
              redirect_uri: window.location.origin + "/dashboard",
            });
            if (result.error) {
              setBusy(false);
              toast.error(result.error.message ?? "Google sign-in failed");
            }
          }}
          className="w-full mb-2"
        >
          Continue with Google
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "github",
              options: {
                redirectTo: window.location.origin + "/dashboard",
                scopes: "read:user user:email",
              },
            });
            if (error) {
              setBusy(false);
              toast.error(error.message ?? "GitHub sign-in failed");
            }
          }}
          className="w-full mb-4"
        >
          <Github className="h-4 w-4 mr-2" />
          Continue with GitHub
        </Button>

        <div className="flex items-center gap-2 my-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground hover:opacity-90">
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-xs text-muted-foreground hover:text-foreground w-full text-center"
        >
          {mode === "signin" ? "No account? Initialize one." : "Already have an account? Sign in."}
        </button>
      </div>
    </div>
  );
}
