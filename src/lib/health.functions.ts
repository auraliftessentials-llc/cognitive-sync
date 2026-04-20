/**
 * Brain health & diagnostics — public-ish server functions.
 * Used by the persistent BrainStatusBar widget and the /brains console command.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkAllProviders, checkAuxiliary, type ProviderHealth, type AuxiliaryHealth } from "./brain.server";

export type BrainHealthSnapshot = {
  providers: ProviderHealth[];
  auxiliary: AuxiliaryHealth[];
  generated_at: string;
};

function toSnapshot(rows: Array<{
  provider: string;
  status: string;
  http: number | null;
  message: string | null;
  latency_ms: number | null;
  checked_at: string;
}>): BrainHealthSnapshot {
  const providerIds = new Set(["xai", "lovable-openai", "lovable-google"]);
  const auxiliaryIds = new Set(["perplexity", "cloudflare"]);

  const providers: ProviderHealth[] = [];
  const auxiliary: AuxiliaryHealth[] = [];
  const labels: Record<string, string> = {
    xai: "Grok 4 (xAI)",
    "lovable-openai": "GPT-5 (Lovable)",
    "lovable-google": "Gemini 3 Flash (Lovable)",
    perplexity: "Perplexity",
    cloudflare: "Cloudflare",
  };
  const models: Record<string, string> = {
    xai: "x-ai/grok-4",
    "lovable-openai": "openai/gpt-5",
    "lovable-google": "google/gemini-3-flash-preview",
  };

  for (const row of rows) {
    const base = {
      status: row.status as any,
      http: row.http ?? undefined,
      message: row.message ?? undefined,
      latency_ms: row.latency_ms ?? undefined,
      checked_at: row.checked_at,
    };
    if (providerIds.has(row.provider)) {
      providers.push({
        provider: row.provider as any,
        label: labels[row.provider] ?? row.provider,
        model: models[row.provider] ?? row.provider,
        ...base,
      });
    } else if (auxiliaryIds.has(row.provider)) {
      auxiliary.push({
        id: row.provider as any,
        label: labels[row.provider] ?? row.provider,
        ...base,
      });
    }
  }

  return { providers, auxiliary, generated_at: new Date().toISOString() };
}

/**
 * Fast read — pulls the cached `brain_health` rows the server last wrote.
 * No outbound network calls; safe to poll every 30–60s from the UI.
 */
export const getBrainHealthCached = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrainHealthSnapshot> => {
    const { data, error } = await context.supabase
      .from("brain_health")
      .select("provider,status,http,message,latency_ms,checked_at")
      .order("provider", { ascending: true });

    if (error || !data) {
      return { providers: [], auxiliary: [], generated_at: new Date().toISOString() };
    }

    return toSnapshot(data);
  });

/**
 * Live ping — actually hits every provider. Slower; surfaces fresh data.
 * Triggered by the "refresh" button on the status bar and by /brains.
 */
export const refreshBrainHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<BrainHealthSnapshot> => {
    const [providers, auxiliary] = await Promise.all([checkAllProviders(), checkAuxiliary()]);
    return { providers, auxiliary, generated_at: new Date().toISOString() };
  });
