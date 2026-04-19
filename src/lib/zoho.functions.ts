import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Returns the OAuth start URL for the current user.
// User must add ZOHO_CLIENT_ID + ZOHO_CLIENT_SECRET secrets.
export const getZohoAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    const clientId = process.env.ZOHO_CLIENT_ID;
    if (!clientId) {
      return { configured: false as const };
    }
    const origin = process.env.SITE_URL || "https://id-preview--9bab356d-3978-4977-aaa2-4d0d6b21f319.lovable.app";
    const redirectUri = `${origin}/api/zoho/callback`;
    const scopes = [
      "ZohoMail.messages.READ",
      "ZohoMail.messages.CREATE",
      "ZohoMail.accounts.READ",
      "ZohoCRM.modules.ALL",
      "ZohoCRM.users.READ",
      "ZohoCRM.settings.READ",
    ].join(",");
    const state = Buffer.from(JSON.stringify({ uid: userId, t: Date.now() })).toString("base64url");
    const url = `https://accounts.zoho.com/oauth/v2/auth?response_type=code&client_id=${encodeURIComponent(
      clientId,
    )}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&access_type=offline&prompt=consent&state=${state}`;
    return { configured: true as const, url };
  });

// Get current user's Zoho connection status
export const getZohoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("zoho_connections")
      .select("email, scopes, expires_at, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    return { connection: data ?? null };
  });

export const disconnectZoho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    await supabase.from("zoho_connections").delete().eq("user_id", userId);
    await supabase.from("audit_log").insert({
      actor_id: userId,
      actor_email: claims?.email,
      action: "zoho.disconnected",
    });
    return { ok: true };
  });

// Internal: refresh + return access token
async function getValidZohoToken(supabase: any, userId: string) {
  const { data: conn } = await supabase
    .from("zoho_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) throw new Error("Zoho not connected");
  if (new Date(conn.expires_at).getTime() > Date.now() + 60_000) return conn;

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Zoho secrets not set");

  const res = await fetch(`${conn.accounts_domain}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Zoho refresh failed: ${res.status}`);
  const j = await res.json();
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();
  const { data: updated } = await supabase
    .from("zoho_connections")
    .update({
      access_token: j.access_token,
      api_domain: j.api_domain ?? conn.api_domain,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select()
    .single();
  return updated;
}

// Recent Zoho mail messages (uses primary account)
export const getZohoMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const conn = await getValidZohoToken(supabase, userId);
    const acctRes = await fetch(`https://mail.zoho.com/api/accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${conn.access_token}` },
    });
    if (!acctRes.ok) throw new Error(`Mail accounts ${acctRes.status}`);
    const acct = await acctRes.json();
    const accountId = acct.data?.[0]?.accountId;
    if (!accountId) return { messages: [], accountEmail: null };

    const msgRes = await fetch(
      `https://mail.zoho.com/api/accounts/${accountId}/messages/view?limit=20`,
      { headers: { Authorization: `Zoho-oauthtoken ${conn.access_token}` } },
    );
    if (!msgRes.ok) return { messages: [], accountEmail: acct.data?.[0]?.primaryEmailAddress ?? null };
    const msg = await msgRes.json();
    return {
      messages: msg.data ?? [],
      accountEmail: acct.data?.[0]?.primaryEmailAddress ?? null,
    };
  });

// Recent Zoho CRM leads
export const getZohoCrmLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const conn = await getValidZohoToken(supabase, userId);
    const res = await fetch(`${conn.api_domain}/crm/v6/Leads?per_page=20&sort_by=Modified_Time&sort_order=desc`, {
      headers: { Authorization: `Zoho-oauthtoken ${conn.access_token}` },
    });
    if (!res.ok) {
      if (res.status === 204) return { leads: [] };
      throw new Error(`CRM ${res.status}`);
    }
    const j = await res.json();
    return { leads: j.data ?? [] };
  });
