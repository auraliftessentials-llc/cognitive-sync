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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Github as GH, Sparkles, Pencil } from "lucide-react";
import { toast } from "sonner";
import { summarizeProject } from "@/lib/ai.functions";

export const Route = createFileRoute("/projects")({
  component: () => (
    <RequireAuth><AppShell><Projects /></AppShell></RequireAuth>
  ),
});

type P = {
  id: string; name: string; description: string | null; status: string;
  repo_url: string | null; live_url: string | null;
  tech_stack: string[]; tags: string[]; notes: string | null; priority: number;
};

const ORG_PREFIX = "org:";

const empty = {
  name: "", description: "", status: "active", repo_url: "", live_url: "",
  tech_stack: "", tags: "", notes: "", priority: 3,
};

function Projects() {
  const { user } = useAuth();
  const [items, setItems] = useState<P[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState("");
  const [activeOrg, setActiveOrg] = useState<string | null>(null);
  const [editing, setEditing] = useState<P | null>(null);
  const [editForm, setEditForm] = useState({ name: "", status: "active", priority: 3, notes: "" });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("projects").select("*").eq("user_id", user.id).order("priority").order("updated_at", { ascending: false });
    setItems((data as P[]) ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const save = async () => {
    if (!user || !form.name.trim()) { toast.error("Name required"); return; }
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      status: form.status,
      repo_url: form.repo_url.trim() || null,
      live_url: form.live_url.trim() || null,
      tech_stack: form.tech_stack.split(",").map((s) => s.trim()).filter(Boolean),
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      notes: form.notes.trim() || null,
      priority: Number(form.priority) || 3,
    };
    const { error } = await supabase.from("projects").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Project added");
    setForm(empty); setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const openEdit = (p: P) => {
    setEditing(p);
    setEditForm({ name: p.name, status: p.status, priority: p.priority, notes: p.notes ?? "" });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.name.trim()) return toast.error("Name required");
    const { error } = await supabase.from("projects").update({
      name: editForm.name.trim(),
      status: editForm.status,
      priority: Number(editForm.priority) || 3,
      notes: editForm.notes.trim() || null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditing(null);
    load();
  };

  const summarize = async (id: string) => {
    toast.loading("Summarizing…", { id });
    try {
      const r = await summarizeProject({ data: { projectId: id } });
      toast.success(r.summary, { id, duration: 8000 });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed", { id });
    }
  };

  // Distinct orgs from tags like "org:acme-co"
  const orgs = Array.from(
    new Set(
      items.flatMap((p) =>
        (p.tags ?? [])
          .filter((t) => t.startsWith(ORG_PREFIX))
          .map((t) => t.slice(ORG_PREFIX.length)),
      ),
    ),
  ).sort();

  const filtered = items.filter((p) => {
    const matchesText =
      !filter ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()));
    const matchesOrg =
      !activeOrg || (p.tags ?? []).includes(`${ORG_PREFIX}${activeOrg}`);
    return matchesText && matchesOrg;
  });

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Library</h1>
          <p className="text-sm text-muted-foreground">{items.length} projects in the network</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Name" v={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status" v={form.status} onChange={(v) => setForm({ ...form, status: v })} />
                  <Field label="Priority (1-5)" v={String(form.priority)} onChange={(v) => setForm({ ...form, priority: Number(v) || 3 })} />
                </div>
                <Field label="Repo URL" v={form.repo_url} onChange={(v) => setForm({ ...form, repo_url: v })} />
                <Field label="Live URL" v={form.live_url} onChange={(v) => setForm({ ...form, live_url: v })} />
                <Field label="Tech stack (comma-sep)" v={form.tech_stack} onChange={(v) => setForm({ ...form, tech_stack: v })} />
                <Field label="Tags (comma-sep)" v={form.tags} onChange={(v) => setForm({ ...form, tags: v })} />
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
                <Button onClick={save} className="w-full bg-primary text-primary-foreground">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {orgs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mr-1">Org</span>
          <button
            onClick={() => setActiveOrg(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${
              activeOrg === null
                ? "bg-primary/15 text-primary border-primary/40"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            All
            <span className="ml-1 opacity-60">{items.length}</span>
          </button>
          {orgs.map((org) => {
            const count = items.filter((p) => (p.tags ?? []).includes(`${ORG_PREFIX}${org}`)).length;
            const active = activeOrg === org;
            return (
              <button
                key={org}
                onClick={() => setActiveOrg(active ? null : org)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  active
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {org}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glow-border rounded-lg p-10 text-center text-muted-foreground">
          No projects yet. Add one or sync GitHub.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="glow-border rounded-lg p-5 group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-display text-base truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">P{p.priority} • {p.status}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" onClick={() => summarize(p.id)}><Sparkles className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              {p.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{p.description}</p>}
              {p.tech_stack.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {p.tech_stack.slice(0, 5).map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{t}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-3 text-xs">
                {p.repo_url && <a href={p.repo_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary inline-flex items-center gap-1"><GH className="h-3 w-3" /> repo</a>}
                {p.live_url && <a href={p.live_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> live</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name" v={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="paused">paused</SelectItem>
                    <SelectItem value="shipped">shipped</SelectItem>
                    <SelectItem value="archived">archived</SelectItem>
                    <SelectItem value="idea">idea</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={String(editForm.priority)} onValueChange={(v) => setEditForm({ ...editForm, priority: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>P{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={4} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} className="flex-1 bg-primary text-primary-foreground">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
