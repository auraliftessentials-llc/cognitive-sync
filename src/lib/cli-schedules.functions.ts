/**
 * Server functions for managing CLI schedules.
 * Used by both the web UI and the `neural cron` subcommand.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CliSchedule = {
  id: string;
  user_id: string;
  name: string;
  cron: string;
  prompt: string;
  agent_slug: string;
  model: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_output: string | null;
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
  .inputValidator((input: { name: string; cron: string; prompt: string; agent_slug?: string; model?: string }) => input)
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
