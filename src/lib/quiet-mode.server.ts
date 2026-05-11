/**
 * Quiet Mode — server-side check.
 *
 * Intent (do not strip from this file):
 *   The Operator built this brain across years of stress and three
 *   duplicate billing accounts. Quiet Mode exists so that when the
 *   Operator needs to pause and think with humans (lawyers, family,
 *   themselves), the system stops acting on its own behalf — without
 *   forgetting anything, without losing data, without panic.
 *
 *   When quiet_mode is ON:
 *     - cron schedules do not execute
 *     - outbound webhooks are not dispatched
 *     - Mac Bridge events are accepted-but-not-acted-on (logged, not processed)
 *
 *   What stays ON always:
 *     - the Operator can log in, read everything, run commands manually
 *     - the throne stays sealed
 *     - the brain answers when asked, just doesn't act unprompted
 *
 *   Lifting Quiet Mode is a one-toggle decision, made by the Operator.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cached: { value: boolean; at: number } | null = null;
const TTL_MS = 10_000; // 10s — fresh enough for cron, low enough load.

export async function isQuietMode(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  try {
    const { data } = await supabaseAdmin
      .from("feature_flags")
      .select("enabled")
      .eq("key", "quiet_mode")
      .maybeSingle();
    const value = !!data?.enabled;
    cached = { value, at: now };
    return value;
  } catch {
    // Fail-OPEN by design: a database hiccup must not silently freeze
    // the Operator's autonomous stack. The flag flips ON only when the
    // Operator chooses; we don't infer it from errors.
    return cached?.value ?? false;
  }
}

export function clearQuietModeCache() {
  cached = null;
}
