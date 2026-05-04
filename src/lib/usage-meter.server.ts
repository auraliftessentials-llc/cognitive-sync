/**
 * Usage metering — fire-and-forget. Called from callBrain consumers.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COST: Record<string, { in: number; out: number }> = {
  // USD per 1k tokens (rough)
  "x-ai/grok-4":            { in: 0.005, out: 0.015 },
  "openai/gpt-5":           { in: 0.005, out: 0.015 },
  "openai/gpt-5-mini":      { in: 0.0005, out: 0.0015 },
  "google/gemini-2.5-pro":  { in: 0.0035, out: 0.01 },
  "google/gemini-2.5-flash":{ in: 0.0001, out: 0.0004 },
};

export async function recordUsage(args: {
  userId: string;
  workspaceId?: string | null;
  provider: string;
  model: string;
  taskKind?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}) {
  try {
    const c = COST[args.model] ?? { in: 0.001, out: 0.003 };
    const cost =
      ((args.tokensIn ?? 0) / 1000) * c.in +
      ((args.tokensOut ?? 0) / 1000) * c.out;
    await supabaseAdmin.from("usage_events").insert({
      user_id: args.userId,
      workspace_id: args.workspaceId ?? null,
      provider: args.provider,
      model: args.model,
      task_kind: args.taskKind ?? null,
      tokens_in: args.tokensIn ?? 0,
      tokens_out: args.tokensOut ?? 0,
      cost_usd: Number(cost.toFixed(6)),
      latency_ms: args.latencyMs ?? null,
    });
  } catch (e) {
    console.error("usage meter failed", e);
  }
}
