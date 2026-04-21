import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron-triggered hook that re-syncs GitHub repos for every super_admin user
 * using the backend GITHUB_TOKEN secret. Idempotent — existing repos are
 * updated, new ones are inserted. Triggered daily by pg_cron.
 *
 * Auth: requires the Supabase publishable key as a Bearer token (matches the
 * cron job's Authorization header).
 */
export const Route = createFileRoute("/hooks/sync-github")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Validate the cron caller — must present our publishable key.
        const auth = request.headers.get("authorization") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || auth !== `Bearer ${expected}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const token = (process.env.GITHUB_TOKEN ?? "").trim();
        if (!token) {
          return new Response(
            JSON.stringify({ error: "GITHUB_TOKEN not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        // Find super_admin users — these are the operators whose libraries we sync.
        const { data: roles, error: rolesErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "super_admin");
        if (rolesErr) {
          return new Response(JSON.stringify({ error: rolesErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
        if (userIds.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, message: "No super_admin users", users: 0 }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        // Pull all repos visible to the token (personal + collaborator + orgs).
        const ghHeaders = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "neural-ops-cron",
          "X-GitHub-Api-Version": "2022-11-28",
        };
        const repos: any[] = [];
        const seen = new Set<number>();
        for (let page = 1; page <= 20; page++) {
          const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`;
          const res = await fetch(url, { headers: ghHeaders });
          if (!res.ok) {
            const t = await res.text();
            return new Response(
              JSON.stringify({ error: `GitHub ${res.status}: ${t.slice(0, 200)}` }),
              { status: 502, headers: { "Content-Type": "application/json" } },
            );
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

        for (const userId of userIds) {
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

            const { data: existing } = await supabaseAdmin
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
              const { error } = await supabaseAdmin
                .from("projects")
                .update(payload)
                .eq("id", existing.id);
              if (!error) updated++;
            } else {
              const { error } = await supabaseAdmin
                .from("projects")
                .insert({ ...payload, user_id: userId, priority: 3 });
              if (!error) added++;
            }
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            users: userIds.length,
            repos: repos.length,
            added,
            updated,
            orgs: Array.from(orgs).sort(),
            ranAt: new Date().toISOString(),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
