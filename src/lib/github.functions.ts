import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Sync GitHub repos for the authenticated user.
// Uses the user-provided GitHub token stored in `profiles.bio`-style? No — we store it transiently in request.
// To avoid persisting tokens, we accept the token at call time. The user enters it on /github page.
export const syncGithubRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const token = data.token?.trim();
    if (!token) throw new Error("GitHub token is required");

    // Fetch up to 100 repos for the authenticated user
    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "neural-ops",
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${t.slice(0, 200)}`);
    }
    const repos = (await res.json()) as Array<any>;

    let added = 0;
    let updated = 0;

    for (const r of repos) {
      const tech = [r.language].filter(Boolean) as string[];
      const tags: string[] = [];
      if (r.fork) tags.push("fork");
      if (r.archived) tags.push("archived");
      if (r.private) tags.push("private");

      // Look up existing by repo_url for this user
      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("repo_url", r.html_url)
        .maybeSingle();

      const payload = {
        name: r.name,
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

    return { added, updated, total: repos.length };
  });
