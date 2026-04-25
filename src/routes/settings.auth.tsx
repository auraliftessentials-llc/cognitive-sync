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
import { Github, KeyRound, ShieldCheck, LogOut, Mail, BookOpen, Copy, ExternalLink, Check, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { lovable } from "@/integrations/lovable";

const GITHUB_CALLBACK_URL = "https://cldgrtzmlykoeahxkhuq.supabase.co/auth/v1/callback";
const SUPABASE_GITHUB_PROVIDER_URL =
  "https://supabase.com/dashboard/project/cldgrtzmlykoeahxkhuq/auth/providers?provider=Github";
const GITHUB_OAUTH_APPS_URL = "https://github.com/settings/developers";

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

      <GitHubSetupGuide />

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

function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label ?? "Value"} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <code className="flex-1 truncate font-mono text-xs">{value}</code>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function GitHubSetupGuide() {
  return (
    <section className="glow-border rounded-lg p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm tracking-[0.2em] uppercase">
          GitHub OAuth setup guide
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Follow these steps once to enable the “Continue with GitHub” button.
      </p>

      <ol className="space-y-5">
        <Step n={1} title="Create a GitHub OAuth App">
          <p className="text-sm text-muted-foreground mb-2">
            Open GitHub → Settings → Developer settings → OAuth Apps →{" "}
            <span className="text-foreground">New OAuth App</span>.
          </p>
          <a
            href={GITHUB_OAUTH_APPS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Open GitHub Developer Settings <ExternalLink className="h-3 w-3" />
          </a>
        </Step>

        <Step n={2} title="Fill in the app fields">
          <ul className="text-sm space-y-2">
            <li>
              <span className="text-muted-foreground">Application name:</span>{" "}
              anything (e.g. “Neural Ops”).
            </li>
            <li>
              <span className="text-muted-foreground">Homepage URL:</span>
              <div className="mt-1">
                <CopyField value={window.location.origin} label="Homepage URL" />
              </div>
            </li>
            <li>
              <span className="text-muted-foreground">
                Authorization callback URL{" "}
                <span className="text-destructive">(must match exactly)</span>:
              </span>
              <div className="mt-1">
                <CopyField value={GITHUB_CALLBACK_URL} label="Callback URL" />
              </div>
            </li>
          </ul>
        </Step>

        <Step n={3} title="Generate a client secret">
          <p className="text-sm text-muted-foreground">
            On the OAuth app page, click <span className="text-foreground">Generate a new client secret</span>.
            Copy both the <span className="text-foreground">Client ID</span> and{" "}
            <span className="text-foreground">Client Secret</span> — the secret is shown only once.
          </p>
        </Step>

        <Step n={4} title="Paste into the backend (Lovable Cloud)">
          <p className="text-sm text-muted-foreground mb-2">
            Open the GitHub provider in your backend, toggle{" "}
            <span className="text-foreground">Enable Sign in with GitHub</span>, and paste:
          </p>
          <ul className="text-sm space-y-1.5 mb-3">
            <li>
              <span className="text-muted-foreground">Client ID</span> → from GitHub
            </li>
            <li>
              <span className="text-muted-foreground">Client Secret</span> → from GitHub
            </li>
          </ul>
          <a
            href={SUPABASE_GITHUB_PROVIDER_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Open GitHub provider settings <ExternalLink className="h-3 w-3" />
          </a>
        </Step>

        <Step n={5} title="Test it">
          <p className="text-sm text-muted-foreground mb-3">
            Save in the backend, then click the button below. It will probe the GitHub
            authorize endpoint and report the exact failure reason if anything is wrong.
          </p>
          <VerifyGitHubOAuth />
        </Step>
      </ol>
    </section>
  );
}

function VerifyGitHubOAuth() {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; message: string }
    | { kind: "error"; title: string; detail: string; hint?: string }
  >({ kind: "idle" });

  const run = async () => {
    setState({ kind: "checking" });
    try {
      // Ask Supabase for the GitHub authorize URL without redirecting the browser.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: window.location.origin + "/settings/auth",
          scopes: "read:user user:email",
          skipBrowserRedirect: true,
        },
      });

      if (error || !data?.url) {
        const msg = error?.message ?? "No authorize URL returned";
        if (/provider is not enabled/i.test(msg) || /unsupported provider/i.test(msg)) {
          setState({
            kind: "error",
            title: "GitHub provider is disabled in your backend",
            detail: msg,
            hint: "Open the GitHub provider settings (Step 4) and toggle 'Enable Sign in with GitHub' on, then save.",
          });
          return;
        }
        setState({ kind: "error", title: "Could not start OAuth flow", detail: msg });
        return;
      }

      // Probe the GitHub authorize URL — GitHub returns 200 on success or an
      // error page when the client_id / redirect_uri doesn't match.
      const authorizeUrl = data.url;
      let probeText = "";
      let probeStatus = 0;
      try {
        const res = await fetch(authorizeUrl, { method: "GET", redirect: "follow", mode: "cors" });
        probeStatus = res.status;
        probeText = await res.text().catch(() => "");
      } catch {
        // CORS will usually block reading the body; fall through to URL inspection.
      }

      const lower = probeText.toLowerCase();
      if (/redirect_uri is not associated/i.test(probeText) || /redirect_uri_mismatch/i.test(probeText)) {
        setState({
          kind: "error",
          title: "redirect_uri mismatch",
          detail:
            "GitHub rejected the callback URL. The 'Authorization callback URL' on your GitHub OAuth App must be exactly: " +
            GITHUB_CALLBACK_URL,
          hint: "Copy the callback URL from Step 2 and paste it into your GitHub OAuth App. Trailing slashes and http vs https matter.",
        });
        return;
      }
      if (lower.includes("the client_id and/or client_secret passed are incorrect") || /incorrect.*client_id/i.test(probeText)) {
        setState({
          kind: "error",
          title: "Client ID or Client Secret is wrong",
          detail: "GitHub says the credentials don't match an OAuth App.",
          hint: "Re-copy the Client ID and a fresh Client Secret from your GitHub OAuth App into the backend (Step 4).",
        });
        return;
      }
      if (probeStatus >= 400 && probeStatus !== 0) {
        setState({
          kind: "error",
          title: `GitHub returned HTTP ${probeStatus}`,
          detail: probeText.slice(0, 300) || "No response body. Open the URL manually to see the error.",
        });
        return;
      }

      setState({
        kind: "ok",
        message:
          "GitHub authorize URL generated and reachable. The provider is enabled and the callback host is registered. Click 'Link' above to finish a real sign-in test.",
      });
    } catch (e) {
      setState({
        kind: "error",
        title: "Verification failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={run} disabled={state.kind === "checking"} variant="outline">
        {state.kind === "checking" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Checking…
          </>
        ) : (
          "Verify GitHub OAuth works"
        )}
      </Button>

      {state.kind === "ok" && (
        <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span>{state.message}</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-1.5">
          <div className="flex gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <span className="font-display">{state.title}</span>
          </div>
          <div className="pl-6 text-muted-foreground break-words">{state.detail}</div>
          {state.hint && <div className="pl-6 text-xs text-foreground/80">→ {state.hint}</div>}
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-mono text-primary">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm mb-1.5">{title}</div>
        {children}
      </div>
    </li>
  );
}
