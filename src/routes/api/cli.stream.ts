/**
 * SSE Streaming endpoint for the Neural CLI.
 *
 * POST /api/cli/stream
 *   Body: { prompt, agent_slug?, model? }
 *   Auth: Bearer nrl_… (CLI token)
 *
 * Emits server-sent events:
 *   event: meta        data: { run_id, agent, model, provider }
 *   event: token       data: { delta }                 ← assistant text chunks
 *   event: tool_call   data: { name, args }            ← tool invocation start
 *   event: tool_result data: { name, ok, ms, preview } ← tool finished
 *   event: fallback    data: { provider, status, error }
 *   event: done        data: { run_id, output, model, provider, tool_calls, ms }
 *   event: error       data: { message }
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCli, hasScope, corsPreflight, jsonResponse } from "@/lib/cli-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeTool, TOOL_SCHEMAS, type ToolName } from "@/lib/zoho-tools.server";
import { PROVIDERS, resolveChain, type BrainMessage, type ProviderId } from "@/lib/brain.server";

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function streamProvider(
  providerId: ProviderId,
  messages: BrainMessage[],
  modelOverride: string | undefined,
  reasoningEffort: string | undefined,
  onDelta: (s: string) => void,
): Promise<{
  ok: boolean;
  status: number;
  message?: { role: string; content: string; tool_calls?: any[] };
  error?: string;
}> {
  const p = PROVIDERS[providerId];
  const apiKey = process.env[p.apiKeyEnv];
  if (!apiKey) return { ok: false, status: 0, error: `${p.apiKeyEnv} not configured` };

  const body: any = {
    model: modelOverride && modelOverride === p.model ? p.modelOnWire : p.modelOnWire,
    messages,
    stream: true,
    tools: TOOL_SCHEMAS,
    tool_choice: "auto",
  };
  if (reasoningEffort && reasoningEffort !== "none" && (p.model.startsWith("openai/gpt-5") || p.model.includes("gemini-3"))) {
    body.reasoning = { effort: reasoningEffort };
  }

  let resp: Response;
  try {
    resp = await fetch(p.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message ?? "network error" };
  }

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, error: text.slice(0, 300) };
  }

  // Parse SSE from upstream
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const toolCallsAcc: Record<number, any> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") break;
      try {
        const parsed = JSON.parse(json);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          content += delta.content;
          onDelta(delta.content);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            const acc = (toolCallsAcc[i] ??= { id: tc.id, type: "function", function: { name: "", arguments: "" } });
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.function.name += tc.function.name;
            if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
          }
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }

  const tool_calls = Object.values(toolCallsAcc).filter((t: any) => t.function?.name);
  return {
    ok: true,
    status: resp.status,
    message: { role: "assistant", content, tool_calls: tool_calls.length ? tool_calls : undefined },
  };
}

export const Route = createFileRoute("/api/cli/stream")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const principal = await authenticateCli(request);
        if (!principal) return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        if (!hasScope(principal, "agent")) return jsonResponse({ error: "Missing scope: agent" }, { status: 403 });

        const body = await request.json().catch(() => ({}));
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

        const preferred =
          modelOverride && agent.available_models.includes(modelOverride)
            ? modelOverride
            : agent.default_model;

        const { data: runRow } = await supabaseAdmin
          .from("agent_runs")
          .insert({
            agent_id: agent.id,
            user_id: principal.userId,
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

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (event: string, data: unknown) => controller.enqueue(enc.encode(sseEvent(event, data)));
            const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15_000);

            const fallbacks: any[] = [];
            const allToolCalls: any[] = [];
            let finalProvider: ProviderId | null = null;
            let finalContent = "";

            try {
              const chain = resolveChain(preferred);

              outer: for (let round = 0; round < 4; round++) {
                let succeeded = false;

                for (const providerId of chain) {
                  const p = PROVIDERS[providerId];
                  send("meta", { run_id: runId, agent: agent.slug, model: p.model, provider: providerId, round });

                  const result = await streamProvider(
                    providerId,
                    messages,
                    p.model,
                    agent.reasoning_effort,
                    (delta) => send("token", { delta }),
                  );

                  if (!result.ok) {
                    fallbacks.push({ provider: providerId, status: result.status, error: result.error });
                    send("fallback", { provider: providerId, status: result.status, error: result.error });
                    continue;
                  }

                  succeeded = true;
                  finalProvider = providerId;
                  const choice = result.message!;
                  finalContent = choice.content ?? "";

                  if (choice.tool_calls?.length) {
                    messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
                    for (const tc of choice.tool_calls) {
                      const name = tc.function?.name as ToolName;
                      let args: any = {};
                      try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
                      send("tool_call", { name, args });
                      const t0 = Date.now();
                      try {
                        const r = await executeTool(principal.userId, name, args);
                        const ms = Date.now() - t0;
                        const preview = JSON.stringify(r).slice(0, 200);
                        allToolCalls.push({ name, args, ok: true, ms, result: r });
                        send("tool_result", { name, ok: true, ms, preview });
                        messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(r).slice(0, 12000) });
                        await supabaseAdmin.from("agent_tool_calls").insert({
                          user_id: principal.userId,
                          run_id: runId,
                          tool_name: name,
                          arguments: args,
                          result: r,
                          status: "complete",
                          duration_ms: ms,
                        });
                      } catch (e: any) {
                        const ms = Date.now() - t0;
                        allToolCalls.push({ name, args, ok: false, ms, error: e?.message });
                        send("tool_result", { name, ok: false, ms, error: e?.message });
                        messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify({ error: e?.message }) });
                        await supabaseAdmin.from("agent_tool_calls").insert({
                          user_id: principal.userId,
                          run_id: runId,
                          tool_name: name,
                          arguments: args,
                          status: "error",
                          error: e?.message,
                          duration_ms: ms,
                        });
                      }
                    }
                    continue outer; // next round with tool results in context
                  }

                  // No tool calls — we're done
                  break outer;
                }

                if (!succeeded) throw new Error(`All providers failed: ${fallbacks.map((f) => `${f.provider}=${f.status}`).join(", ")}`);
              }

              const ms = Date.now() - startedAt;
              await supabaseAdmin.from("agent_runs").update({
                status: "complete",
                output: finalContent,
                model: finalProvider ? PROVIDERS[finalProvider].model : preferred,
                duration_ms: ms,
                tokens_in: Math.ceil(prompt.length / 4),
                tokens_out: Math.ceil(finalContent.length / 4),
              }).eq("id", runId);

              send("done", {
                run_id: runId,
                output: finalContent,
                model: finalProvider ? PROVIDERS[finalProvider].model : preferred,
                provider: finalProvider,
                tool_calls: allToolCalls,
                fallbacks,
                ms,
              });
            } catch (e: any) {
              await supabaseAdmin.from("agent_runs").update({
                status: "error", error: e?.message ?? String(e), duration_ms: Date.now() - startedAt,
              }).eq("id", runId);
              send("error", { message: e?.message ?? String(e) });
            } finally {
              clearInterval(ping);
              controller.close();
            }
          },
        });

        return new Response(stream, { headers: sseHeaders() });
      },
    },
  },
});
