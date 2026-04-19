import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(messages: Array<{ role: string; content: string }>, model = "google/gemini-3-flash-preview") {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("Rate limit hit. Please wait a moment and retry.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable workspace settings.");
    throw new Error(`AI gateway error ${res.status}: ${t}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

async function buildContext(supabase: any, userId: string) {
  const [{ data: profile }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("projects").select("*").eq("user_id", userId).order("priority", { ascending: true }),
  ]);

  const profileBlock = profile
    ? `USER PROFILE:
Name: ${profile.display_name ?? "unknown"}
Bio: ${profile.bio ?? "—"}
Skills: ${(profile.skills ?? []).join(", ") || "—"}
Thinking style: ${profile.thinking_style ?? "—"}
Focus areas: ${(profile.focus_areas ?? []).join(", ") || "—"}`
    : "USER PROFILE: not yet filled in.";

  const projectsBlock = (projects ?? []).length
    ? `PROJECT LIBRARY (${projects.length}):\n` +
      projects
        .map(
          (p: any, i: number) =>
            `${i + 1}. [${p.status}] ${p.name} (priority ${p.priority})
   ${p.description ?? "(no description)"}
   Tech: ${(p.tech_stack ?? []).join(", ") || "—"} | Tags: ${(p.tags ?? []).join(", ") || "—"}
   Repo: ${p.repo_url ?? "—"} | Live: ${p.live_url ?? "—"}
   Notes: ${p.notes ?? "—"}`,
        )
        .join("\n\n")
    : "PROJECT LIBRARY: empty. Suggest the user add their projects.";

  return `${profileBlock}\n\n${projectsBlock}`;
}

// CHAT
export const chatWithBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; message: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Save user message
    await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "user",
      content: data.message,
    });

    // Load history
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    const ctx = await buildContext(supabase, userId);

    const system = `You are the user's "Neural Brain" — an always-on cognitive layer that knows their full project library and how they work.
You are honest, direct, and concise. No fluff. No "as an AI" disclaimers.
You leverage everything below to give expert, personalized guidance: what to work on, what to drop, where things overlap, what their next best move is.

${ctx}

When suggesting next moves, be specific and reference actual project names. If the library is empty, prompt them to add projects first.`;

    const reply = await callAI([
      { role: "system", content: system },
      ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
    ]);

    await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", data.conversationId);

    return { reply };
  });

// GENERATE SUGGESTIONS
export const generateSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const ctx = await buildContext(supabase, userId);

    const prompt = `${ctx}

Based on the user's profile and project library above, generate 3 to 5 sharp, specific "next move" suggestions.
For each, output a JSON object on its own line (JSONL) with fields:
- title (short, imperative, max 8 words)
- body (1-3 sentences, concrete and actionable, reference project names)
- kind: one of "next_move" | "overlap" | "focus" | "risk"

Output ONLY the JSONL lines, nothing else. No markdown fences.`;

    const raw = await callAI([
      { role: "system", content: "You output JSONL only. No prose. No code fences." },
      { role: "user", content: prompt },
    ]);

    const lines = raw
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.startsWith("{"));

    const items: Array<{ title: string; body: string; kind: string }> = [];
    for (const l of lines) {
      try {
        const o = JSON.parse(l);
        if (o.title && o.body) {
          items.push({
            title: String(o.title).slice(0, 120),
            body: String(o.body).slice(0, 800),
            kind: ["next_move", "overlap", "focus", "risk"].includes(o.kind) ? o.kind : "next_move",
          });
        }
      } catch { /* skip */ }
    }

    if (items.length === 0) {
      return { inserted: 0 };
    }

    const { error } = await supabase
      .from("suggestions")
      .insert(items.map((i) => ({ ...i, user_id: userId })));
    if (error) throw new Error(error.message);

    return { inserted: items.length };
  });

// SUMMARIZE PROJECT
export const summarizeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: p } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!p) throw new Error("Project not found");

    const summary = await callAI([
      {
        role: "system",
        content: "You summarize software projects in 2-3 punchy sentences. Be concrete. No fluff.",
      },
      {
        role: "user",
        content: `Project: ${p.name}
Status: ${p.status}
Description: ${p.description ?? "(none)"}
Tech: ${(p.tech_stack ?? []).join(", ")}
Tags: ${(p.tags ?? []).join(", ")}
Notes: ${p.notes ?? "(none)"}

Write a sharp summary of what this project IS and its current state.`,
      },
    ]);

    return { summary };
  });
