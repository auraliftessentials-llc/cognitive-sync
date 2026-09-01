import { useEffect, useState } from "react";
import { asArray } from "@/lib/safe-data";
import { useServerFn } from "@tanstack/react-start";
import { getRecentIntel, triggerFrontierScan, type IntelItem } from "@/lib/frontier-intel.functions";
import { Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function FrontierIntelPanel() {
  const getFn = useServerFn(getRecentIntel);
  const scanFn = useServerFn(triggerFrontierScan);
  const [items, setItems] = useState<IntelItem[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setItems(asArray<IntelItem>(await getFn())); } catch { /* ignore (e.g. 401 while auth is off) */ }
  };

  useEffect(() => { void load(); }, []);

  const scan = async () => {
    setBusy(true);
    try {
      const r = await scanFn();
      if (r.error) toast.error(`Scan: ${r.error}`);
      else toast.success(`Ingested ${r.inserted} new signals`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ? `Scan failed: ${e.message}` : "Scan unavailable (sign-in required)");
    } finally { setBusy(false); }
  };


  return (
    <div className="rounded-lg border border-primary/20 bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-wide uppercase">Frontier Intel</h3>
          <span className="text-xs text-muted-foreground">Self-evolving core</span>
        </div>
        <Button size="sm" variant="ghost" onClick={scan} disabled={busy}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          <span className="ml-1.5 text-xs">Scan now</span>
        </Button>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-border">
        {items.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No signals yet. Click "Scan now" to ingest the latest AI breakthroughs.
          </p>
        )}
        {items.map((it) => (
          <div key={it.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{it.category}</span>
                  <span>{it.source}</span>
                  <span>· impact {it.impact_score}/10</span>
                </div>
                <h4 className="mt-1 text-sm font-medium leading-tight">{it.title}</h4>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{it.summary}</p>
              </div>
              {it.url && (
                <a href={it.url} target="_blank" rel="noopener noreferrer"
                   className="shrink-0 text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
