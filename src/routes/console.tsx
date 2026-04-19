import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Merkabah } from "@/components/Merkabah";
import { supabase } from "@/integrations/supabase/client";
import { consoleRun } from "@/lib/console.functions";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

type Line =
  | { kind: "system"; text: string }
  | { kind: "prompt"; agent: string; text: string }
  | { kind: "user"; text: string }
  | { kind: "agent"; agent: string; emoji: string; text: string; model: string }
  | { kind: "tool"; name: string; ok: boolean; ms: number; preview: string }
  | { kind: "error"; text: string };

type Agent = { id: string; slug: string; name: string; emoji: string; default_model: string; available_models: string[] };

export const Route = createFileRoute("/console")({
  validateSearch: (s: Record<string, unknown>) => ({
    agent: typeof s.agent === "string" ? s.agent : undefined,
    cmd: typeof s.cmd === "string" ? s.cmd : undefined,
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ConsoleScreen />
      </AppShell>
    </RequireAuth>
  ),
});

function ConsoleScreen() {
  const search = useSearch({ from: "/console" });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>(search.agent ?? "ceo-grok");
  const [model, setModel] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([
    { kind: "system", text: "MERKABAH OS · Console v1.0 — type /help" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = useMemo(() => agents.find((a) => a.slug === activeSlug), [agents, activeSlug]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("agents").select("*").order("is_system", { ascending: false }).order("name");
      if (data) {
        setAgents(data as Agent[]);
        const a = (data as Agent[]).find((x) => x.slug === activeSlug) ?? (data as Agent[])[0];
        if (a) {
          setActiveSlug(a.slug);
          setModel(a.default_model);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (active) setModel(active.default_model);
  }, [active?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  // Auto-fire if ?cmd= present
  useEffect(() => {
    if (search.cmd && agents.length && !busy) {
      execute(search.cmd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.cmd, agents.length]);

  async function execute(rawText: string) {
    const text = rawText.trim();
    if (!text || busy) return;

    // Slash commands
    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.split(/\s+/);
      const arg = rest.join(" ");
      if (cmd === "/help") {
        push({ kind: "system", text:
          "Commands:\n" +
          "  /agent <slug>     switch agent (ceo-grok, atlas, cipher, forge, echo)\n" +
          "  /brain <model>    switch brain (x-ai/grok-4, openai/gpt-5, google/gemini-2.5-pro …)\n" +
          "  /zoho deals       show recent CRM deals\n" +
          "  /zoho leads       show recent CRM leads\n" +
          "  /zoho contacts    show recent contacts\n" +
          "  /zoho tasks       show recent tasks\n" +
          "  /zoho mail        show recent inbox\n" +
          "  /clear            clear screen\n" +
          "  Anything else is sent to the active agent.",
        });
        return;
      }
      if (cmd === "/clear") { setLines([{ kind: "system", text: "Console cleared." }]); setHistory([]); return; }
      if (cmd === "/agent") {
        const a = agents.find((x) => x.slug === arg);
        if (!a) { push({ kind: "error", text: `No agent: ${arg}` }); return; }
        setActiveSlug(a.slug);
        push({ kind: "system", text: `→ Switched to ${a.emoji} ${a.name}` });
        return;
      }
      if (cmd === "/brain") {
        if (!active?.available_models.includes(arg)) {
          push({ kind: "error", text: `Brain not allowed for ${active?.name}: ${arg}` });
          return;
        }
        setModel(arg);
        push({ kind: "system", text: `→ Brain swapped to ${arg}` });
        return;
      }
      if (cmd === "/zoho") {
        const map: Record<string, string> = {
          deals: "Show me my top 10 most recent Zoho deals as a clean markdown table with stage and amount.",
          leads: "Pull my latest 10 Zoho leads. Group by status.",
          contacts: "List my last 10 Zoho contacts with email + company.",
          tasks: "Show my open Zoho tasks ordered by due date.",
          mail: "Summarize my last 10 Zoho inbox messages — sender, subject, why it matters.",
        };
        const sub = arg.split(" ")[0];
        const expanded = map[sub];
        if (!expanded) { push({ kind: "error", text: `Unknown /zoho subcommand: ${sub}` }); return; }
        return runAgent(expanded);
      }
      push({ kind: "error", text: `Unknown command: ${cmd} — try /help` });
      return;
    }

    return runAgent(text);
  }

  function push(l: Line) { setLines((prev) => [...prev, l]); }

  async function runAgent(text: string) {
    if (!active) { push({ kind: "error", text: "No agent loaded yet." }); return; }
    push({ kind: "user", text });
    setBusy(true);
    push({ kind: "system", text: `${active.emoji} ${active.name} thinking on ${model}…` });

    try {
      const res = await consoleRun({
        data: {
          agent_slug: active.slug,
          prompt: text,
          model,
          history,
        },
      });
      for (const tc of res.tool_calls) {
        push({
          kind: "tool",
          name: tc.name,
          ok: tc.ok,
          ms: tc.ms,
          preview: tc.ok
            ? JSON.stringify(tc.result).slice(0, 160) + "…"
            : tc.error ?? "tool error",
        });
      }
      push({
        kind: "agent",
        agent: res.agent.name,
        emoji: res.agent.emoji,
        text: res.output,
        model: res.model,
      });
      setHistory((h) => [
        ...h,
        { role: "user" as const, content: text },
        { role: "assistant" as const, content: res.output },
      ].slice(-12));
    } catch (e: any) {
      push({ kind: "error", text: e?.message ?? "Console error" });
      toast.error(e?.message ?? "Console error");
    } finally {
      setBusy(false);
      setInput("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Merkabah size={48} />
          <div>
            <div className="text-[10px] tracking-[0.4em] uppercase text-brand-cyan font-display">
              MERKABAH · CONSOLE
            </div>
            <h1 className="font-display fluid-display merkabah-text font-semibold tracking-[0.05em]">
              THE OPERATOR'S TERMINAL
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-brand-blue/50 text-brand-blue glow-brand-blue">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-blue animate-pulse" />
            {active?.emoji} {active?.name ?? "—"}
          </Badge>
          <Badge variant="outline" className="border-primary/40 text-primary font-mono text-[10px]">
            {model || "…"}
          </Badge>
        </div>
      </header>

      <div className="relative cathedral-card rounded-xl overflow-hidden scanline">
        <div className="absolute inset-0 neural-grid opacity-30 pointer-events-none" />
        <div
          ref={scrollRef}
          className="relative h-[62vh] overflow-y-auto p-5 fluid-mono font-display"
        >
          {lines.map((l, i) => (
            <LineRow key={i} line={l} />
          ))}
          {busy && (
            <div className="text-brand-cyan/80 mt-1">
              <span className="text-brand-cyan">▮</span>
              <span className="caret">▮</span>
            </div>
          )}
        </div>

        <form
          className="relative border-t border-border/60 bg-background/60 backdrop-blur p-3 flex items-start gap-2"
          onSubmit={(e) => { e.preventDefault(); execute(input); }}
        >
          <span className="text-brand-cyan mt-2 font-display select-none">{">"}</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Talk to ${active?.name ?? "the operator"} — try /help`}
            className="flex-1 bg-transparent border-0 outline-none resize-none fluid-input font-display text-foreground/95 placeholder:text-muted-foreground/60 min-h-[44px] max-h-[180px]"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                execute(input);
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-display tracking-widest border border-brand-blue/50 text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40"
          >
            EXEC
          </button>
        </form>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground font-mono">
        Press <kbd className="border rounded px-1">⌘K</kbd> for command palette · Enter to run · Shift+Enter newline
      </p>
    </div>
  );
}

function LineRow({ line }: { line: Line }) {
  if (line.kind === "system") {
    return <div className="text-brand-cyan/70 whitespace-pre-wrap mb-1">{line.text}</div>;
  }
  if (line.kind === "user") {
    return (
      <div className="mb-2">
        <span className="text-brand-blue">[you]</span>{" "}
        <span className="text-foreground/95 whitespace-pre-wrap">{line.text}</span>
      </div>
    );
  }
  if (line.kind === "tool") {
    return (
      <div className={`mb-1 text-[11px] ${line.ok ? "text-brand-green" : "text-destructive"}`}
           style={{ color: line.ok ? "var(--brand-green)" : undefined }}>
        ⚙ {line.name} · {line.ms}ms — {line.preview}
      </div>
    );
  }
  if (line.kind === "error") {
    return <div className="text-destructive mb-1">! {line.text}</div>;
  }
  if (line.kind === "agent") {
    return (
      <div className="mb-3 animate-fade-in-up">
        <div className="text-[10px] uppercase tracking-[0.3em] text-brand-cyan mb-1">
          {line.emoji} {line.agent} · {line.model}
        </div>
        <div className="prose prose-invert max-w-none fluid-body">
          <ReactMarkdown>{line.text}</ReactMarkdown>
        </div>
      </div>
    );
  }
  // prompt
  return (
    <div className="mb-1 text-brand-cyan/60 text-[11px]">
      → {line.agent}: {line.text}
    </div>
  );
}
