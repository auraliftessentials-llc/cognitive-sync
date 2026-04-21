/**
 * Server functions for managing CLI schedules.
 * Used by both the web UI and the `neural cron` subcommand.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runScheduleOnce } from "@/lib/schedule-runner.server";

export type CliSchedule = {
  id: string;
  user_id: string;
  name: string;
  cron: string;
  prompt: string;
  agent_slug: string;
  model: string | null;
  enabled: boolean;
  notify_email: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_output: string | null;
  last_error_emailed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("cli_schedules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { schedules: (data ?? []) as CliSchedule[] };
  });

export const createSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; cron: string; prompt: string; agent_slug?: string; model?: string; notify_email?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("cli_schedules")
      .insert({
        user_id: userId,
        name: data.name,
        cron: data.cron,
        prompt: data.prompt,
        agent_slug: data.agent_slug ?? "ceo-grok",
        model: data.model ?? null,
        notify_email: data.notify_email?.trim() || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { schedule: row as CliSchedule };
  });

export const toggleSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("cli_schedules").update({ enabled: data.enabled }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("cli_schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Execute a schedule immediately, regardless of its cron expression.
 * Persists the result + emails the operator on failure.
 */
export const runScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Verify ownership before delegating to the shared engine.
    const { data: s, error: loadErr } = await supabaseAdmin
      .from("cli_schedules")
      .select("id, user_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (loadErr || !s) throw new Error("Schedule not found");

    const outcome = await runScheduleOnce(s.id, "manual");
    if (!outcome.ok) throw new Error(outcome.error ?? "Run failed");
    return { ok: true, output: outcome.output ?? "", attempts: outcome.attempts, durationMs: outcome.durationMs };
  });

export type CliScheduleRun = {
  id: string;
  schedule_id: string;
  trigger: string;
  status: string;
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  output: string | null;
  error: string | null;
  model: string | null;
  provider: string | null;
};

/**
 * Recent execution history for a schedule (latest first, capped at 25).
 */
export const listScheduleRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("cli_schedule_runs")
      .select("*")
      .eq("schedule_id", data.id)
      .order("started_at", { ascending: false })
      .limit(Math.min(data.limit ?? 25, 100));
    if (error) throw new Error(error.message);
    return { runs: (rows ?? []) as CliScheduleRun[] };
  });

/**
 * Most recent cron heartbeat (proves the cron job itself is alive).
 */
export const getCronHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("cron_heartbeat")
      .select("*")
      .eq("job", "run-cli-schedules")
      .order("ticked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { heartbeat: data };
  });

