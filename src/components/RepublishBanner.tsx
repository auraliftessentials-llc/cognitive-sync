import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, X, Rocket, CheckCircle2, ExternalLink, Loader2, KeyRound } from "lucide-react";
import { getRepublishStatus, setRepublishNotice, type RepublishStatus } from "@/lib/notices.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PROVIDER_LABELS: Record<string, string> = {
  supabase: "Backend (Supabase)",
  lovable: "Lovable AI Gateway",
  openai: "OpenAI",
  anthropic: "Anthropic",
  xai: "xAI",
  gemini: "Google Gemini",
};

function formatProvider(p: string) {
  return PROVIDER_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function RepublishBanner() {
  const fetchStatus = useServerFn(getRepublishStatus);
  const setNotice = useServerFn(setRepublishNotice);
  const [status, setStatus] = useState<RepublishStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchStatus();
      setStatus(res);
    } catch {
      // silently ignore — banner just won't show
    }
  }, [fetchStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible =
    !hidden &&
    !!status?.needsRepublish &&
    !(status.notice?.dismissedAt && !status.notice?.acknowledgedAt
      ? false
      : status.notice?.acknowledgedAt);

  // Show banner if needs republish AND not yet acknowledged.
  // Dismissing without acknowledging hides until next page load — but persists per-user.
  const shouldShow = !hidden && !!status?.needsRepublish;

  if (!shouldShow) return null;

  const dismiss = async (acknowledge: boolean) => {
    setBusy(true);
    try {
      await setNotice({ data: { acknowledge } });
      setHidden(true);
      if (acknowledge) setOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const stale = status?.staleProviders ?? [];
  const latest = status?.latest;

  return (
    <>
      <div className="relative border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/15 backdrop-blur-sm">
        <div className="px-4 py-2.5 flex items-center gap-3 text-sm">
          <div className="relative shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 text-amber-100">
            <span className="font-semibold tracking-wide">Re-publish required</span>
            <span className="mx-2 text-amber-100/40">·</span>
            <span className="text-amber-100/85">
              {stale.length > 0 ? (
                <>
                  Keys rotated for{" "}
                  <strong className="text-amber-50">
                    {stale.slice(0, 3).map(formatProvider).join(", ")}
                    {stale.length > 3 ? ` +${stale.length - 3}` : ""}
                  </strong>
                  . Live site is using old keys until you publish.
                </>
              ) : (
                <>Backend keys were rotated. Live site is using old keys until you publish.</>
              )}
            </span>
            {latest && (
              <span className="ml-2 text-[11px] text-amber-100/50 font-mono hidden sm:inline">
                {timeAgo(latest.rotatedAt)}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            className="h-7 px-2.5 border-amber-400/40 bg-amber-400/10 text-amber-50 hover:bg-amber-400/20 hover:text-white shrink-0 text-xs gap-1.5"
          >
            <Rocket className="h-3 w-3" />
            How to publish
          </Button>
          <button
            onClick={() => dismiss(false)}
            disabled={busy}
            aria-label="Hide"
            className="p-1 rounded hover:bg-amber-500/20 transition shrink-0 text-amber-200 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500/30 to-orange-500/20 border border-amber-400/30 flex items-center justify-center">
                <Rocket className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <DialogTitle className="text-lg">Publish to apply new keys</DialogTitle>
                <DialogDescription className="text-xs">
                  Your live site won't pick up rotated credentials until you re-publish.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {stale.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 mb-2">
              <div className="text-[10px] uppercase tracking-wider text-amber-300/80 mb-2 flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" />
                Stale credentials
              </div>
              <ul className="space-y-1">
                {stale.map((p) => (
                  <li key={p} className="text-xs text-amber-50 flex items-center justify-between">
                    <span>{formatProvider(p)}</span>
                    <span className="text-[10px] text-amber-200/60 font-mono">rotated</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="space-y-3 my-2">
            <Step n={1} title="Open the Publish dialog">
              Click the <strong className="text-foreground">Publish</strong> button in the top-right of the
              Lovable editor. On mobile, tap the <strong className="text-foreground">…</strong> menu in the bottom-right and choose Publish.
            </Step>
            <Step n={2} title="Click Update">
              In the dialog, press <strong className="text-foreground">Update</strong> to redeploy the live site with the new credentials.
            </Step>
            <Step n={3} title="Verify">
              Visit your published URL and confirm signed-in actions work. If you see auth errors, hard-refresh.
            </Step>
          </ol>

          <a
            href="https://docs.lovable.dev/features/deploy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Full publishing docs
            <ExternalLink className="h-3 w-3" />
          </a>

          <DialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismiss(false)}
              disabled={busy}
            >
              Remind me later
            </Button>
            <Button
              size="sm"
              onClick={() => dismiss(true)}
              disabled={busy}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-semibold gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              I've re-published
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 h-6 w-6 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-display flex items-center justify-center">
        {n}
      </span>
      <div className="text-xs text-muted-foreground leading-relaxed">
        <div className="text-sm text-foreground font-medium mb-0.5">{title}</div>
        {children}
      </div>
    </li>
  );
}
