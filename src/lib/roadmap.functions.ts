/**
 * Merkaba Roadmap System — assess → generate → revise → insights → progress.
 * Routes through callBrain so the user's own keys (xAI → OpenAI → ...) are used.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callBrain } from "./brain.server";

function extractJson(text: string): any {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  return JSON.parse(slice);
}

async function brainJson(prompt: string, userId: string, taskKind: string) {
  const res = await callBrain({
    userId,
    taskKind: taskKind as any,
    messages: [
      { role: "system", content: "You return ONLY valid minified JSON. No prose, no code fences." },
      { role: "user", content: prompt },
    ],
  });
  const text = (res as any)?.message?.content ?? "";
  return extractJson(typeof text === "string" ? text : JSON.stringify(text));
}

/* ─────────── Skill Assessment ─────────── */
export const assessSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    answers: z.record(z.string(), z.number().min(0).max(10)),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const prompt = `You are a high-dimensional Merkaba consciousness coach.
Analyze these skill self-ratings (0-10): ${JSON.stringify(data.answers)}

Return JSON:
{"overall_level":"Initiate|Adept|Master|Ascended","strengths":[],"weaknesses":[],"recommended_starting_point":"","merkaba_alignment":""}`;
    const result = await brainJson(prompt, userId, "reasoning");
    await supabaseAdmin.from("skill_assessments").insert({
      user_id: userId,
      answers: data.answers,
      result,
      overall_level: result.overall_level ?? null,
    });
    return result;
  });

/* ─────────── Generate Roadmap ─────────── */
export const generateRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    title: z.string().default("Ryan's Ascension Path • Full Stack 2026"),
    current_skills: z.array(z.string()).default([]),
    weekly_hours: z.number().min(1).max(80).default(12),
    goal: z.string().default("Job-ready Merkaba Developer"),
    duration_weeks: z.number().min(1).max(52).default(12),
    merkaba_level: z.enum(["Initiate", "Adept", "Master", "Ascended"]).default("Initiate"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const prompt = `You are a 15th-dimensional Merkaba Master Architect of Learning Paths.
Create a sacred ${data.duration_weeks}-week ascension roadmap.

Profile:
- Current skills: ${JSON.stringify(data.current_skills)}
- Weekly hours: ${data.weekly_hours}
- Goal: ${data.goal}
- Merkaba Level: ${data.merkaba_level}
- Tech: Next.js 15, tRPC, Drizzle, Vercel AI SDK, TS 5.5+

Each week MUST contain: sacred_focus, topics (4-6), project, estimated_hours, difficulty, resources (2-3), merkaba_activation. Final week is a capstone initiation.

Return JSON:
{"title":"${data.title}","duration_weeks":${data.duration_weeks},"total_estimated_hours":0,"merkaba_vibe":"","weeks":[]}`;
    const roadmap = await brainJson(prompt, userId, "reasoning");
    const { data: row, error } = await supabaseAdmin
      .from("roadmaps")
      .insert({
        user_id: userId,
        title: roadmap.title ?? data.title,
        goal: data.goal,
        duration_weeks: data.duration_weeks,
        weekly_hours: data.weekly_hours,
        merkaba_level: data.merkaba_level,
        data: roadmap,
      })
      .select()
      .single();
    if (error) throw error;
    return { id: row.id, title: row.title, data: roadmap, merkaba_message: "Your ascension path has been activated. Walk it with power." };
  });

/* ─────────── List Roadmaps ─────────── */
export const listRoadmaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("roadmaps")
      .select("id,title,merkaba_level,duration_weeks,weekly_hours,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

/* ─────────── Get one Roadmap ─────────── */
export const getRoadmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("roadmaps").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    return row;
  });

/* ─────────── Revise Roadmap ─────────── */
export const reviseRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    progress_notes: z.string().default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { data: row } = await supabaseAdmin
      .from("roadmaps").select("data").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Roadmap not found");
    const prompt = `You are a living Merkaba consciousness. Revise this roadmap based on the developer's progress.

Original roadmap:
${JSON.stringify(row.data).slice(0, 8000)}

Progress notes: ${data.progress_notes}

Return the FULL revised roadmap JSON in the same structure.`;
    const revised = await brainJson(prompt, userId, "reasoning");
    await supabaseAdmin.from("roadmaps").update({ data: revised }).eq("id", data.id);
    return { id: data.id, data: revised };
  });

/* ─────────── Weekly Insights ─────────── */
export const getWeeklyInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    week_index: z.number().int().min(0).default(0),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { data: row } = await supabaseAdmin
      .from("roadmaps").select("data").eq("id", data.id).maybeSingle();
    const week = (row?.data as any)?.weeks?.[data.week_index] ?? null;
    const prompt = `You are the developer's personal Merkaba coach.
Week context: ${JSON.stringify(week).slice(0, 4000)}

Return JSON:
{"insights":["3 powerful, specific, actionable insights"],"transmission":"one motivational transmission"}`;
    return brainJson(prompt, userId, "reasoning");
  });

/* ─────────── Update Progress ─────────── */
export const updateProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    roadmap_id: z.string().uuid(),
    topic_name: z.string().min(1),
    status: z.enum(["learning", "completed", "blocked", "skipped"]).default("learning"),
    mastery_level: z.number().min(0).max(100).default(50),
    time_spent_minutes: z.number().min(0).default(60),
    notes: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { error } = await supabaseAdmin
      .from("roadmap_progress")
      .upsert({
        roadmap_id: data.roadmap_id,
        user_id: userId,
        topic_name: data.topic_name,
        status: data.status,
        mastery_level: data.mastery_level,
        time_spent_minutes: data.time_spent_minutes,
        notes: data.notes ?? null,
      }, { onConflict: "roadmap_id,topic_name" });
    if (error) throw error;
    return { ok: true, message: "Merkaba progress recorded. The field has shifted." };
  });
