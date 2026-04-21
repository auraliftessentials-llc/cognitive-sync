/**
 * CLI token management — mint, list, revoke personal access tokens used by
 * the `neural` command-line tool. Raw tokens are returned ONLY at creation
 * time and stored as SHA-256 hashes.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import crypto from "crypto";

function newToken(): { raw: string; hash: string; prefix: string } {
  // 32 random bytes → 43-char base64url; prefix is `nrl_` so it's recognizable.
  const bytes = crypto.randomBytes(32);
  const body = bytes.toString("base64url");
  const raw = `nrl_${body}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

export const listCliTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("cli_tokens")
      .select("id,name,token_prefix,scopes,last_used_at,expires_at,revoked_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tokens: data ?? [] };
  });

export const createCliToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; scopes?: string[]; expires_in_days?: number }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const name = String(data.name ?? "").trim().slice(0, 80) || "neural-cli";
    const scopes = Array.isArray(data.scopes) ? data.scopes.slice(0, 20) : [];
    const expires_at = data.expires_in_days && data.expires_in_days > 0
      ? new Date(Date.now() + data.expires_in_days * 86400_000).toISOString()
      : null;

    const { raw, hash, prefix } = newToken();
    const { data: row, error } = await supabaseAdmin
      .from("cli_tokens")
      .insert({ user_id: userId, name, token_hash: hash, token_prefix: prefix, scopes, expires_at })
      .select("id,name,token_prefix,scopes,expires_at,created_at")
      .single();
    if (error) throw new Error(error.message);

    // Audit
    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: "cli_token.created",
      target_type: "cli_token",
      target_id: row.id,
      metadata: { name, scopes, expires_at },
    });

    return { token: raw, record: row };
  });

export const revokeCliToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("cli_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: "cli_token.revoked",
      target_type: "cli_token",
      target_id: data.id,
      metadata: {},
    });
    return { ok: true };
  });
