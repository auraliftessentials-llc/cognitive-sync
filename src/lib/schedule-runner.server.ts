/**
 * Single source of truth for executing a CLI schedule.
 * Used by BOTH the cron tick and the manual "Run now" button so behaviour
 * can never drift between them.
 *
 * Reliability features:
 *   - Atomic claim via claim_schedule() RPC prevents double-fire if cron overlaps.
 *   - Up to N attempts with exponential backoff before declaring failure.
 *   - Every attempt logs a row to cli_schedule_runs for full forensic history.
 *   - The schedule row tracks consecutive_failures, total_runs, total_failures.
 *   - Email is sent on terminal failure, rate-limited to once per 30 min per
 *     schedule (and only if the operator configured notify_email).
 *   - lock is always released, even on crash, in finally{}.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callBrain, type BrainMessage } from "@/lib/brain.server";
import { executeTool, TOOL_SCHEMAS, type ToolName } from "@/lib/zoho-tools.server";
import { sendNotifyEmail } from "@/lib/email-notify.server";

const ERROR_EMAIL_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 1500, 4000];
const LOCK_SECONDS = 300; // 5 min — long enough for slow tool chains, short enough for safe recovery

export type RunTrigger = "cron" | "manual";
export type RunOutcome = {
  ok: boolean;
  scheduleId: string;
  attempts: number;
  output?: string;
  error?: string;
  durationMs: number;
  model?: string;
  provider?: string;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function executeOnce(
  s: any,
  attempt: number,
  trigger: RunTrigger,
): Promise<{ ok: true; output: string; model?: string; provider?: string }
  | { ok: false; error: string }> {
  const { data: agents } = await supabaseAdmin
    .from("agents").select("*")
    .or(`slug.eq.${s.agent_slug},and(is_system.eq.true,slug.eq.ceo-grok)`)
    .limit(2);
  const agent = agents?.find((a) => a.slug === s.agent_slug) ?? agents?.[0];
  if (!agent) return { ok: false, error: "No agent available" };

  const messages: BrainMessage[] = [
    { role: "system", content: agent.system_prompt },
    { role: "user", content: s.prompt },
  ];

  let finalText = "";
  let finalModel: string | undefined;
  let finalProvider: string | undefined;

  try {
    for (let r = 0; r < 4; r++) {
      const resp = await callBrain({
        messages,
        tools: TOOL_SCHEMAS as any,
        tool_choice: "auto",
        preferredModel: s.model ?? agent.default_model,
        reasoning_effort: (agent.reasoning_effort ?? "medium") as any,
      });
      finalModel = resp.model;
      finalProvider = resp.provider;
      const choice = resp.message;
      if (choice.tool_calls?.length) {
        messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
        for (const tc of choice.tool_calls) {
          const name = tc.function?.name as ToolName;
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
          try {
            const out = await executeTool(s.user_id, name, args);
            messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(out).slice(0, 12000) });
          } catch (e: any) {
            messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify({ error: e?.message ?? String(e) }) });
          }
        }
        continue;
      }
      finalText = choice.content ?? "";
      break;
    }
    return { ok: true, output: finalText, model: finalModel, provider: finalProvider };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Run one schedule with retry + backoff + locking + history.
 * @returns the final outcome of the schedule run.
 */
export async function runScheduleOnce(
  scheduleId: string,
  trigger: RunTrigger,
): Promise<RunOutcome> {
  const t0 = Date.now();

  // 1) Atomically claim the lock.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .rpc("claim_schedule", { _id: scheduleId, _lock_seconds: LOCK_SECONDS });
  if (claimErr) {
    return { ok: false, scheduleId, attempts: 0, error: `claim failed: ${claimErr.message}`, durationMs: 0 };
  }
  if (!claimed) {
    return { ok: false, scheduleId, attempts: 0, error: "schedule already running (locked)", durationMs: 0 };
  }

  try {
    // 2) Load fresh schedule row.
    const { data: s, error: loadErr } = await supabaseAdmin
      .from("cli_schedules").select("*").eq("id", scheduleId).single();
    if (loadErr || !s) {
      return { ok: false, scheduleId, attempts: 0, error: loadErr?.message ?? "schedule not found", durationMs: Date.now() - t0 };
    }

    // 3) Try up to MAX_ATTEMPTS with backoff.
    let lastErr = "unknown error";
    let attempts = 0;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts = i + 1;
      if (BACKOFF_MS[i]) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));

      // Log a "running" row that we'll patch when finished.
      const { data: runRow } = await supabaseAdmin
        .from("cli_schedule_runs")
        .insert({
          schedule_id: s.id,
          user_id: s.user_id,
          trigger: i === 0 ? trigger : "retry",
          status: "running",
          attempt: attempts,
        })
        .select("id")
        .single();
      const runId = runRow?.id as string | undefined;

      const attemptStart = Date.now();
      const res = await executeOnce(s, attempts, trigger);
      const ms = Date.now() - attemptStart;

      if (res.ok) {
        if (runId) {
          await supabaseAdmin.from("cli_schedule_runs").update({
            status: "ok",
            finished_at: new Date().toISOString(),
            duration_ms: ms,
            output: (res.output ?? "").slice(0, 8000),
            model: res.model ?? null,
            provider: res.provider ?? null,
          }).eq("id", runId);
        }
        await supabaseAdmin.from("cli_schedules").update({
          last_run_at: new Date().toISOString(),
          last_status: "ok",
          last_output: (res.output ?? "").slice(0, 8000),
          consecutive_failures: 0,
          total_runs: (s.total_runs ?? 0) + 1,
        }).eq("id", s.id);
        return {
          ok: true, scheduleId, attempts, output: res.output,
          durationMs: Date.now() - t0, model: res.model, provider: res.provider,
        };
      }

      // failure on this attempt
      lastErr = res.error;
      if (runId) {
        await supabaseAdmin.from("cli_schedule_runs").update({
          status: "error",
          finished_at: new Date().toISOString(),
          duration_ms: ms,
          error: lastErr.slice(0, 4000),
        }).eq("id", runId);
      }
    }

    // 4) All retries exhausted — record failure on schedule + maybe email.
    await supabaseAdmin.from("cli_schedules").update({
      last_run_at: new Date().toISOString(),
      last_status: "error",
      last_output: lastErr,
      consecutive_failures: (s.consecutive_failures ?? 0) + 1,
      total_runs: (s.total_runs ?? 0) + 1,
      total_failures: (s.total_failures ?? 0) + 1,
    }).eq("id", s.id);

    if (s.notify_email) {
      const lastEmailedAt = s.last_error_emailed_at ? new Date(s.last_error_emailed_at).getTime() : 0;
      if (Date.now() - lastEmailedAt > ERROR_EMAIL_COOLDOWN_MS) {
        const r = await sendNotifyEmail({
          to: s.notify_email,
          subject: `[Merkabah] Schedule failed after ${attempts} attempts: ${s.name}`,
          html: `<h2>Scheduled run failed</h2>
            <p><strong>${escapeHtml(s.name)}</strong> · trigger=${trigger} · attempts=${attempts}</p>
            <p style="font-family:monospace;background:#f5f5f5;padding:8px;border-radius:4px">${escapeHtml(lastErr)}</p>
            <p style="color:#666;font-size:12px">Cron: <code>${escapeHtml(s.cron)}</code> · Agent: ${escapeHtml(s.agent_slug)} · ${new Date().toISOString()}</p>
            <p style="color:#666;font-size:11px">Consecutive failures: ${(s.consecutive_failures ?? 0) + 1}. You won't get another email about this schedule for 30 minutes.</p>`,
        });
        if (r.ok) {
          await supabaseAdmin.from("cli_schedules")
            .update({ last_error_emailed_at: new Date().toISOString() })
            .eq("id", s.id);
        }
      }
    }

    return { ok: false, scheduleId, attempts, error: lastErr, durationMs: Date.now() - t0 };
  } finally {
    // 5) Always release the lock.
    await supabaseAdmin.rpc("release_schedule", { _id: scheduleId }).catch(() => {});
  }
}
