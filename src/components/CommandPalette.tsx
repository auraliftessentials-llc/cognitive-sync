import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Brain, FolderGit2, Sparkles, MessageSquare, Bot, Github, User,
  Crown, Building2, Terminal, Mail, Briefcase, Users, Send, Zap, Loader2,
} from "lucide-react";
import { Merkabah } from "@/components/Merkabah";
import { commandRoute } from "@/lib/command-router.functions";
import { toast } from "sonner";

type Action = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Navigate" | "Agents" | "Zoho" | "System";
  run: () => void | Promise<void>;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [routing, setRouting] = useState(false);
  const [reply, setReply] = useState<{ intent: string; provider: string; text: string } | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setReply(null);
      setRouting(false);
    }
  }, [open]);

  const go = (to: string) => () => { setOpen(false); nav({ to }); };

  const askMerkabah = async () => {
    const prompt = query.trim();
    if (!prompt || routing) return;
    setRouting(true);
    setReply(null);
    try {
      const res = await commandRoute({ data: { prompt } });
      setReply({ intent: res.intent, provider: res.provider, text: res.output });
      if (!res.ok) toast.error(res.output);
    } catch (e: any) {
      toast.error(e?.message ?? "Router failed");
    } finally {
      setRouting(false);
    }
  };

  const actions: Action[] = [
    { id: "nav-dash",   label: "Pulse — Dashboard",        icon: Brain,        group: "Navigate", run: go("/dashboard") },
    { id: "nav-cons",   label: "Console — Terminal",       icon: Terminal,     group: "Navigate", run: go("/console"), hint: "/console" },
    { id: "nav-agents", label: "Executive Agents",         icon: Bot,          group: "Navigate", run: go("/agents") },
    { id: "nav-proj",   label: "Library — Projects",       icon: FolderGit2,   group: "Navigate", run: go("/projects") },
    { id: "nav-sug",    label: "Moves — Suggestions",      icon: Sparkles,     group: "Navigate", run: go("/suggestions") },
    { id: "nav-chat",   label: "Brain — Chat",             icon: MessageSquare,group: "Navigate", run: go("/chat") },
    { id: "nav-gh",     label: "GitHub Sync",              icon: Github,       group: "Navigate", run: go("/github") },
    { id: "nav-prof",   label: "Profile",                  icon: User,         group: "Navigate", run: go("/profile") },
    { id: "nav-admin",  label: "Command — Admin",          icon: Crown,        group: "Navigate", run: go("/admin") },

    { id: "ag-ceo",     label: "Run CEO Grok",             icon: Crown,        group: "Agents",   run: () => { setOpen(false); nav({ to: "/console", search: { agent: "ceo-grok" } as any }); } },
    { id: "ag-atlas",   label: "Run Atlas (Strategist)",   icon: Bot,          group: "Agents",   run: () => { setOpen(false); nav({ to: "/console", search: { agent: "atlas" } as any }); } },
    { id: "ag-cipher",  label: "Run Cipher (Analyst)",     icon: Bot,          group: "Agents",   run: () => { setOpen(false); nav({ to: "/console", search: { agent: "cipher" } as any }); } },
    { id: "ag-forge",   label: "Run Forge (Operator)",     icon: Bot,          group: "Agents",   run: () => { setOpen(false); nav({ to: "/console", search: { agent: "forge" } as any }); } },
    { id: "ag-echo",    label: "Run Echo (Communicator)",  icon: Bot,          group: "Agents",   run: () => { setOpen(false); nav({ to: "/console", search: { agent: "echo" } as any }); } },

    { id: "z-deals",    label: "/zoho deals — show pipeline",       icon: Briefcase, group: "Zoho", hint: "/zoho deals",     run: () => { setOpen(false); nav({ to: "/console", search: { cmd: "/zoho deals" } as any }); } },
    { id: "z-leads",    label: "/zoho leads — recent leads",        icon: Users,     group: "Zoho", hint: "/zoho leads",     run: () => { setOpen(false); nav({ to: "/console", search: { cmd: "/zoho leads" } as any }); } },
    { id: "z-mail",     label: "/zoho mail — recent inbox",         icon: Mail,      group: "Zoho", hint: "/zoho mail",      run: () => { setOpen(false); nav({ to: "/console", search: { cmd: "/zoho mail" } as any }); } },
    { id: "z-send",     label: "Draft + send marketing email",      icon: Send,      group: "Zoho", hint: "via CEO Grok",    run: () => { setOpen(false); nav({ to: "/console", search: { cmd: "Draft a high-converting outreach email to my top 3 deals" } as any }); } },

    { id: "ws",         label: "Switch workspace",                  icon: Building2, group: "System", run: go("/admin") },
  ];

  const groups = ["Navigate", "Agents", "Zoho", "System"] as const;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <Merkabah size={22} />
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-display">
          MERKABAH · COMMAND
        </div>
        <kbd className="ml-auto text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">⌘K</kbd>
      </div>
      <CommandInput
        placeholder="Type a command, jump to a route, or ask anything (Enter to invoke)…"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          // Enter with nothing selected → ask the router (commands still work via mouse/arrow+enter)
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && query.trim()) {
            e.preventDefault();
            askMerkabah();
          }
        }}
      />
      <CommandList>
        {query.trim() && (
          <CommandGroup heading="Ask Merkabah">
            <CommandItem
              onSelect={askMerkabah}
              disabled={routing}
              value={`__ask__${query}`}
              className="data-[disabled]:opacity-60"
            >
              {routing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin text-brand-cyan" />
              ) : (
                <Zap className="h-4 w-4 mr-2 text-brand-cyan" />
              )}
              <span className="truncate">{routing ? "Routing…" : `Route: "${query}"`}</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">⌘↵</span>
            </CommandItem>
          </CommandGroup>
        )}

        {reply && (
          <div className="px-3 py-2 border-t border-b border-border/50 bg-card/30 max-h-56 overflow-auto">
            <div className="text-[10px] uppercase tracking-[0.3em] text-brand-cyan mb-1">
              {reply.intent} · {reply.provider}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{reply.text}</div>
          </div>
        )}

        <CommandEmpty>No matches. Try typing a question and pressing ⌘↵ to ask Merkabah.</CommandEmpty>
        {groups.map((g, gi) => (
          <div key={g}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {actions.filter((a) => a.group === g).map((a) => (
                <CommandItem key={a.id} onSelect={() => a.run()}>
                  <a.icon className="h-4 w-4 mr-2 text-primary" />
                  <span>{a.label}</span>
                  {a.hint && (
                    <span className="ml-auto text-[10px] text-muted-foreground font-mono">{a.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
