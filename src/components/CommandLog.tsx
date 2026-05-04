/**
 * CommandLog — realtime feed of merkabah_commands for the current Operator.
 *
 * - Subscribes to postgres_changes on public.merkabah_commands (RLS-scoped).
 * - Inline composer fires runMerkabahCommand server fn → row appears + flips
 *   from `executing` → `complete`/`error` via realtime, no manual refetch.
 * - Click a row to expand the full output.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runMerkabahCommand } from "@/lib/merkabah-command.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Terminal, CheckCircle2, AlertTriangle, Trophy, Clock } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  command: string;
  status: "executing" | "complete" | "error";
  source: string;
  winner: string | null;
  latency_ms: number | null;
  error: string | null;
  result: { output?: string; provider?: string; model?: string } | null;
  created_at: string;
};

const PAGE = 50;

export function CommandLog() {
  const { user } = useAuth();
  const fire = useServerFn(runMerkabahCommand);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initial fetch + realtime subscription.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("merkabah_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (!alive) return;
      if (error) toast.error(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();

    const ch = supabase
      .channel("merkabah_commands_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merkabah_commands" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              const r = payload.new as Row;
              if (prev.find((x) => x.id === r.id)) return prev;
              return [r, ...prev].slice(0, PAGE);
            }
            if (payload.eventType === "UPDATE") {
              const r = payload.new as Row;
              return prev.map((x) => (x.id === r.id ? { ...x, ...r } : x));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((x) => x.id !== (payload.old as any).id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [user]);

  const submit = async () => {
    const command = input.trim();
    if (!command || sending) return;
    setSending(true);
    setInput("");
    try {
      await fire({ data: { command, source: "ui" } });
    } catch (e: any) {
      toast.error(e?.message ?? "Command failed");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter((r) => r.status === "complete").length;
    const exec = rows.filter((r) => r.status === "executing").length;
    const err = rows.filter((r) => r.status === "error").length;
    const lat = rows.filter((r) => r.latency_ms).map((r) => r.latency_ms!) as number[];
    const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
    return { total, ok, exec, err, avg };
  }, [rows]);

  return (
    <div className="flex flex-col h-full">
      {/* Composer */}
      <div className="border-b border-border bg-card/30 backdrop-blur-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="h-4 w-4 text-brand-cyan" />
          <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-display">
            Merkabah Command
          </span>
          <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
            <span><CheckCircle2 className="inline h-3 w-3 text-emerald-400 mr-1" />{stats.ok}</span>
            <span><Loader2 className="inline h-3 w-3 text-brand-cyan mr-1" />{stats.exec}</span>
            <span><AlertTriangle className="inline h-3 w-3 text-amber-400 mr-1" />{stats.err}</span>
            {stats.avg > 0 && <span><Clock className="inline h-3 w-3 mr-1" />{stats.avg}ms avg</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Issue a command — Grok 4 races the fallback chain. ⌘↵ to fire."
            rows={2}
            disabled={sending}
            className="flex-1 rounded-md border border-border bg-background/60 px-3 py-2 text-sm font-mono resize-none focus:border-brand-cyan/60 focus:outline-none disabled:opacity-60"
          />
          <Button onClick={submit} disabled={sending || !input.trim()} className="shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading log…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No commands yet. Issue one above to start the log.
          </div>
        ) : (
          rows.map((r) => {
            const open = expanded === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setExpanded(open ? null : r.id)}
                className={`w-full text-left rounded-md border transition-all p-3 ${
                  r.status === "error"
                    ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                    : r.status === "executing"
                    ? "border-brand-cyan/30 bg-brand-cyan/5 hover:border-brand-cyan/50"
                    : "border-border bg-card/30 hover:border-primary/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {r.status === "executing" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-cyan" />
                    ) : r.status === "error" ? (
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      <span className="font-mono">{r.source}</span>
                      {r.winner && <span className="text-brand-violet"><Trophy className="inline h-3 w-3 mr-0.5" />{r.winner}</span>}
                      {r.latency_ms != null && <span>{r.latency_ms}ms</span>}
                      <span className="ml-auto">{new Date(r.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-sm font-mono truncate">{r.command}</div>
                    {open && (
                      <div className="mt-3 pt-3 border-t border-border/40">
                        {r.error ? (
                          <div className="text-sm text-amber-400 whitespace-pre-wrap">{r.error}</div>
                        ) : r.result?.output ? (
                          <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                            {r.result.output}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">No output yet…</div>
                        )}
                        {r.result?.model && (
                          <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                            {r.result.provider} · {r.result.model}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
