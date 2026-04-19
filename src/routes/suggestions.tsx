import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Brain, X, Sparkles, AlertTriangle, Target, GitMerge } from "lucide-react";
import { generateSuggestions } from "@/lib/ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/suggestions")({
  component: () => (
    <RequireAuth><AppShell><Page /></AppShell></RequireAuth>
  ),
});

const kindMeta: Record<string, { icon: any; color: string; label: string }> = {
  next_move: { icon: Sparkles, color: "text-primary", label: "Next move" },
  overlap: { icon: GitMerge, color: "text-accent", label: "Overlap" },
  focus: { icon: Target, color: "text-pulse", label: "Focus" },
  risk: { icon: AlertTriangle, color: "text-destructive", label: "Risk" },
};

function Page() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("suggestions").select("*").eq("user_id", user.id).eq("dismissed", false)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const dismiss = async (id: string) => {
    await supabase.from("suggestions").update({ dismissed: true }).eq("id", id);
    load();
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await generateSuggestions();
      toast.success(`Generated ${r.inserted} suggestions`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl">Next moves</h1>
          <p className="text-sm text-muted-foreground">Agent-generated, based on your library.</p>
        </div>
        <Button onClick={generate} disabled={busy} className="bg-primary text-primary-foreground hover:opacity-90">
          <Brain className="h-4 w-4 mr-2" />
          {busy ? "Thinking…" : "Run agent"}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="glow-border rounded-lg p-10 text-center text-muted-foreground">
          No active suggestions. Click "Run agent" to generate some from your library.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => {
            const meta = kindMeta[s.kind] ?? kindMeta.next_move;
            const Icon = meta.icon;
            return (
              <li key={s.id} className="glow-border rounded-lg p-5 animate-fade-in-up">
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 ${meta.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{meta.label}</div>
                    <div className="font-display text-base mb-1">{s.title}</div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.body}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => dismiss(s.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
