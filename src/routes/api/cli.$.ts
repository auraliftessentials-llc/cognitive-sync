/**
 * Neural CLI gateway — `/api/cli/*`
 *
 * Splat route that handles every endpoint the local `neural` command needs:
 *   GET  /api/cli/whoami           → { user_id, email, scopes }
 *   GET  /api/cli/health           → brain + auxiliary provider health
 *   GET  /api/cli/tools            → list of available tool schemas
 *   POST /api/cli/tools/run        → { name, args } executes a single tool
 *   POST /api/cli/agent/run        → { agent_slug?, prompt, model? } full agentic run
 *   POST /api/cli/db/query         → { table, select?, eq?, limit? } RLS-as-user select
 *   POST /api/cli/db/insert        → { table, row } RLS-as-user insert
 *   POST /api/cli/cron/run         → { job: 'github-sync' | 'zoho-sync' } fires hook
 *   GET  /api/cli/projects         → list projects (RLS-as-user)
 *   GET  /api/cli/suggestions      → list undismissed suggestions
 *
 * Auth: Bearer `nrl_...` token from /admin → CLI Tokens tab. Tokens hash to
 * a row in `cli_tokens`; the resolved user becomes the request principal and
 * a per-request supabase client is created with that user's RLS context via
 * the service role + `auth.uid()` override is NOT possible without a JWT, so
 * for DB calls we use the service-role client BUT scope every query with
 * `.eq('user_id', principal.userId)` to enforce the same boundary.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCli, jsonResponse, corsPreflight, hasScope, type CliPrincipal } from "@/lib/cli-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeTool, TOOL_SCHEMAS, type ToolName } from "@/lib/zoho-tools.server";
import { callBrain, checkAllProviders, checkAuxiliary, type BrainMessage } from "@/lib/brain.server";

type Handler = (req: Request, principal: CliPrincipal) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "GET whoami": async (_req, p) => {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.userId);
    return jsonResponse({
      user_id: p.userId,
      email: u?.user?.email ?? null,
      scopes: p.scopes,
      token_id: p.tokenId,
    });
  },

  "GET health": async () => {
    const [brains, aux] = await Promise.all([checkAllProviders(), checkAuxiliary()]);
    return jsonResponse({ brains, auxiliary: aux });
  },

  "GET tools": async () => {
    return jsonResponse({
      tools: TOOL_SCHEMAS.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    });
  },

  "POST tools/run": async (req, p) => {
    if (!hasScope(p, "tools")) return jsonResponse({ error: "Missing scope: tools" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const name = body?.name as ToolName;
    const args = body?.args ?? {};
    if (!name) return jsonResponse({ error: "name required" }, { status: 400 });
    const t0 = Date.now();
    try {
      const result = await executeTool(p.userId, name, args);
      const ms = Date.now() - t0;
      await supabaseAdmin.from("agent_tool_calls").insert({
        user_id: p.userId,
        tool_name: name,
        arguments: args,
        result,
        status: "complete",
        duration_ms: ms,
      });
      return jsonResponse({ ok: true, name, ms, result });
    } catch (e: any) {
      const ms = Date.now() - t0;
      await supabaseAdmin.from("agent_tool_calls").insert({
        user_id: p.userId,
        tool_name: name,
        arguments: args,
        status: "error",
        error: e?.message ?? String(e),
        duration_ms: ms,
      });
      return jsonResponse({ ok: false, name, ms, error: e?.message ?? String(e) }, { status: 500 });
    }
  },

  "POST agent/run": async (req, p) => {
    if (!hasScope(p, "agent")) return jsonResponse({ error: "Missing scope: agent" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt ?? "").trim();
    if (!prompt) return jsonResponse({ error: "prompt required" }, { status: 400 });
    const slug = String(body?.agent_slug ?? "ceo-grok");
    const modelOverride: string | undefined = body?.model;

    const { data: agents } = await supabaseAdmin
      .from("agents")
      .select("*")
      .or(`slug.eq.${slug},and(is_system.eq.true,slug.eq.ceo-grok)`)
      .limit(2);
    const agent = agents?.find((a) => a.slug === slug) ?? agents?.[0];
    if (!agent) return jsonResponse({ error: "No agent available" }, { status: 404 });

    const preferred = modelOverride && agent.available_models.includes(modelOverride)
      ? modelOverride
      : agent.default_model;

    const { data: runRow } = await supabaseAdmin
      .from("agent_runs")
      .insert({
        agent_id: agent.id,
        user_id: p.userId,
        model: preferred,
        prompt,
        status: "streaming",
      })
      .select("id")
      .single();
    const runId = runRow?.id as string;
    const startedAt = Date.now();

    const messages: BrainMessage[] = [
      { role: "system", content: agent.system_prompt },
      { role: "user", content: prompt },
    ];
    const toolCalls: any[] = [];

    try {
      for (let round = 0; round < 4; round++) {
        const resp = await callBrain({
          messages,
          tools: TOOL_SCHEMAS as any,
          tool_choice: "auto",
          preferredModel: preferred,
          reasoning_effort: (agent.reasoning_effort ?? "medium") as any,
        });
        const choice = resp.message;
        if (choice.tool_calls?.length) {
          messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
          for (const tc of choice.tool_calls) {
            const name = tc.function?.name as ToolName;
            let parsed: any = {};
            try { parsed = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* tolerate */ }
            try {
              const r = await executeTool(p.userId, name, parsed);
              toolCalls.push({ name, args: parsed, ok: true, result: r });
              messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(r).slice(0, 12000) });
            } catch (e: any) {
              toolCalls.push({ name, args: parsed, ok: false, error: e?.message });
              messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify({ error: e?.message }) });
            }
          }
          continue;
        }
        const output = choice.content ?? "";
        await supabaseAdmin.from("agent_runs").update({
          status: "complete", output, model: resp.model,
          duration_ms: Date.now() - startedAt,
          tokens_in: Math.ceil(prompt.length / 4),
          tokens_out: Math.ceil(output.length / 4),
        }).eq("id", runId);
        return jsonResponse({
          ok: true, run_id: runId, agent: agent.slug, model: resp.model,
          provider: resp.provider, fallbacks: resp.fallbacks, output, tool_calls: toolCalls,
        });
      }
      throw new Error("Tool-call loop exceeded 4 rounds");
    } catch (e: any) {
      await supabaseAdmin.from("agent_runs").update({
        status: "error", error: e?.message ?? String(e), duration_ms: Date.now() - startedAt,
      }).eq("id", runId);
      return jsonResponse({ ok: false, run_id: runId, error: e?.message ?? String(e) }, { status: 500 });
    }
  },

  "POST db/query": async (req, p) => {
    if (!hasScope(p, "db")) return jsonResponse({ error: "Missing scope: db" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const table = String(body?.table ?? "");
    const select = String(body?.select ?? "*");
    const limit = Math.min(Number(body?.limit ?? 50), 500);
    const eq = body?.eq && typeof body.eq === "object" ? body.eq as Record<string, any> : {};
    const ALLOWED = new Set([
      "projects", "suggestions", "agent_runs", "agent_tool_calls",
      "agents", "conversations", "messages", "audit_log",
      "workspaces", "workspace_members", "feature_flags", "brain_health",
    ]);
    if (!ALLOWED.has(table)) return jsonResponse({ error: `Table not allowed: ${table}` }, { status: 400 });
    // Dynamic table name — typings can't narrow, so we go through `any` and
    // enforce the user_id boundary in code below.
    let q: any = (supabaseAdmin as any).from(table).select(select).limit(limit);
    const userScoped = ["projects","suggestions","agent_runs","agent_tool_calls","agents","conversations","messages"];
    if (userScoped.includes(table)) q = q.eq("user_id", p.userId);
    if (table === "audit_log") q = q.eq("actor_id", p.userId);
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ rows: data ?? [], count: data?.length ?? 0 });
  },

  "POST db/insert": async (req, p) => {
    if (!hasScope(p, "db")) return jsonResponse({ error: "Missing scope: db" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const table = String(body?.table ?? "");
    const row = body?.row ?? {};
    const ALLOWED = new Set(["projects", "suggestions", "conversations", "messages"]);
    if (!ALLOWED.has(table)) return jsonResponse({ error: `Insert not allowed for ${table}` }, { status: 400 });
    const toInsert = { ...row, user_id: p.userId };
    const { data, error } = await (supabaseAdmin as any).from(table).insert(toInsert).select().single();
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ ok: true, row: data });
  },

  "POST cron/run": async (req, p) => {
    if (!hasScope(p, "cron")) return jsonResponse({ error: "Missing scope: cron" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const job = String(body?.job ?? "");
    const url = new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;
    const map: Record<string, string> = {
      "github-sync": `${origin}/hooks/sync-github`,
    };
    const target = map[job];
    if (!target) return jsonResponse({ error: `Unknown job: ${job}` }, { status: 400 });
    const r = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const text = await r.text();
    let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    return jsonResponse({ ok: r.ok, status: r.status, job, result: parsed }, { status: r.ok ? 200 : 502 });
  },

  "GET projects": async (_req, p) => {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("id,name,description,status,priority,repo_url,live_url,tech_stack,tags,last_worked_on,updated_at")
      .eq("user_id", p.userId)
      .order("priority", { ascending: false })
      .order("last_worked_on", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ projects: data ?? [] });
  },

  "GET suggestions": async (_req, p) => {
    const { data, error } = await supabaseAdmin
      .from("suggestions")
      .select("id,kind,title,body,related_project_ids,created_at")
      .eq("user_id", p.userId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ suggestions: data ?? [] });
  },

  "GET schedules": async (_req, p) => {
    const { data, error } = await supabaseAdmin
      .from("cli_schedules").select("*").eq("user_id", p.userId)
      .order("created_at", { ascending: false });
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ schedules: data ?? [] });
  },

  "POST schedules": async (req, p) => {
    const body = await req.json().catch(() => ({}));
    const { name, cron, prompt, agent_slug, model } = body ?? {};
    if (!name || !cron || !prompt) return jsonResponse({ error: "name, cron, prompt required" }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("cli_schedules").insert({
      user_id: p.userId, name, cron, prompt,
      agent_slug: agent_slug ?? "ceo-grok", model: model ?? null,
    }).select("*").single();
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ schedule: data });
  },

  "POST schedules/toggle": async (req, p) => {
    const body = await req.json().catch(() => ({}));
    if (!body?.id) return jsonResponse({ error: "id required" }, { status: 400 });
    const { data: cur } = await supabaseAdmin.from("cli_schedules").select("enabled,user_id").eq("id", body.id).single();
    if (!cur || cur.user_id !== p.userId) return jsonResponse({ error: "not found" }, { status: 404 });
    const { error } = await supabaseAdmin.from("cli_schedules").update({ enabled: !cur.enabled }).eq("id", body.id);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ ok: true, enabled: !cur.enabled });
  },

  "POST schedules/delete": async (req, p) => {
    const body = await req.json().catch(() => ({}));
    if (!body?.id) return jsonResponse({ error: "id required" }, { status: 400 });
    const { error } = await supabaseAdmin.from("cli_schedules").delete().eq("id", body.id).eq("user_id", p.userId);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse({ ok: true });
  },

  "POST schedules/run": async (req, p) => {
    const body = await req.json().catch(() => ({}));
    if (!body?.id) return jsonResponse({ error: "id required" }, { status: 400 });
    const { data: s } = await supabaseAdmin.from("cli_schedules").select("*").eq("id", body.id).eq("user_id", p.userId).single();
    if (!s) return jsonResponse({ error: "not found" }, { status: 404 });
    const { data: agents } = await supabaseAdmin.from("agents").select("*")
      .or(`slug.eq.${s.agent_slug},and(is_system.eq.true,slug.eq.ceo-grok)`).limit(2);
    const agent = agents?.find((a) => a.slug === s.agent_slug) ?? agents?.[0];
    if (!agent) return jsonResponse({ error: "no agent" }, { status: 404 });
    const messages: BrainMessage[] = [
      { role: "system", content: agent.system_prompt },
      { role: "user", content: s.prompt },
    ];
    try {
      let final = "";
      for (let r = 0; r < 3; r++) {
        const resp = await callBrain({
          messages, tools: TOOL_SCHEMAS as any, tool_choice: "auto",
          preferredModel: s.model ?? agent.default_model,
          reasoning_effort: (agent.reasoning_effort ?? "medium") as any,
        });
        if (resp.message.tool_calls?.length) {
          messages.push({ role: "assistant", content: resp.message.content ?? "", tool_calls: resp.message.tool_calls });
          for (const tc of resp.message.tool_calls) {
            const name = tc.function?.name as ToolName;
            let args: any = {}; try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
            try {
              const out = await executeTool(p.userId, name, args);
              messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(out).slice(0, 12000) });
            } catch (e: any) {
              messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify({ error: e?.message }) });
            }
          }
          continue;
        }
        final = resp.message.content ?? "";
        break;
      }
      await supabaseAdmin.from("cli_schedules").update({
        last_run_at: new Date().toISOString(), last_status: "ok", last_output: final.slice(0, 8000),
      }).eq("id", body.id);
      return jsonResponse({ ok: true, output: final });
    } catch (e: any) {
      await supabaseAdmin.from("cli_schedules").update({
        last_run_at: new Date().toISOString(), last_status: "error", last_output: e?.message ?? "error",
      }).eq("id", body.id);
      return jsonResponse({ ok: false, error: e?.message }, { status: 500 });
    }
  },
};

async function dispatch(method: string, path: string, request: Request): Promise<Response> {
  if (method === "OPTIONS") return corsPreflight();
  const principal = await authenticateCli(request);
  if (!principal) {
    return jsonResponse(
      { error: "Unauthorized — present a Bearer nrl_… token from /admin → CLI Tokens" },
      { status: 401 },
    );
  }
  const key = `${method} ${path}`;
  const handler = ROUTES[key];
  if (!handler) {
    return jsonResponse(
      { error: `Unknown endpoint: ${method} /api/cli/${path}`, known: Object.keys(ROUTES) },
      { status: 404 },
    );
  }
  try {
    return await handler(request, principal);
  } catch (e: any) {
    return jsonResponse({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cli/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => dispatch("GET", (params as any)._splat ?? "", request),
      POST: async ({ request, params }) => dispatch("POST", (params as any)._splat ?? "", request),
      OPTIONS: async () => corsPreflight(),
    },
  },
});
