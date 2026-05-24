import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Anthropic Admin API surface. Uses ANTHROPIC_ADMIN_KEY (separate from
 * ANTHROPIC_API_KEY). Read-only for now — admin actions are added on request.
 * Docs: https://docs.anthropic.com/en/api/admin-api/getting-started
 */

const ADMIN_VERSION = "2023-06-01";

function adminHeaders(): HeadersInit {
  const key = (process.env.ANTHROPIC_ADMIN_KEY || "").trim();
  if (!key) throw new Error("ANTHROPIC_ADMIN_KEY is not configured");
  return {
    "x-api-key": key,
    "anthropic-version": ADMIN_VERSION,
    "content-type": "application/json",
  };
}

async function adminGet(path: string) {
  const res = await fetch(`https://api.anthropic.com${path}`, {
    method: "GET",
    headers: adminHeaders(),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leave raw */ }
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: json?.error?.message ?? text.slice(0, 400) };
  }
  return { ok: true as const, status: res.status, data: json };
}

export const getAnthropicAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { configured: Boolean(process.env.ANTHROPIC_ADMIN_KEY) };
  });

export const getAnthropicOrgOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [workspaces, users, apiKeys] = await Promise.all([
      adminGet("/v1/organizations/workspaces?limit=50"),
      adminGet("/v1/organizations/users?limit=50"),
      adminGet("/v1/organizations/api_keys?limit=50"),
    ]);
    return { workspaces, users, apiKeys };
  });
