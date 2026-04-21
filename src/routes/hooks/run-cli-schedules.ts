/**
 * Cron tick: every minute, run any enabled cli_schedules whose cron expression
 * matches now. Triggered by pg_cron at /hooks/run-cli-schedules.
 *
 * Reliability:
 *   - Bearer auth from pg_cron secret.
 *   - Each due schedule executed via the shared runScheduleOnce engine
 *     (atomic locking + retry/backoff + per-run history + email-on-failure).
 *   - Heartbeat row written every tick so the dashboard can prove cron is alive
 *     even when no schedules are due.
 *   - Schedules execute in parallel (Promise.allSettled) so a slow one can't
 *     block the others.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runScheduleOnce } from "@/lib/schedule-runner.server";

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
        const t0 = Date.now();
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "missing auth" }), { status: 401 });
        }

        const now = new Date();
        const { data: schedules, error } = await supabaseAdmin
          .from("cli_schedules").select("*").eq("enabled", true);

        if (error) {
          await supabaseAdmin.from("cron_heartbeat").insert({
            job: "run-cli-schedules", due_count: 0, ran_count: 0,
            error_count: 1, duration_ms: Date.now() - t0,
            notes: `load failed: ${error.message}`,
          });
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const due = (schedules ?? []).filter((s) => cronMatches(s.cron, now));

        // Run all due schedules in parallel — one slow agent must not block others.
        const settled = await Promise.allSettled(
          due.map((s) => runScheduleOnce(s.id, "cron")),
        );

        const results = settled.map((r, i) => {
          if (r.status === "fulfilled") return { id: due[i].id, name: due[i].name, ...r.value };
          return { id: due[i].id, name: due[i].name, ok: false, error: String(r.reason).slice(0, 300) };
        });

        const ranCount = results.filter((r) => r.ok).length;
        const errCount = results.filter((r) => !r.ok).length;

        await supabaseAdmin.from("cron_heartbeat").insert({
          job: "run-cli-schedules",
          due_count: due.length,
          ran_count: ranCount,
          error_count: errCount,
          duration_ms: Date.now() - t0,
        });

        return new Response(
          JSON.stringify({ ok: true, due: due.length, ran: ranCount, errors: errCount, results }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
