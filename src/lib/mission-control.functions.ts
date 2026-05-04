/**
 * Mission Control — aggregate metrics for the operator cockpit.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MissionControl = {
  spend: { last24hUsd: number; last30dUsd: number; calls24h: number };
  topModels: Array<{ model: string; calls: number; cost: number }>;
  brainHealth: Array<{ provider: string; status: string; checked_at: string; latency_ms: number | null }>;
  bridges: { paired: number; lastSeen: string | null };
  schedules: { total: number; enabled: number; failures24h: number };
  intel24h: number;
};

export const getMissionControl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MissionControl> => {
    const { userId } = context as any;
    const since24 = new Date(Date.now() - 86_400_000).toISOString();
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [usage24, usage30, health, bridges, schedules, intel] = await Promise.all([
      supabaseAdmin.from("usage_events").select("model,cost_usd").eq("user_id", userId).gte("created_at", since24),
      supabaseAdmin.from("usage_events").select("cost_usd").eq("user_id", userId).gte("created_at", since30),
      supabaseAdmin.from("brain_health").select("provider,status,checked_at,latency_ms").order("checked_at", { ascending: false }).limit(50),
      supabaseAdmin.from("bridge_devices").select("paired_at,last_seen_at").eq("user_id", userId).not("paired_at", "is", null),
      supabaseAdmin.from("cli_schedules").select("enabled,consecutive_failures").eq("user_id", userId),
      supabaseAdmin.from("frontier_intel").select("id", { count: "exact", head: true }).gte("discovered_at", since24),
    ]);

    const u24 = usage24.data ?? [];
    const last24hUsd = u24.reduce((s, r: any) => s + Number(r.cost_usd ?? 0), 0);
    const last30dUsd = (usage30.data ?? []).reduce((s, r: any) => s + Number(r.cost_usd ?? 0), 0);

    const byModel = new Map<string, { calls: number; cost: number }>();
    for (const r of u24 as any[]) {
      const m = byModel.get(r.model) ?? { calls: 0, cost: 0 };
      m.calls += 1; m.cost += Number(r.cost_usd ?? 0);
      byModel.set(r.model, m);
    }
    const topModels = [...byModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.calls - a.calls).slice(0, 5);

    // Latest health row per provider
    const latest = new Map<string, any>();
    for (const r of (health.data ?? []) as any[]) {
      if (!latest.has(r.provider)) latest.set(r.provider, r);
    }

    const sch = schedules.data ?? [];
    return {
      spend: { last24hUsd, last30dUsd, calls24h: u24.length },
      topModels,
      brainHealth: [...latest.values()],
      bridges: {
        paired: (bridges.data ?? []).length,
        lastSeen: (bridges.data ?? []).map((b: any) => b.last_seen_at).filter(Boolean).sort().pop() ?? null,
      },
      schedules: {
        total: sch.length,
        enabled: sch.filter((s: any) => s.enabled).length,
        failures24h: sch.reduce((n: number, s: any) => n + (s.consecutive_failures ?? 0), 0),
      },
      intel24h: intel.count ?? 0,
    };
  });
