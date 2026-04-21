/**
 * Server-only helper to authenticate a `neural` CLI request.
 * Looks for a Bearer token of the form `nrl_...`, hashes it with SHA-256,
 * and resolves it to a user via the SECURITY DEFINER `find_cli_token_user`
 * RPC (which also bumps `last_used_at`).
 */
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CliPrincipal = {
  userId: string;
  scopes: string[];
  tokenId: string;
};

export async function authenticateCli(request: Request): Promise<CliPrincipal | null> {
  const auth = request.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(nrl_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const raw = m[1];
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const { data, error } = await supabaseAdmin.rpc("find_cli_token_user", { _hash: hash });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { user_id: string; scopes: string[]; token_id: string };
  return { userId: row.user_id, scopes: row.scopes ?? [], tokenId: row.token_id };
}

export function hasScope(principal: CliPrincipal, scope: string): boolean {
  // Empty scopes array = full access (token has not been narrowed).
  if (!principal.scopes.length) return true;
  return principal.scopes.includes(scope) || principal.scopes.includes("*");
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...(init.headers ?? {}),
    },
  });
}

export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}
