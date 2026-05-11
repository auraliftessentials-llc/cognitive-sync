/**
 * Quiet Mode banner + toggle.
 *
 * Shown at the top of the app when the Operator has paused autonomous
 * activity. The banner is intentionally warm, not alarming — pausing is a
 * sign of care, not failure.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Moon, Sun } from "lucide-react";
import { getQuietMode, setQuietMode } from "@/lib/quiet-mode.functions";
import { Button } from "@/components/ui/button";

export function QuietModeBanner() {
  const fetchState = useServerFn(getQuietMode);
  const updateState = useServerFn(setQuietMode);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchState({})
      .then((r) => {
        if (!alive) return;
        setEnabled(r.enabled);
        setUpdatedAt(r.updatedAt);
      })
      .catch(() => alive && setEnabled(false));
    return () => { alive = false; };
  }, [fetchState]);

  if (!enabled) return null;

  const since = updatedAt ? new Date(updatedAt).toLocaleString() : "now";

  return (
    <div className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-background to-primary/5">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 text-sm">
        <Moon className="h-4 w-4 shrink-0 text-primary" />
        <div className="flex-1">
          <div className="font-medium tracking-wide uppercase text-primary">Operator in Quiet Mode</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            Cron, webhooks, and Mac Bridge events are paused so you can think with humans.
            Reads and manual commands still work. Paused since {since}.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await updateState({ data: { enabled: false } });
              setEnabled(r.enabled);
            } finally { setBusy(false); }
          }}
        >
          <Sun className="h-3.5 w-3.5 mr-1.5" />
          Lift Quiet Mode
        </Button>
      </div>
    </div>
  );
}

/** Compact toggle for settings pages — no banner, just the control. */
export function QuietModeToggle() {
  const fetchState = useServerFn(getQuietMode);
  const updateState = useServerFn(setQuietMode);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchState({}).then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false));
  }, [fetchState]);

  if (enabled === null) return null;

  return (
    <Button
      size="sm"
      variant={enabled ? "default" : "outline"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await updateState({ data: { enabled: !enabled } });
          setEnabled(r.enabled);
        } finally { setBusy(false); }
      }}
    >
      {enabled ? <><Sun className="h-3.5 w-3.5 mr-1.5" /> Lift Quiet Mode</> : <><Moon className="h-3.5 w-3.5 mr-1.5" /> Enter Quiet Mode</>}
    </Button>
  );
}
