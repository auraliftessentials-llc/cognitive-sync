/**
 * Server functions for managing CLI schedules.
 * Used by both the web UI and the `neural cron` subcommand.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callBrain, type BrainMessage } from "@/lib/brain.server";
import { executeTool, TOOL_SCHEMAS, type ToolName } from "@/lib/zoho-tools.server";
import { sendNotifyEmail } from "@/lib/email-notify.server";

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
    const { data: s, error: loadErr } = await supabaseAdmin
      .from("cli_schedules")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (loadErr || !s) throw new Error("Schedule not found");

    const startedAt = new Date();
    try {
      const { data: agents } = await supabaseAdmin
        .from("agents").select("*")
        .or(`slug.eq.${s.agent_slug},and(is_system.eq.true,slug.eq.ceo-grok)`)
        .limit(2);
      const agent = agents?.find((a) => a.slug === s.agent_slug) ?? agents?.[0];
      if (!agent) throw new Error("No agent available");

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
              const out = await executeTool(userId, name, args);
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
        .update({ last_run_at: startedAt.toISOString(), last_status: "ok", last_output: finalText.slice(0, 8000) })
        .eq("id", s.id);
      return { ok: true, output: finalText };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      await supabaseAdmin
        .from("cli_schedules")
        .update({ last_run_at: startedAt.toISOString(), last_status: "error", last_output: msg })
        .eq("id", s.id);

      if (s.notify_email) {
        const r = await sendNotifyEmail({
          to: s.notify_email,
          subject: `[Merkabah] Schedule failed: ${s.name}`,
          html: `<h2>Schedule failed</h2>
            <p><strong>${s.name}</strong> (manual run)</p>
            <p style="font-family:monospace;background:#f5f5f5;padding:8px;border-radius:4px">${escapeHtml(msg)}</p>
            <p style="color:#666;font-size:12px">Cron: <code>${s.cron}</code> · Agent: ${s.agent_slug} · ${startedAt.toISOString()}</p>`,
        });
        if (r.ok) {
          await supabaseAdmin.from("cli_schedules").update({ last_error_emailed_at: new Date().toISOString() }).eq("id", s.id);
        }
      }
      throw new Error(msg);
    }
  });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
