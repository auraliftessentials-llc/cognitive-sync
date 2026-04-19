import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Brain, Loader2, Send, Sparkles, Zap, History } from "lucide-react";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});

type Agent = {
  id: string;
  slug: string;
  name: string;
  role: string;
  emoji: string;
  system_prompt: string;
  default_model: string;
  available_models: string[];
  is_system: boolean;
};

type Run = {
  id: string;
  agent_id: string;
  model: string;
  prompt: string;
  output: string | null;
  status: string;
  duration_ms: number | null;
  created_at: string;
};

const MODEL_LABELS: Record<string, string> = {
  "google/gemini-2.5-flash": "Gemini 2.5 Flash · balanced",
  "google/gemini-2.5-pro": "Gemini 2.5 Pro · deep reasoning",
  "google/gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite · fastest",
  "openai/gpt-5": "GPT-5 · top-tier",
  "openai/gpt-5-mini": "GPT-5 mini · cost/perf",
  "openai/gpt-5-nano": "GPT-5 nano · ultra fast",
};

function AgentsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <AgentsInner />
      </AppShell>
    </RequireAuth>
  );
}

function AgentsInner() {
  const { user } = useAuth();
  const { current: workspace } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const active = useMemo(() => agents.find((a) => a.id === activeId) ?? null, [agents, activeId]);

  // Load agents
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("agents")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name");
      if (data) {
        setAgents(data as Agent[]);
        if (!activeId && data.length) {
          setActiveId(data[0].id);
          setModel(data[0].default_model);
        }
      }
    })();
  }, []);

  // Load runs + realtime subscription
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("agent_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setRuns(data as Run[]);
    })();

    const ch = supabase
      .channel("agent_runs_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_runs" },
        (payload) => {
          setRuns((prev) => {
            const next = [...prev];
            if (payload.eventType === "INSERT") {
              next.unshift(payload.new as Run);
            } else if (payload.eventType === "UPDATE") {
              const idx = next.findIndex((r) => r.id === (payload.new as Run).id);
              if (idx >= 0) next[idx] = payload.new as Run;
              else next.unshift(payload.new as Run);
            }
            return next.slice(0, 20);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  // When switching agents, reset model + clear stream
  useEffect(() => {
    if (active) {
      setModel(active.default_model);
      setOutput("");
      setHistory([]);
    }
  }, [activeId]);

  async function run() {
    if (!active || !prompt.trim() || streaming) return;
    const myPrompt = prompt.trim();
    setStreaming(true);
    setOutput("");

    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-stream`,
        {
          method: "POST",
          signal: ctl.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            agent_id: active.id,
            prompt: myPrompt,
            model,
            workspace_id: workspace?.id ?? null,
            history,
          }),
        },
      );

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "stream failed" }));
        throw new Error(err.error || "stream failed");
      }

      setPrompt("");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            if (j.meta) continue;
            const c = j.choices?.[0]?.delta?.content;
            if (c) {
              accumulated += c;
              setOutput(accumulated);
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      setHistory((h) => [
        ...h,
        { role: "user", content: myPrompt },
        { role: "assistant", content: accumulated },
      ]);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        toast.error(e.message || "Agent failed");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl tracking-wider flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            EXECUTIVE AGENTS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Brain-switching AI specialists. Pick a persona, pick a brain, ship.
          </p>
        </div>
        <Badge variant="outline" className="border-primary/40 text-primary">
          <Zap className="h-3 w-3 mr-1" /> Live · Realtime feed
        </Badge>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6">
        {/* Agent picker */}
        <aside className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground px-1 mb-2">
            Personas
          </div>
          {agents.map((a) => {
            const isActive = a.id === activeId;
            return (
              <button
                key={a.id}
                onClick={() => setActiveId(a.id)}
                className={`w-full text-left rounded-lg border px-3 py-3 transition-all ${
                  isActive
                    ? "border-primary/60 bg-primary/10 glow-text"
                    : "border-border hover:border-primary/30 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{a.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.role}</div>
                  </div>
                  {a.is_system && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0">SYS</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </aside>

        {/* Conversation */}
        <main className="space-y-4 min-w-0">
          {active ? (
            <>
              <Card className="p-4 border-primary/20">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="text-3xl">{active.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-display tracking-wider">{active.name.toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground">{active.role}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Brain
                    </span>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger className="h-8 w-[230px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {active.available_models.map((m) => (
                          <SelectItem key={m} value={m} className="text-xs">
                            {MODEL_LABELS[m] ?? m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 italic">
                  {active.system_prompt}
                </p>
              </Card>

              {/* Conversation transcript */}
              {(history.length > 0 || output) && (
                <Card className="p-4 max-h-[420px] overflow-auto space-y-4">
                  {history.map((m, i) => (
                    <div key={i}>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        {m.role === "user" ? "You" : active.name}
                      </div>
                      <div className="prose prose-sm prose-invert max-w-none text-sm">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                      <Separator className="mt-3" />
                    </div>
                  ))}
                  {output && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                        {active.name}
                        {streaming && <Loader2 className="h-3 w-3 animate-spin" />}
                      </div>
                      <div className="prose prose-sm prose-invert max-w-none text-sm">
                        <ReactMarkdown>{output}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Composer */}
              <Card className="p-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={`Ask ${active.name} anything…`}
                  className="min-h-[100px] border-0 focus-visible:ring-0 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      run();
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[10px] text-muted-foreground">
                    ⌘/Ctrl + Enter to run · history sent: {history.length} msgs
                  </div>
                  {streaming ? (
                    <Button size="sm" variant="destructive" onClick={stop}>
                      Stop
                    </Button>
                  ) : (
                    <Button size="sm" onClick={run} disabled={!prompt.trim()}>
                      <Send className="h-3 w-3 mr-1" /> Run
                    </Button>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">No agent selected.</div>
          )}
        </main>

        {/* Live runs feed */}
        <aside>
          <div className="text-xs uppercase tracking-wider text-muted-foreground px-1 mb-2 flex items-center gap-1">
            <History className="h-3 w-3" /> Live Runs
          </div>
          <ScrollArea className="h-[700px] pr-2">
            <div className="space-y-2">
              {runs.length === 0 && (
                <div className="text-xs text-muted-foreground p-3">No runs yet.</div>
              )}
              {runs.map((r) => {
                const ag = agents.find((a) => a.id === r.agent_id);
                return (
                  <Card key={r.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {ag?.emoji} {ag?.name ?? "Agent"}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "complete"
                            ? "text-green-500 border-green-500/40"
                            : r.status === "error"
                              ? "text-destructive border-destructive/40"
                              : "text-primary border-primary/40 animate-pulse"
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {MODEL_LABELS[r.model]?.split(" · ")[0] ?? r.model}
                      {r.duration_ms ? ` · ${(r.duration_ms / 1000).toFixed(1)}s` : ""}
                    </div>
                    <div className="line-clamp-2 text-foreground/80">{r.prompt}</div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
