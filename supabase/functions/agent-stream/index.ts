// Streaming executive agent runner with brain-switching.
// Auth: requires JWT. Looks up agent, validates model, streams SSE from Lovable AI Gateway,
// then writes a full agent_runs row with output, duration, and token estimates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let runId: string | null = null;
  let supabaseUser: any = null;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_PUBLISHABLE_KEY =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    // User-scoped client (RLS enforced)
    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    supabaseUser = userData.user;

    const body = await req.json();
    const { agent_id, prompt, model: modelOverride, workspace_id, history } = body ?? {};
    if (!agent_id || !prompt) return json({ error: "agent_id and prompt required" }, 400);

    // Load agent (RLS will block access if not allowed)
    const { data: agent, error: agentErr } = await userClient
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();
    if (agentErr || !agent) return json({ error: "Agent not found" }, 404);

    // Brain switching: validate requested model is in allowed list
    const chosenModel: string =
      modelOverride && agent.available_models.includes(modelOverride)
        ? modelOverride
        : agent.default_model;

    // Create run record (pending)
    const { data: run } = await userClient
      .from("agent_runs")
      .insert({
        agent_id,
        workspace_id: workspace_id ?? null,
        user_id: supabaseUser.id,
        model: chosenModel,
        prompt,
        status: "streaming",
      })
      .select("id")
      .single();
    runId = run?.id ?? null;

    const messages = [
      { role: "system", content: agent.system_prompt },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: "user", content: prompt },
    ];

    const aiBody: Record<string, unknown> = {
      model: chosenModel,
      messages,
      stream: true,
    };
    // Reasoning effort for capable models
    if (chosenModel.startsWith("openai/gpt-5") || chosenModel.includes("gemini-3")) {
      aiBody.reasoning = { effort: agent.reasoning_effort ?? "medium" };
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!aiResp.ok || !aiResp.body) {
      const errText = await aiResp.text();
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      const friendly =
        aiResp.status === 429
          ? "Rate limit hit, slow down."
          : aiResp.status === 402
            ? "AI credits exhausted — top up in Settings → Workspace → Usage."
            : "AI gateway error";
      if (runId) {
        await userClient
          .from("agent_runs")
          .update({ status: "error", error: `${friendly}: ${errText.slice(0, 500)}` })
          .eq("id", runId);
      }
      return json({ error: friendly }, status);
    }

    // Tee the stream: forward to client, accumulate for DB
    let fullText = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = aiResp.body!.getReader();
        let buffer = "";
        try {
          // Send a meta event first with run id + model
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ meta: { run_id: runId, model: chosenModel, agent: agent.name } })}\n\n`,
            ),
          );

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Forward raw chunk to client
            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: true });

            let idx;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const c = parsed.choices?.[0]?.delta?.content;
                if (c) fullText += c;
              } catch {
                // ignore partial
              }
            }
          }
        } catch (e) {
          console.error("stream error", e);
        } finally {
          controller.close();
          // Persist run result
          if (runId) {
            const duration = Date.now() - startedAt;
            await userClient
              .from("agent_runs")
              .update({
                status: "complete",
                output: fullText,
                duration_ms: duration,
                tokens_in: Math.ceil(prompt.length / 4),
                tokens_out: Math.ceil(fullText.length / 4),
              })
              .eq("id", runId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("agent-stream error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
