/**
 * MERKABAH · Constellation
 *
 * Single source of truth for every node in the Operator's empire. Provides:
 *   - listConstellation: read all infra_resources for the user
 *   - seedTrinity: idempotently create Dominion / OMEGA / Oro Omega nodes
 *   - probeNode: live health check for a single node (AWS, http endpoint, etc.)
 *   - probeAll: parallel probe of every node, persists status + last_health
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { awsWhoAmI } from "./aws.server";

const TRINITY = [
  {
    name: "Dominion Sales AI",
    kind: "project" as const,
    endpoint_url: "https://dominion-sales-ai.lovable.app",
    description: "Autonomous sales platform · Grok CEO · Stripe live + 24h trial auto-charge",
    metadata: { role: "revenue", brain: "grok-4", stripe: "live-pending" },
  },
  {
    name: "OMEGA Revenue OS",
    kind: "project" as const,
    endpoint_url: "https://growth-command-os.lovable.app",
    description: "Shopify + Stripe Live revenue command · Launch Mode pending",
    metadata: { role: "commerce", shopify: "connected", stripe: "live-pending" },
  },
  {
    name: "Oro Omega CEO Brain",
    kind: "agent" as const,
    endpoint_url: null,
    description: "Aura Omega unified commerce CEO brain · cross-system orchestrator",
    metadata: { role: "orchestrator", brain: "grok-4+puter" },
  },
  {
    name: "AWS Console",
    kind: "cloud" as const,
    endpoint_url: "https://console.aws.amazon.com",
    description: "AWS dev console — STS verified via SigV4",
    metadata: { role: "infra" },
  },
] as const;

export type ConstellationNode = {
  id: string;
  name: string;
  kind: string;
  status: "online" | "degraded" | "offline" | "unknown" | "provisioning";
  endpoint_url: string | null;
  description: string | null;
  metadata: Record<string, any>;
  last_health_at: string | null;
  last_health_result: any;
  updated_at: string;
};

export const listConstellation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ nodes: ConstellationNode[] }> => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("infra_resources")
      .select("*")
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { nodes: (data ?? []) as ConstellationNode[] };
  });

export const seedTrinity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ inserted: number }> => {
    const { supabase, userId } = context as any;
    let inserted = 0;
    for (const node of TRINITY) {
      const { data: existing } = await supabase
        .from("infra_resources")
        .select("id")
        .eq("user_id", userId)
        .eq("name", node.name)
        .maybeSingle();
      if (existing) continue;
      const { error } = await supabase.from("infra_resources").insert({
        user_id: userId,
        name: node.name,
        kind: node.kind,
        endpoint_url: node.endpoint_url,
        description: node.description,
        metadata: node.metadata,
        status: "unknown",
      });
      if (!error) inserted++;
    }
    return { inserted };
  });

async function probeHttp(url: string, timeoutMs = 6000) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, redirect: "follow" });
    return { ok: res.ok, status: res.status, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e), latency_ms: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

async function probeOne(node: ConstellationNode) {
  // AWS: STS whoami (also hydrates account id)
  if (node.name === "AWS Console" || node.kind === "cloud") {
    const r = await awsWhoAmI();
    return {
      status: r.ok ? "online" : "offline",
      result: r,
      patchMetadata: r.ok ? { account: r.account, arn: r.arn, region: r.region } : null,
    };
  }
  // Agent (no endpoint) — assume online; orchestrator lives inside this app
  if (node.kind === "agent" && !node.endpoint_url) {
    return { status: "online", result: { mode: "in-process" }, patchMetadata: null };
  }
  // HTTP endpoint
  if (node.endpoint_url) {
    const r = await probeHttp(node.endpoint_url);
    return {
      status: r.ok ? "online" : r.status && r.status < 500 ? "degraded" : "offline",
      result: r,
      patchMetadata: null,
    };
  }
  return { status: "unknown", result: { reason: "no probe configured" }, patchMetadata: null };
}

export const probeAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ probed: number; nodes: ConstellationNode[] }> => {
    const { supabase, userId } = context as any;
    const { data: nodes, error } = await supabase
      .from("infra_resources")
      .select("*")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const all = (nodes ?? []) as ConstellationNode[];
    const results = await Promise.all(all.map((n) => probeOne(n).then((r) => ({ n, r }))));
    for (const { n, r } of results) {
      const patch: any = {
        status: r.status,
        last_health_at: new Date().toISOString(),
        last_health_result: r.result,
      };
      if (r.patchMetadata) {
        patch.metadata = { ...(n.metadata ?? {}), ...r.patchMetadata };
      }
      await supabase.from("infra_resources").update(patch).eq("id", n.id);
    }
    const { data: refreshed } = await supabase
      .from("infra_resources")
      .select("*")
      .eq("user_id", userId)
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    return { probed: all.length, nodes: (refreshed ?? []) as ConstellationNode[] };
  });
