/**
 * Cron tick: every minute, run any enabled cli_schedules whose cron expression matches now.
 * Triggered by pg_cron / external cron at /hooks/run-cli-schedules.
 *
 * For each due schedule we call the same logic as `agent/run` (non-streaming) and
 * persist the output back onto the schedule row so the user can see history.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callBrain, type BrainMessage } from "@/lib/brain.server";
import { executeTool, TOOL_SCHEMAS, type ToolName } from "@/lib/zoho-tools.server";

/**
 * Tiny cron matcher (5-field: m h dom mon dow). Supports: numbers, *, */N, lists (1,2,3), ranges (1-5).
 * Good enough for personal CLI scheduling; not feature-complete vs vixie-cron.
 */
function cronMatches(expr: string, now: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [now.getUTCMinutes(), now.getUTCHours(), now.getUTCDate(), now.getUTCMonth() + 1, now.getUTCDay()];
  return fields.every((f, i) => matchField(f, values[i]));
}

function matchField(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    let step = 1;
    let body = part;
    if (part.includes("/")) {
      const [b, s] = part.split("/");
      body = b || "*"; step = parseInt(s, 10);
      if (!Number.isFinite(step) || step <= 0) return false;
    }
    if (body === "*") return value % step === 0;
    if (body.includes("-")) {
      const [a, b] = body.split("-").map((n) => parseInt(n, 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return value >= a && value <= b && (value - a) % step === 0;
    }
    const n = parseInt(body, 10);
    return Number.isFinite(n) && value === n;
  });
}

export const Route = createFileRoute("/hooks/run-cli-schedules")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "missing auth" }), { status: 401 });
        }
        const now = new Date();
        const { data: schedules, error } = await supabaseAdmin
          .from("cli_schedules")
          .select("*")
          .eq("enabled", true);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const due = (schedules ?? []).filter((s) => cronMatches(s.cron, now));
        const results: any[] = [];

        for (const s of due) {
          try {
            const { data: agents } = await supabaseAdmin
              .from("agents")
              .select("*")
              .or(`slug.eq.${s.agent_slug},and(is_system.eq.true,slug.eq.ceo-grok)`)
              .limit(2);
            const agent = agents?.find((a) => a.slug === s.agent_slug) ?? agents?.[0];
            if (!agent) throw new Error("No agent");

            const messages: BrainMessage[] = [
              { role: "system", content: agent.system_prompt },
              { role: "user", content: s.prompt },
            ];

            let finalText = "";
            for (let r = 0; r < 3; r++) {
              const resp = await callBrain({
                messages,
                tools: TOOL_SCHEMAS as any,
                tool_choice: "auto",
                preferredModel: s.model ?? agent.default_model,
                reasoning_effort: (agent.reasoning_effort ?? "medium") as any,
              });
              const choice = resp.message;
              if (choice.tool_calls?.length) {
                messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
                for (const tc of choice.tool_calls) {
                  const name = tc.function?.name as ToolName;
                  let args: any = {}; try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
                  try {
                    const out = await executeTool(s.user_id, name, args);
                    messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(out).slice(0, 12000) });
                  } catch (e: any) {
                    messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify({ error: e?.message }) });
                  }
                }
                continue;
              }
              finalText = choice.content ?? "";
              break;
            }

            await supabaseAdmin
              .from("cli_schedules")
              .update({ last_run_at: now.toISOString(), last_status: "ok", last_output: finalText.slice(0, 8000) })
              .eq("id", s.id);
            results.push({ id: s.id, name: s.name, ok: true });
          } catch (e: any) {
            await supabaseAdmin
              .from("cli_schedules")
              .update({ last_run_at: now.toISOString(), last_status: "error", last_output: e?.message ?? "error" })
              .eq("id", s.id);
            results.push({ id: s.id, name: s.name, ok: false, error: e?.message });
          }
        }

        return new Response(JSON.stringify({ ok: true, ran: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
