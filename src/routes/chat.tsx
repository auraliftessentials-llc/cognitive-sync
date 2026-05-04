import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Plus, Send } from "lucide-react";
import { chatWithBrain } from "@/lib/ai.functions";
import { routeWithRace } from "@/lib/route-with-race";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  component: () => (
    <RequireAuth><AppShell><Chat /></AppShell></RequireAuth>
  ),
});

function Chat() {
  const { user } = useAuth();
  const [convos, setConvos] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConvos = async () => {
    if (!user) return;
    const { data } = await supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    setConvos(data ?? []);
    if (!activeId && data?.length) setActiveId(data[0].id);
  };
  useEffect(() => { loadConvos(); }, [user]);

  const loadMessages = async () => {
    if (!activeId) { setMessages([]); return; }
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", activeId).order("created_at");
    setMessages(data ?? []);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };
  useEffect(() => { loadMessages(); }, [activeId]);

  const newConvo = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("conversations").insert({ user_id: user.id, title: "New chat" }).select().single();
    if (error) return toast.error(error.message);
    setConvos([data, ...convos]);
    setActiveId(data.id);
  };

  const send = async () => {
    if (!input.trim() || !activeId || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    // Optimistic user bubble
    setMessages((m) => [...m, { id: "tmp-u", role: "user", content: text, created_at: new Date().toISOString() }]);

    // Build short history for the race peer (server persistence handles its own).
    const recent = messages.slice(-8).map((m: any) => ({ role: m.role, content: m.content }));

    // Race the client-side peer for INSTANT optimistic display while the
    // server function runs persistence + full-context retrieval in parallel.
    const racePromise = routeWithRace({
      prompt: text,
      history: recent as any,
      // Chat doesn't need server tool-calling for most prompts → give Puter
      // an even chance (no head start) so the user sees a reply ASAP.
      serverHeadStartMs: 0,
    }).catch(() => null);

    const persistPromise = chatWithBrain({ data: { conversationId: activeId, message: text } });

    try {
      const race = await racePromise;
      if (race?.ok && race.output) {
        // Show optimistic assistant reply tagged so we can replace it on persist.
        setMessages((m) => [
          ...m.filter((x) => x.id !== "tmp-a"),
          {
            id: "tmp-a",
            role: "assistant",
            content: race.output,
            created_at: new Date().toISOString(),
            _optimistic: true,
            _source: race.source,
            _provider: race.provider,
          },
        ]);
      }
      await persistPromise;
      await loadMessages();
      // Update title from first message
      const c = convos.find((c) => c.id === activeId);
      if (c?.title === "New chat") {
        const newTitle = text.slice(0, 50);
        await supabase.from("conversations").update({ title: newTitle }).eq("id", activeId);
        loadConvos();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
      setMessages((m) => m.filter((x) => x.id !== "tmp-u" && x.id !== "tmp-a"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen">
      <div className="w-64 border-r border-border bg-card/30 p-3 flex flex-col">
        <Button onClick={newConvo} variant="outline" className="mb-3"><Plus className="h-4 w-4 mr-2" /> New chat</Button>
        <div className="flex-1 overflow-y-auto space-y-1">
          {convos.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm truncate ${
                activeId === c.id ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {c.title}
            </button>
          ))}
          {convos.length === 0 && <p className="text-xs text-muted-foreground p-2">No chats yet.</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="border-b border-border p-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <span className="font-display text-sm">Brain</span>
          <span className="text-xs text-muted-foreground ml-auto">Knows your full library + profile</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!activeId ? (
            <div className="text-center text-muted-foreground py-20">
              Start a new chat to talk to your brain.
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">
              Ask anything. Try: <em>"What should I work on today?"</em>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary/15 border border-primary/30"
                    : "bg-card border border-border"
                }`}>
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground">
                <span className="inline-flex gap-1">
                  <span className="pulse-dot" /> thinking…
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={activeId ? "Ask the brain…" : "Create a chat first"}
              disabled={!activeId || sending}
              rows={2}
              className="resize-none"
            />
            <Button onClick={send} disabled={!input.trim() || !activeId || sending} className="bg-primary text-primary-foreground hover:opacity-90 self-end">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
