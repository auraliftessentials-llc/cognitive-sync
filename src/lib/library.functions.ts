import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CATEGORIES = [
  "master_os_omega",
  "grokify",
  "oralift",
  "agent_systems",
  "reference",
  "archive",
  "unclassified",
] as const;

const REVENUE_STATUSES = [
  "live",
  "ready_to_launch",
  "in_build",
  "idea",
  "paused",
] as const;

export type ProjectCategory = (typeof CATEGORIES)[number];
export type RevenueStatus = (typeof REVENUE_STATUSES)[number];

/** Auto-classify a repo into a focus category based on name/tags heuristics. */
function autoCategory(name: string | null, fullName: string | null): ProjectCategory {
  const s = `${name ?? ""} ${fullName ?? ""}`.toLowerCase();
  if (/master[-_ ]?os|omega|merkabah/.test(s)) return "master_os_omega";
  if (/grokif/.test(s)) return "grokify";
  if (/oralift|aural|essentials/.test(s)) return "oralift";
  if (/agent|swarm|autonomous|super[-_ ]?agent|operator/.test(s)) return "agent_systems";
  if (/nexu|open[-_ ]?design|reference|inspo|fork/.test(s)) return "reference";
  return "unclassified";
}

export const getLibraryOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("focus_priority", { ascending: false })
      .order("github_last_commit_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);

    const projects = (data ?? []) as any[];

    // Group by category for the cockpit view.
    const groups: Record<ProjectCategory, any[]> = {
      master_os_omega: [],
      grokify: [],
      oralift: [],
      agent_systems: [],
      reference: [],
      archive: [],
      unclassified: [],
    };
    for (const p of projects) {
      const cat = (p.category ?? "unclassified") as ProjectCategory;
      (groups[cat] ?? groups.unclassified).push(p);
    }

    const moneyFocus = projects
      .filter((p) => ["live", "ready_to_launch"].includes(p.revenue_status))
      .sort((a, b) => (b.focus_priority ?? 0) - (a.focus_priority ?? 0))
      .slice(0, 12);

    const privacyAudit = projects
      .filter((p) => p.github_full_name && p.github_private === false)
      .map((p) => ({
        id: p.id,
        github_full_name: p.github_full_name,
        repo_url: p.repo_url,
      }));

    const stats = {
      total: projects.length,
      public: projects.filter((p) => p.github_private === false).length,
      private: projects.filter((p) => p.github_private === true).length,
      live: projects.filter((p) => p.revenue_status === "live").length,
      ready: projects.filter((p) => p.revenue_status === "ready_to_launch").length,
    };

    return { groups, moneyFocus, privacyAudit, stats };
  });

export const setProjectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      category: z.enum(CATEGORIES).optional(),
      revenue_status: z.enum(REVENUE_STATUSES).optional(),
      focus_priority: z.number().int().min(1).max(5).optional(),
      next_action: z.string().max(2000).nullable().optional(),
      notes: z.string().max(10000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bulk auto-classify any unclassified projects using name heuristics. */
export const autoClassifyLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, github_full_name, category")
      .eq("user_id", userId)
      .eq("category", "unclassified");
    if (error) throw new Error(error.message);
    let changed = 0;
    for (const p of (data ?? []) as any[]) {
      const next = autoCategory(p.name, p.github_full_name);
      if (next !== "unclassified") {
        const { error: uerr } = await supabase
          .from("projects")
          .update({ category: next })
          .eq("id", p.id)
          .eq("user_id", userId);
        if (!uerr) changed++;
      }
    }
    return { changed, scanned: (data ?? []).length };
  });
