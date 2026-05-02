// Streaming executive agent runner with brain-switching + automatic fallback.
// Fallback chain: chosen model -> remaining of [xAI, Lovable/openai, Lovable/google].
// On 401/402/403/429/5xx for the first provider, transparently re-tries the
// next one in the chain and emits a `meta.fallback` SSE event so the UI can
// surface "Grok unavailable, fell back to GPT-5".
//
// Auth: requires JWT. Streams SSE in OpenAI delta format and persists the run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ProviderId =
  | "xai"
  | "openai-direct"
  | "anthropic-direct"
  | "lovable-openai"
  | "lovable-google";

type ProviderDef = {
  id: ProviderId;
  model: string;
  endpoint: string;
  apiKeyEnv: string;
  modelOnWire: string;
  /** anthropic uses x-api-key + anthropic-version headers */
  wire: "openai" | "anthropic";
};

const PROVIDERS: Record<ProviderId, ProviderDef> = {
  xai: {
    id: "xai",
    model: "x-ai/grok-4",
    endpoint: "https://api.x.ai/v1/chat/completions",
    apiKeyEnv: "XAI_API_KEY",
    modelOnWire: "grok-4",
    wire: "openai",
  },
  "openai-direct": {
    id: "openai-direct",
    model: "openai/gpt-5",
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
    modelOnWire: "gpt-5",
    wire: "openai",
  },
  "anthropic-direct": {
    id: "anthropic-direct",
    model: "anthropic/claude-sonnet-4-5",
    endpoint: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelOnWire: "claude-sonnet-4-5",
    wire: "anthropic",
  },
  "lovable-openai": {
    id: "lovable-openai",
    model: "openai/gpt-5",
    endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKeyEnv: "LOVABLE_API_KEY",
    modelOnWire: "openai/gpt-5",
    wire: "openai",
  },
  "lovable-google": {
    id: "lovable-google",
    model: "google/gemini-3-flash-preview",
    endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKeyEnv: "LOVABLE_API_KEY",
    modelOnWire: "google/gemini-3-flash-preview",
    wire: "openai",
  },
};

// Master's keys first, Lovable last-resort.
const DEFAULT_CHAIN: ProviderId[] = [
  "xai",
  "openai-direct",
  "anthropic-direct",
  "lovable-openai",
  "lovable-google",
];

function resolveChain(preferredModel: string): ProviderId[] {
  const direct = (Object.values(PROVIDERS).find((p) => p.model === preferredModel)?.id) as ProviderId | undefined;
  if (!direct) return DEFAULT_CHAIN;
  return [direct, ...DEFAULT_CHAIN.filter((id) => id !== direct)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let runId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_PUBLISHABLE_KEY =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { agent_id, prompt, model: modelOverride, workspace_id, history } = body ?? {};
    if (!agent_id || !prompt) return json({ error: "agent_id and prompt required" }, 400);

    const { data: agent, error: agentErr } = await userClient
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();
    if (agentErr || !agent) return json({ error: "Agent not found" }, 404);

    const preferredModel: string =
      modelOverride && agent.available_models.includes(modelOverride)
        ? modelOverride
        : agent.default_model;

    const chain = resolveChain(preferredModel);

    const { data: run } = await userClient
      .from("agent_runs")
      .insert({
        agent_id,
        workspace_id: workspace_id ?? null,
        user_id: userData.user.id,
        model: preferredModel,
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

    // Try each provider in chain until one returns a usable streaming body.
    const fallbackTrail: { provider: ProviderId; status: number; error: string }[] = [];
    let chosen: { provider: ProviderDef; resp: Response } | null = null;

    for (const id of chain) {
      const p = PROVIDERS[id];
      const apiKey = Deno.env.get(p.apiKeyEnv);
      if (!apiKey) {
        fallbackTrail.push({ provider: id, status: 0, error: `${p.apiKeyEnv} missing` });
        continue;
      }
      const aiBody: Record<string, unknown> = { model: p.modelOnWire, messages, stream: true };
      if (p.model.startsWith("openai/gpt-5") || p.model.includes("gemini-3")) {
        aiBody.reasoning = { effort: agent.reasoning_effort ?? "medium" };
      }
      const resp = await fetch(p.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(aiBody),
      });
      if (resp.ok && resp.body) {
        chosen = { provider: p, resp };
        break;
      }
      const errText = await resp.text().catch(() => "");
      fallbackTrail.push({ provider: id, status: resp.status, error: errText.slice(0, 200) });
      console.warn(`agent-stream provider ${id} failed`, resp.status, errText.slice(0, 200));
    }

    if (!chosen) {
      const summary = fallbackTrail.map((f) => `${f.provider}=${f.status}`).join(",");
      const friendly = "All AI providers unavailable. Check the brain status badge.";
      if (runId) {
        await userClient
          .from("agent_runs")
          .update({ status: "error", error: `${friendly} [${summary}]` })
          .eq("id", runId);
      }
      return json({ error: friendly, fallbacks: fallbackTrail }, 503);
    }

    const { provider, resp } = chosen;
    if (runId && provider.model !== preferredModel) {
      // Persist the actual model used so logs are accurate.
      await userClient.from("agent_runs").update({ model: provider.model }).eq("id", runId);
    }

    let fullText = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = resp.body!.getReader();
        let buffer = "";
        try {
          // Initial meta event — UI knows which brain is actually streaming.
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                meta: {
                  run_id: runId,
                  model: provider.model,
                  preferred_model: preferredModel,
                  agent: agent.name,
                  provider: provider.id,
                  fallbacks: fallbackTrail,
                },
              })}\n\n`,
            ),
          );
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
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
              } catch { /* partial */ }
            }
          }
        } catch (e) {
          console.error("stream error", e);
        } finally {
          controller.close();
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
