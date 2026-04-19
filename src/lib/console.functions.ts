/**
 * Console — server entrypoints used by /console terminal and ⌘K palette.
 * Runs an agent turn with full Zoho tool-calling support.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeTool, TOOL_SCHEMAS, type ToolName } from "./zoho-tools.server";

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string; tool_calls?: any[] };

async function callModel(model: string, messages: Msg[]) {
  const isGrok = model.startsWith("x-ai/");
  const endpoint = isGrok
    ? "https://api.x.ai/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const apiKey = isGrok ? process.env.XAI_API_KEY : process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error(isGrok ? "XAI_API_KEY missing" : "LOVABLE_API_KEY missing");
  const body: Record<string, unknown> = {
    model: isGrok ? model.replace(/^x-ai\//, "") : model,
    messages,
    tools: TOOL_SCHEMAS,
    tool_choice: "auto",
  };
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Model ${r.status}: ${t.slice(0, 400)}`);
  }
  return r.json();
}

export const consoleRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agent_slug?: string; agent_id?: string; prompt: string; model?: string; history?: Msg[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Pick the agent
    const q = supabase.from("agents").select("*").limit(1);
    const { data: agents } = data.agent_id
      ? await supabase.from("agents").select("*").eq("id", data.agent_id).limit(1)
      : data.agent_slug
        ? await supabase.from("agents").select("*").eq("slug", data.agent_slug).limit(1)
        : await q.eq("slug", "ceo-grok");
    const agent = agents?.[0];
    if (!agent) throw new Error("No agent found");

    const model = data.model && agent.available_models.includes(data.model)
      ? data.model
      : agent.default_model;

    // Insert run row
    const { data: runRow } = await supabase
      .from("agent_runs")
      .insert({
        agent_id: agent.id,
        user_id: userId,
        model,
        prompt: data.prompt,
        status: "streaming",
      })
      .select("id")
      .single();
    const runId = runRow?.id as string;
    const startedAt = Date.now();

    const messages: Msg[] = [
      { role: "system", content: agent.system_prompt },
      ...(data.history ?? []).slice(-10),
      { role: "user", content: data.prompt },
    ];

    const toolCalls: { name: string; args: any; result: any; ms: number; ok: boolean; error?: string }[] = [];

    try {
      // Up to 4 tool-call rounds
      for (let round = 0; round < 4; round++) {
        const resp = await callModel(model, messages);
        const choice = resp.choices?.[0]?.message;
        if (!choice) throw new Error("Empty model response");

        if (choice.tool_calls?.length) {
          messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
          for (const tc of choice.tool_calls) {
            const name = tc.function?.name as ToolName;
            let parsed: any = {};
            try { parsed = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
            const t0 = Date.now();
            try {
              const result = await executeTool(userId, name, parsed);
              const ms = Date.now() - t0;
              toolCalls.push({ name, args: parsed, result, ms, ok: true });
              await supabase.from("agent_tool_calls").insert({
                run_id: runId, user_id: userId, tool_name: name, arguments: parsed,
                result, status: "complete", duration_ms: ms,
              });
              messages.push({
                role: "tool", tool_call_id: tc.id, name,
                content: JSON.stringify(result).slice(0, 12000),
              });
            } catch (e: any) {
              const ms = Date.now() - t0;
              const error = e?.message ?? String(e);
              toolCalls.push({ name, args: parsed, result: null, ms, ok: false, error });
              await supabase.from("agent_tool_calls").insert({
                run_id: runId, user_id: userId, tool_name: name, arguments: parsed,
                status: "error", error, duration_ms: ms,
              });
              messages.push({
                role: "tool", tool_call_id: tc.id, name,
                content: JSON.stringify({ error }),
              });
            }
          }
          continue;
        }

        // Final answer
        const output = choice.content ?? "";
        await supabase.from("agent_runs").update({
          status: "complete",
          output,
          duration_ms: Date.now() - startedAt,
          tokens_in: Math.ceil(data.prompt.length / 4),
          tokens_out: Math.ceil(output.length / 4),
        }).eq("id", runId);

        return {
          run_id: runId,
          agent: { id: agent.id, name: agent.name, emoji: agent.emoji, slug: agent.slug },
          model,
          output,
          tool_calls: toolCalls,
        };
      }

      throw new Error("Tool-call loop exceeded 4 rounds");
    } catch (e: any) {
      await supabase.from("agent_runs").update({
        status: "error",
        error: e?.message ?? String(e),
        duration_ms: Date.now() - startedAt,
      }).eq("id", runId);
      throw e;
    }
  });
