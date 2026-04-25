import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Github, KeyRound, ShieldCheck, LogOut, Mail } from "lucide-react";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/settings/auth")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <Page />
      </AppShell>
    </RequireAuth>
  ),
});

function Page() {
  const { user, session, signOut } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailNew, setEmailNew] = useState("");

  const providers = useMemo(() => {
    const ids = (user?.identities ?? []) as Array<{ provider: string }>;
    return new Set(ids.map((i) => i.provider));
  }, [user]);

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString()
    : "—";
  const sessionExpires = session?.expires_at
    ? new Date(session.expires_at * 1000).toLocaleString()
    : "—";

  const changePassword = async () => {
    if (pwd.length < 8) return toast.error("Password must be 8+ characters");
    if (pwd !== pwd2) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPwd("");
    setPwd2("");
    toast.success("Password updated");
  };

  const changeEmail = async () => {
    if (!emailNew.includes("@")) return toast.error("Enter a valid email");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: emailNew });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Confirmation sent to new email");
    setEmailNew("");
  };

  const linkGitHub = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin + "/settings/auth",
        scopes: "read:user user:email",
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
    }
  };

  const linkGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/settings/auth",
    });
    if (result.error) {
      setBusy(false);
      toast.error(result.error.message ?? "Failed");
    }
  };

  const signOutEverywhere = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Signed out from all devices");
    await signOut();
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl mb-1">Auth & Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage your sign-in methods, password, and active sessions.
        </p>
      </div>

      <Section icon={ShieldCheck} title="Session">
        <Row label="Email" value={user?.email ?? "—"} />
        <Row label="User ID" value={user?.id ?? "—"} mono />
        <Row label="Last sign-in" value={lastSignIn} />
        <Row label="Session expires" value={sessionExpires} />
      </Section>

      <Section icon={KeyRound} title="Password">
        <div className="grid gap-3 max-w-sm">
          <div>
            <Label htmlFor="pwd">New password</Label>
            <Input
              id="pwd"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="pwd2">Confirm new password</Label>
            <Input
              id="pwd2"
              type="password"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button onClick={changePassword} disabled={busy} className="w-fit">
            Update password
          </Button>
        </div>
      </Section>

      <Section icon={Mail} title="Email">
        <div className="grid gap-3 max-w-sm">
          <div>
            <Label htmlFor="email">New email</Label>
            <Input
              id="email"
              type="email"
              value={emailNew}
              onChange={(e) => setEmailNew(e.target.value)}
              placeholder={user?.email ?? ""}
            />
          </div>
          <Button onClick={changeEmail} disabled={busy} variant="outline" className="w-fit">
            Send confirmation
          </Button>
        </div>
      </Section>

      <Section icon={Github} title="Linked providers">
        <div className="grid gap-2">
          <ProviderRow
            name="Google"
            linked={providers.has("google")}
            onLink={linkGoogle}
            disabled={busy}
          />
          <ProviderRow
            name="GitHub"
            linked={providers.has("github")}
            onLink={linkGitHub}
            disabled={busy}
          />
          <ProviderRow
            name="Email / password"
            linked={providers.has("email")}
            disabled
          />
        </div>
      </Section>

      <Section icon={LogOut} title="Active sessions">
        <p className="text-sm text-muted-foreground mb-3">
          Sign out from this browser, or revoke every session across all devices.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => signOut()} disabled={busy}>
            Sign out this device
          </Button>
          <Button variant="destructive" onClick={signOutEverywhere} disabled={busy}>
            Sign out everywhere
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glow-border rounded-lg p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm tracking-[0.2em] uppercase">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}

function ProviderRow({
  name,
  linked,
  onLink,
  disabled,
}: {
  name: string;
  linked: boolean;
  onLink?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border border-border/60 rounded-md px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm">{name}</span>
        {linked && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
            linked
          </span>
        )}
      </div>
      {!linked && onLink && (
        <Button size="sm" variant="outline" onClick={onLink} disabled={disabled}>
          Link
        </Button>
      )}
    </div>
  );
}
