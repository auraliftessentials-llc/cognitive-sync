/**
 * Bridge device management — pair, list, revoke, and audit external devices
 * (Mac daemon, Linux box, etc.) that connect to Merkabah OS.
 *
 * Pairing flow:
 *   1. User clicks "Pair new device" → server generates an 8-char code (10-min TTL)
 *      and a row in bridge_devices with no api_key_hash yet.
 *   2. User runs the daemon on Mac with that code. Daemon POSTs to
 *      /api/public/bridge/pair with code → server mints a per-device API key,
 *      stores its sha256 hash, returns the raw key (shown ONCE to the daemon).
 *   3. Daemon stores the raw key locally (~/.merkabah/bridge.json, mode 0600)
 *      and uses it as Bearer for every subsequent request.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import crypto from "crypto";

function newPairingCode(): string {
  // Avoid 0/O/1/I for human readability
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export const listBridgeDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("bridge_devices")
      .select("id,name,platform,hostname,api_key_prefix,pairing_code,pairing_expires_at,paired_at,allowed_roots,capabilities,last_seen_at,revoked_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { devices: data ?? [] };
  });

export const startBridgePairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name?: string; allowed_roots?: string[]; capabilities?: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const code = newPairingCode();
    const { data: row, error } = await supabaseAdmin
      .from("bridge_devices")
      .insert({
        user_id: userId,
        name: (data.name?.trim() || "MacBook").slice(0, 60),
        platform: "macos",
        pairing_code: code,
        pairing_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        allowed_roots: data.allowed_roots?.length ? data.allowed_roots : ["~"],
        capabilities: data.capabilities?.length ? data.capabilities : ["fs.read", "fs.list"],
      })
      .select("id,name,pairing_code,pairing_expires_at,allowed_roots,capabilities")
      .single();
    if (error) throw new Error(error.message);
    return { device: row, pairing_code: code };
  });

export const revokeBridgeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("bridge_devices")
      .update({ revoked_at: new Date().toISOString(), api_key_hash: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBridgeAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("bridge_audit")
      .select("id,device_id,action,target,ok,error,bytes,duration_ms,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data?.limit ?? 50, 200));
    if (error) throw new Error(error.message);
    return { audit: rows ?? [] };
  });
