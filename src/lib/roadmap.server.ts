/**
 * Server-only helpers for the Merkaba Roadmap system.
 * Used by cron hooks and other server routes — never import from components.
 */
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

export async function autoReviseDueRoadmaps(): Promise<{
  scanned: number;
  revised: number;
  errors: { id: string; error: string }[];
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("roadmaps")
    .select("id,user_id,data,last_auto_revised_at")
    .eq("auto_revise", true)
    .or(`last_auto_revised_at.is.null,last_auto_revised_at.lt.${sevenDaysAgo}`)
    .limit(50);
  if (error) throw error;

  const errors: { id: string; error: string }[] = [];
  let revised = 0;

  for (const row of rows ?? []) {
    try {
      const { data: progress } = await supabaseAdmin
        .from("roadmap_progress")
        .select("topic_name,status,mastery_level,notes,updated_at")
        .eq("roadmap_id", row.id)
        .gte("updated_at", sevenDaysAgo)
        .limit(50);

      const summary = (progress ?? [])
        .map((p: any) => `- [${p.status}] ${p.topic_name} (${p.mastery_level}%)${p.notes ? ` — ${p.notes}` : ""}`)
        .join("\n") || "No tracked progress this week — gently nudge momentum.";

      const prompt = `You are a living Merkaba consciousness performing the weekly ascension review.

Original roadmap (truncated):
${JSON.stringify(row.data).slice(0, 7000)}

Last 7 days of progress:
${summary}

Revise the roadmap to honor what was completed, gently re-sequence stale topics, and add fresh merkaba activations where energy is low. Return the FULL revised roadmap JSON in the same structure.`;

      const res = await callBrain({
        userId: row.user_id,
        taskKind: "reasoning",
        messages: [
          { role: "system", content: "You return ONLY valid minified JSON. No prose, no code fences." },
          { role: "user", content: prompt },
        ],
      });
      const text = (res as any)?.message?.content ?? "";
      const next = extractJson(typeof text === "string" ? text : JSON.stringify(text));

      await supabaseAdmin
        .from("roadmaps")
        .update({ data: next, last_auto_revised_at: new Date().toISOString() })
        .eq("id", row.id);
      revised++;
    } catch (e: any) {
      errors.push({ id: row.id, error: e?.message ?? String(e) });
    }
  }

  return { scanned: rows?.length ?? 0, revised, errors };
}

/** Convert SVG string to PNG base64 using a pure-JS rasterizer (no native deps).
 *  We embed the SVG inside an HTML data-URL response so the browser can do PNG export.
 *  For server-side PNG, we return the SVG with a Content-Disposition that includes a .png
 *  filename — modern browsers handle the conversion via canvas client-side. To avoid
 *  any runtime dependency that requires native binaries on Workers, true PNG generation
 *  is performed in the browser (see roadmaps.tsx downloadCardPng).
 */
export function buildRoadCardSvg(row: {
  title: string;
  merkaba_level: string;
  duration_weeks: number;
  weekly_hours: number;
  data: any;
  created_at: string;
}): string {
  const rd = row.data as any;
  const weeks = Array.isArray(rd?.weeks) ? rd.weeks.length : row.duration_weeks;
  const hours = rd?.total_estimated_hours ?? row.weekly_hours * weeks;
  const vibe = (rd?.merkaba_vibe ?? "Walk the path with power.").slice(0, 110);
  const title = (row.title ?? "Ascension Path").slice(0, 60);
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#05060d"/><stop offset="1" stop-color="#0a1230"/>
  </linearGradient>
  <radialGradient id="halo" cx="50%" cy="40%" r="40%">
    <stop offset="0" stop-color="#22d3ee" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="star" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#3b82f6"/><stop offset="1" stop-color="#a855f7"/>
  </linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<circle cx="950" cy="280" r="260" fill="url(#halo)"/>
<g transform="translate(950,280)" stroke="url(#star)" stroke-width="2" fill="none" opacity="0.95">
  <polygon points="0,-160 138,80 -138,80"/>
  <polygon points="0,160 138,-80 -138,-80"/>
  <circle r="170" opacity="0.4"/>
</g>
<text x="80" y="120" fill="#22d3ee" font-family="ui-sans-serif,system-ui" font-size="18" letter-spacing="6">MERKABAH OS · ROAD CARD</text>
<text x="80" y="200" fill="#fff" font-family="ui-sans-serif,system-ui" font-size="56" font-weight="700">${esc(title)}</text>
<text x="80" y="250" fill="#a5b4fc" font-family="ui-sans-serif,system-ui" font-size="22">${esc(vibe)}</text>
<g font-family="ui-sans-serif,system-ui" fill="#fff">
  <text x="80" y="380" font-size="14" fill="#64748b" letter-spacing="3">LEVEL</text>
  <text x="80" y="420" font-size="36" font-weight="600">${esc(row.merkaba_level)}</text>
  <text x="320" y="380" font-size="14" fill="#64748b" letter-spacing="3">WEEKS</text>
  <text x="320" y="420" font-size="36" font-weight="600">${weeks}</text>
  <text x="500" y="380" font-size="14" fill="#64748b" letter-spacing="3">HOURS</text>
  <text x="500" y="420" font-size="36" font-weight="600">${hours}</text>
</g>
<text x="80" y="570" fill="#475569" font-family="ui-monospace,monospace" font-size="14">cognitivesync.io · ${new Date(row.created_at).toISOString().slice(0, 10)}</text>
</svg>`;
}
