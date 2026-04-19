import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: () => (
    <RequireAuth><AppShell><Page /></AppShell></RequireAuth>
  ),
});

function Page() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    display_name: "", bio: "", skills: "", thinking_style: "", focus_areas: "",
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        setForm({
          display_name: data.display_name ?? "",
          bio: data.bio ?? "",
          skills: (data.skills ?? []).join(", "),
          thinking_style: data.thinking_style ?? "",
          focus_areas: (data.focus_areas ?? []).join(", "),
        });
      }
      setLoaded(true);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      display_name: form.display_name.trim() || null,
      bio: form.bio.trim() || null,
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      thinking_style: form.thinking_style.trim() || null,
      focus_areas: form.focus_areas.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    toast.success("Profile saved. The brain will use this.");
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-3xl mb-2">Cognitive profile</h1>
      <p className="text-sm text-muted-foreground mb-8">
        The agent uses this every time it suggests a move or answers a question. Be honest, be specific.
      </p>

      {!loaded ? <div className="text-muted-foreground">Loading…</div> : (
        <div className="glow-border rounded-lg p-6 space-y-4">
          <div>
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="What you build, who you help, your strengths." />
          </div>
          <div>
            <Label htmlFor="sk">Skills (comma-separated)</Label>
            <Input id="sk" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, design systems, Postgres, growth marketing" />
          </div>
          <div>
            <Label htmlFor="ts">How you think</Label>
            <Textarea id="ts" rows={3} value={form.thinking_style} onChange={(e) => setForm({ ...form, thinking_style: e.target.value })} placeholder="e.g. I get bored fast, prefer shipping ugly v1s, hate meetings, work in 3-hour blocks." />
          </div>
          <div>
            <Label htmlFor="fa">Focus areas this quarter</Label>
            <Input id="fa" value={form.focus_areas} onChange={(e) => setForm({ ...form, focus_areas: e.target.value })} placeholder="AI tooling, indie SaaS, monetization" />
          </div>
          <Button onClick={save} className="w-full bg-primary text-primary-foreground hover:opacity-90">Save profile</Button>
        </div>
      )}
    </div>
  );
}
