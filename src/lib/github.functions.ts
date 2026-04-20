import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Whether a server-side GITHUB_TOKEN is configured. Used by the UI to decide
 * whether to require the user to paste a personal token.
 */
export const getGithubTokenStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { configured: Boolean(process.env.GITHUB_TOKEN) };
  });

/**
 * Sync GitHub repos for the authenticated user across personal account AND
 * every organization they belong to. Walks all pages of /user/repos with
 * affiliation=owner,collaborator,organization_member so nothing is missed.
 */
export const syncGithubRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const token = (data.token?.trim() || process.env.GITHUB_TOKEN || "").trim();
    if (!token) {
      throw new Error(
        "No GitHub token available. Add a GITHUB_TOKEN backend secret or paste a personal token.",
      );
    }

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "neural-ops",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    // Pull every repo the user can see: personal + collaborator + org member.
    const repos: any[] = [];
    const seen = new Set<number>();
    for (let page = 1; page <= 20; page++) {
      const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`;
      const res = await fetch(url, { headers: ghHeaders });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${t.slice(0, 200)}`);
      }
      const batch = (await res.json()) as any[];
      if (!batch.length) break;
      for (const r of batch) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          repos.push(r);
        }
      }
      if (batch.length < 100) break;
    }

    const orgs = new Set<string>();
    let added = 0;
    let updated = 0;

    for (const r of repos) {
      const ownerLogin = r.owner?.login as string | undefined;
      const ownerType = r.owner?.type as string | undefined;
      if (ownerType === "Organization" && ownerLogin) orgs.add(ownerLogin);

      const tech = [r.language].filter(Boolean) as string[];
      const tags: string[] = [];
      if (ownerType === "Organization" && ownerLogin) tags.push(`org:${ownerLogin}`);
      if (r.fork) tags.push("fork");
      if (r.archived) tags.push("archived");
      if (r.private) tags.push("private");

      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("repo_url", r.html_url)
        .maybeSingle();

      const payload = {
        name: r.full_name ?? r.name,
        description: r.description ?? null,
        repo_url: r.html_url,
        live_url: r.homepage || null,
        tech_stack: tech,
        tags,
        status: r.archived ? "archived" : "active",
        last_worked_on: r.pushed_at,
      };

      if (existing) {
        const { error } = await supabase.from("projects").update(payload).eq("id", existing.id);
        if (!error) updated++;
      } else {
        const { error } = await supabase
          .from("projects")
          .insert({ ...payload, user_id: userId, priority: 3 });
        if (!error) added++;
      }
    }

    return {
      added,
      updated,
      total: repos.length,
      orgs: Array.from(orgs).sort(),
    };
  });
