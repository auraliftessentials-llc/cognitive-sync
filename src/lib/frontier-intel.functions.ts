/**
 * Self-Evolving Intelligence Core.
 * Scrapes frontier AI breakthroughs via Perplexity + writes to frontier_intel.
 * Triggered by hourly cron at /api/public/hooks/frontier-scan.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type IntelItem = {
  id: string;
  source: string;
  category: string;
  title: string;
  url: string | null;
  summary: string;
  impact_score: number;
  tags: string[];
  discovered_at: string;
};

export const getRecentIntel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<IntelItem[]> => {
    const { data } = await supabaseAdmin
      .from("frontier_intel")
      .select("id,source,category,title,url,summary,impact_score,tags,discovered_at")
      .order("discovered_at", { ascending: false })
      .limit(50);
    return (data ?? []) as IntelItem[];
  });

/** Run a frontier scan now — used by cron and the manual "Scan now" button. */
export async function runFrontierScan(): Promise<{ inserted: number; error?: string }> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { inserted: 0, error: "PERPLEXITY_API_KEY missing" };

  const prompt = `List the 5 most important AI breakthroughs, model releases, research papers, or capability updates from the past 2 hours. For each, return JSON with: title, source (e.g. arxiv, openai, anthropic, twitter), category (model_release|research|tooling|infra|policy), url, summary (2 sentences), impact_score (1-10), tags (array of 1-4 keywords). Return a JSON array only.`;

  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: "You return strict JSON arrays only, no prose." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) return { inserted: 0, error: `perplexity ${r.status}` };
    const j: any = await r.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "[]";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { inserted: 0, error: "no JSON in response" };
    const items = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(items)) return { inserted: 0, error: "not an array" };

    const rows = items.slice(0, 10).map((it: any) => ({
      source: String(it.source ?? "perplexity").slice(0, 64),
      category: String(it.category ?? "research").slice(0, 32),
      title: String(it.title ?? "Untitled").slice(0, 500),
      url: it.url ? String(it.url).slice(0, 1000) : null,
      summary: String(it.summary ?? "").slice(0, 2000),
      impact_score: Math.max(1, Math.min(10, Number(it.impact_score) || 5)),
      tags: Array.isArray(it.tags) ? it.tags.slice(0, 6).map(String) : [],
      raw: it,
    }));
    if (rows.length === 0) return { inserted: 0 };
    const { error } = await supabaseAdmin.from("frontier_intel").insert(rows);
    if (error) return { inserted: 0, error: error.message };
    return { inserted: rows.length };
  } catch (e: any) {
    return { inserted: 0, error: e?.message ?? "scan failed" };
  }
}

export const triggerFrontierScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => runFrontierScan());
