/**
 * Web Terminal — true terminal emulator backed by /api/cli/stream SSE.
 * Streams tokens character-by-character, shows tool traces inline,
 * and renders a green-on-black classic terminal aesthetic.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { listCliTokens, createCliToken } from "@/lib/cli-tokens.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Terminal as TerminalIcon, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/terminal")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <TerminalScreen />
      </AppShell>
    </RequireAuth>
  ),
});

type Block =
  | { kind: "prompt"; text: string }
  | { kind: "stream"; id: string; text: string; meta?: { agent: string; model: string; provider: string } }
  | { kind: "tool"; name: string; ok?: boolean; ms?: number; preview?: string }
  | { kind: "fallback"; provider: string; status: number; error?: string }
  | { kind: "system"; text: string }
  | { kind: "error"; text: string };

const TOKEN_KEY = "merkabah_web_term_token";

function TerminalScreen() {
  const [token, setToken] = useState<string>("");
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [input, setInput] = useState("");
  const [agent, setAgent] = useState("ceo-grok");
  const [busy, setBusy] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([
    { kind: "system", text: "MERKABAH WEB TERMINAL — streaming SSE bridge to /api/cli/stream\nType a message and press Enter. Use ↑/↓ for history. /agent <slug> to switch." },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = localStorage.getItem(TOKEN_KEY);
    if (cached) { setToken(cached); setHasToken(true); }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [blocks]);

  async function provisionToken() {
    setBusy(true);
    try {
      const list = await listCliTokens();
      const existing = (list.tokens as any[]).find((t: any) => t.name === "Web Terminal");
      if (existing) {
        toast.error("A 'Web Terminal' token already exists. Delete it from Admin → CLI first, or paste an existing token.");
        return;
      }
      const minted: any = await createCliToken({ data: { name: "Web Terminal", scopes: ["read", "agent", "tools"] } });
      localStorage.setItem(TOKEN_KEY, minted.token);
      setToken(minted.token); setHasToken(true);
      toast.success("Token provisioned and saved to this browser.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to mint token");
    } finally { setBusy(false); }
  }

  function saveToken() {
    const t = token.trim();
    if (!t.startsWith("nrl_")) { toast.error("Token must start with nrl_"); return; }
    localStorage.setItem(TOKEN_KEY, t);
    setHasToken(true);
    toast.success("Token saved");
  }

  function push(b: Block) { setBlocks((prev) => [...prev, b]); }
  function patchStream(id: string, delta: string) {
    setBlocks((prev) => prev.map((b) => (b.kind === "stream" && b.id === id ? { ...b, text: b.text + delta } : b)));
  }
  function patchStreamMeta(id: string, meta: any) {
    setBlocks((prev) => prev.map((b) => (b.kind === "stream" && b.id === id ? { ...b, meta } : b)));
  }

  async function execute(raw: string) {
    const text = raw.trim();
    if (!text) return;
    if (text.startsWith("/agent ")) {
      const slug = text.slice(7).trim();
      setAgent(slug);
      push({ kind: "system", text: `→ agent set to ${slug}` });
      return;
    }
    if (text === "/clear") { setBlocks([{ kind: "system", text: "(cleared)" }]); return; }
    if (text === "/help") {
      push({ kind: "system", text: "/agent <slug>  /clear  /help\nAnything else streams to the active agent via SSE." });
      return;
    }
    if (!hasToken) { push({ kind: "error", text: "No CLI token configured." }); return; }

    setHistory((h) => [text, ...h].slice(0, 50));
    setHistIdx(-1);
    push({ kind: "prompt", text });

    const streamId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    push({ kind: "stream", id: streamId, text: "" });
    setBusy(true);

    try {
      const resp = await fetch("/api/cli/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: text, agent_slug: agent }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.text().catch(() => "");
        push({ kind: "error", text: `[${resp.status}] ${err.slice(0, 300)}` });
        return;
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let evt = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).replace(/\r$/, "");
          buf = buf.slice(i + 1);
          if (line.startsWith("event: ")) { evt = line.slice(7).trim(); continue; }
          if (line.startsWith("data: ")) {
            const json = line.slice(6);
            let d: any = {}; try { d = JSON.parse(json); } catch { continue; }
            if (evt === "meta") patchStreamMeta(streamId, { agent: d.agent, model: d.model, provider: d.provider });
            else if (evt === "token" && typeof d.delta === "string") patchStream(streamId, d.delta);
            else if (evt === "tool_call") push({ kind: "tool", name: d.name });
            else if (evt === "tool_result") setBlocks((prev) => {
              // patch the most recent matching tool block without an ok yet
              for (let k = prev.length - 1; k >= 0; k--) {
                const b = prev[k];
                if (b.kind === "tool" && b.name === d.name && b.ok === undefined) {
                  const next = prev.slice();
                  next[k] = { ...b, ok: !!d.ok, ms: d.ms, preview: d.preview ?? d.error };
                  return next;
                }
              }
              return [...prev, { kind: "tool", name: d.name, ok: !!d.ok, ms: d.ms, preview: d.preview ?? d.error }];
            });
            else if (evt === "fallback") push({ kind: "fallback", provider: d.provider, status: d.status, error: d.error });
            else if (evt === "error") push({ kind: "error", text: d.message ?? "stream error" });
            else if (evt === "done") { /* terminal — already rendered */ }
          } else if (line === "") { evt = ""; }
        }
      }
    } catch (e: any) {
      push({ kind: "error", text: e?.message ?? "stream failed" });
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const t = input;
      setInput("");
      execute(t);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(history.length - 1, histIdx + 1);
      if (history[next] !== undefined) { setHistIdx(next); setInput(history[next]); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      if (next < 0) { setHistIdx(-1); setInput(""); } else { setHistIdx(next); setInput(history[next]); }
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl tracking-wider">WEB TERMINAL</h1>
          <span className="text-xs text-muted-foreground ml-2">streaming · agent={agent}</span>
        </div>
      </div>

      {!hasToken && (
        <Card className="p-4 mb-4 border-primary/30 bg-primary/5 space-y-3">
          <p className="text-sm">This terminal authenticates with a CLI token. Provision one for this browser, or paste an existing token.</p>
          <div className="flex gap-2">
            <Button onClick={provisionToken} disabled={busy} size="sm">
              <Zap className="h-3.5 w-3.5 mr-1.5" /> Provision token
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="nrl_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono text-xs"
            />
            <Button variant="outline" onClick={saveToken} size="sm">Save token</Button>
          </div>
        </Card>
      )}

      <Card className="bg-black border-green-500/30 p-0 overflow-hidden">
        <div
          ref={scrollRef}
          className="font-mono text-[12.5px] leading-relaxed text-green-400 p-4 h-[60vh] overflow-y-auto whitespace-pre-wrap"
        >
          {blocks.map((b, i) => {
            if (b.kind === "system") return <div key={i} className="text-cyan-400 opacity-80">{b.text}</div>;
            if (b.kind === "error") return <div key={i} className="text-red-400">⨯ {b.text}</div>;
            if (b.kind === "prompt") return <div key={i} className="mt-3"><span className="text-yellow-400">❯ </span>{b.text}</div>;
            if (b.kind === "tool") return (
              <div key={i} className="text-fuchsia-400 text-[11.5px] my-1">
                {b.ok === undefined ? "⏳" : b.ok ? "✓" : "⨯"} {b.name}{b.ms !== undefined ? ` (${b.ms}ms)` : ""}{b.preview ? ` — ${b.preview.slice(0, 200)}` : ""}
              </div>
            );
            if (b.kind === "fallback") return <div key={i} className="text-amber-400 text-[11px]">↪ fallback {b.provider} [{b.status}] {b.error?.slice(0, 120)}</div>;
            // stream
            return (
              <div key={i} className="my-1">
                {b.meta && <div className="text-[10px] text-green-600">[{b.meta.provider} · {b.meta.model}]</div>}
                <div>{b.text}{busy && i === blocks.length - 1 ? <span className="animate-pulse">▌</span> : null}</div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-green-500/20 bg-black p-2 flex items-center gap-2">
          <span className="text-yellow-400 font-mono text-sm">❯</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={hasToken ? "type a message…" : "configure token first"}
            disabled={!hasToken || busy}
            className="flex-1 bg-transparent border-0 outline-none text-green-300 font-mono text-sm placeholder:text-green-700"
            autoFocus
          />
        </div>
      </Card>
    </div>
  );
}
