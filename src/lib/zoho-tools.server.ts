/**
 * Server-only Zoho tool executor.
 * Centralized so server functions, edge-function-via-RPC, and the Console can
 * all execute the same actions with consistent auth + auditing.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ToolName =
  | "zoho_list_deals"
  | "zoho_list_leads"
  | "zoho_list_contacts"
  | "zoho_list_tasks"
  | "zoho_search_records"
  | "zoho_update_deal"
  | "zoho_create_task"
  | "zoho_send_mail"
  | "zoho_list_recent_mail"
  | "marketing_campaign_brief"
  | "web_research"
  | "cloudflare_list_zones"
  | "cloudflare_list_dns"
  | "cloudflare_create_dns"
  | "cloudflare_purge_cache"
  | "cloudflare_workers_ai";

async function getValidToken(userId: string) {
  const { data: conn } = await supabaseAdmin
    .from("zoho_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) throw new Error("Zoho not connected. Hit Profile → Connect Zoho first.");
  if (new Date(conn.expires_at).getTime() > Date.now() + 60_000) return conn;

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Zoho secrets missing");

  const r = await fetch(`${conn.accounts_domain}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Zoho refresh failed: ${r.status}`);
  const j = await r.json();
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();
  const { data: updated } = await supabaseAdmin
    .from("zoho_connections")
    .update({
      access_token: j.access_token,
      api_domain: j.api_domain ?? conn.api_domain,
      expires_at: expiresAt,
    })
    .eq("user_id", userId)
    .select()
    .single();
  return updated!;
}

async function crmGet(userId: string, path: string) {
  const conn = await getValidToken(userId);
  const r = await fetch(`${conn.api_domain}${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${conn.access_token}` },
  });
  if (r.status === 204) return { data: [] };
  if (!r.ok) throw new Error(`CRM ${r.status}: ${await r.text()}`);
  return r.json();
}

async function crmRequest(userId: string, path: string, method: "POST" | "PUT", body: any) {
  const conn = await getValidToken(userId);
  const r = await fetch(`${conn.api_domain}${path}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`CRM ${method} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function mailRequest(userId: string, path: string, init?: RequestInit) {
  const conn = await getValidToken(userId);
  const r = await fetch(`https://mail.zoho.com${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${conn.access_token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`Mail ${r.status}: ${await r.text()}`);
  return r.json();
}

async function cfFetch(path: string, init?: RequestInit) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN missing");
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) {
    throw new Error(`Cloudflare ${r.status}: ${JSON.stringify(j?.errors ?? j).slice(0, 300)}`);
  }
  return j;
}

export async function executeTool(
  userId: string,
  name: ToolName,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case "zoho_list_deals":
      return crmGet(userId, `/crm/v6/Deals?per_page=${args.limit ?? 20}&sort_by=Modified_Time&sort_order=desc`);
    case "zoho_list_leads":
      return crmGet(userId, `/crm/v6/Leads?per_page=${args.limit ?? 20}&sort_by=Modified_Time&sort_order=desc`);
    case "zoho_list_contacts":
      return crmGet(userId, `/crm/v6/Contacts?per_page=${args.limit ?? 20}&sort_by=Modified_Time&sort_order=desc`);
    case "zoho_list_tasks":
      return crmGet(userId, `/crm/v6/Tasks?per_page=${args.limit ?? 20}&sort_by=Modified_Time&sort_order=desc`);
    case "zoho_search_records": {
      const module = String(args.module ?? "Deals");
      const criteria = encodeURIComponent(String(args.criteria ?? ""));
      return crmGet(userId, `/crm/v6/${module}/search?criteria=${criteria}`);
    }
    case "zoho_update_deal":
      return crmRequest(userId, `/crm/v6/Deals`, "PUT", { data: [{ id: args.id, ...args.fields }] });
    case "zoho_create_task":
      return crmRequest(userId, `/crm/v6/Tasks`, "POST", {
        data: [{
          Subject: args.subject,
          Due_Date: args.due_date,
          Description: args.description,
          ...(args.related_to ? { Related_To: args.related_to } : {}),
        }],
      });
    case "zoho_list_recent_mail": {
      const acct = await mailRequest(userId, `/api/accounts`);
      const accountId = acct.data?.[0]?.accountId;
      if (!accountId) return { messages: [] };
      const msg = await mailRequest(userId, `/api/accounts/${accountId}/messages/view?limit=${args.limit ?? 15}`);
      return { messages: msg.data ?? [], accountEmail: acct.data?.[0]?.primaryEmailAddress };
    }
    case "zoho_send_mail": {
      const acct = await mailRequest(userId, `/api/accounts`);
      const accountId = acct.data?.[0]?.accountId;
      const fromAddress = acct.data?.[0]?.primaryEmailAddress;
      if (!accountId || !fromAddress) throw new Error("No Zoho mail account found");
      return mailRequest(userId, `/api/accounts/${accountId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          fromAddress,
          toAddress: args.to,
          subject: args.subject,
          content: args.body,
          mailFormat: "html",
        }),
      });
    }
    case "marketing_campaign_brief":
      // Pure transform — gives the model a structured scaffold to expand.
      return {
        brief: {
          product: args.product,
          audience: args.audience,
          goal: args.goal,
          frameworks: ["AIDA", "PAS", "Eugene Schwartz awareness ladder"],
          deliverables: [
            "5-email cold outreach sequence",
            "3 landing-page hero variants",
            "10 viral hooks for short-form video",
            "1 paid ad set (Meta + LinkedIn) with 3 creatives each",
            "1 founder-voice X thread (~12 posts)",
          ],
        },
      };
    case "web_research": {
      const key = process.env.PERPLEXITY_API_KEY;
      if (!key) throw new Error("PERPLEXITY_API_KEY missing");
      const recency = ["day", "week", "month", "year"].includes(args.recency) ? args.recency : "week";
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: args.deep ? "sonar-pro" : "sonar",
          messages: [
            { role: "system", content: "Be precise, concise, and cite sources inline. Return facts the operator can act on." },
            { role: "user", content: String(args.query ?? "") },
          ],
          search_recency_filter: recency,
          temperature: 0.2,
        }),
      });
      if (!r.ok) throw new Error(`Perplexity ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      return {
        answer: j.choices?.[0]?.message?.content ?? "",
        citations: j.citations ?? [],
        model: j.model,
      };
    }
    case "cloudflare_list_zones": {
      const j = await cfFetch(`/zones?per_page=${args.limit ?? 25}`);
      return { zones: (j.result ?? []).map((z: any) => ({ id: z.id, name: z.name, status: z.status, plan: z.plan?.name })) };
    }
    case "cloudflare_list_dns": {
      if (!args.zone_id) throw new Error("zone_id required");
      const j = await cfFetch(`/zones/${args.zone_id}/dns_records?per_page=${args.limit ?? 50}`);
      return { records: (j.result ?? []).map((r: any) => ({ id: r.id, type: r.type, name: r.name, content: r.content, proxied: r.proxied, ttl: r.ttl })) };
    }
    case "cloudflare_create_dns": {
      if (!args.zone_id || !args.type || !args.name || !args.content) throw new Error("zone_id, type, name, content required");
      const j = await cfFetch(`/zones/${args.zone_id}/dns_records`, {
        method: "POST",
        body: JSON.stringify({
          type: args.type, name: args.name, content: args.content,
          ttl: args.ttl ?? 1, proxied: args.proxied ?? true,
        }),
      });
      return j.result;
    }
    case "cloudflare_purge_cache": {
      if (!args.zone_id) throw new Error("zone_id required");
      const body = args.urls?.length ? { files: args.urls } : { purge_everything: true };
      const j = await cfFetch(`/zones/${args.zone_id}/purge_cache`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return j.result;
    }
    case "cloudflare_workers_ai": {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const token = process.env.CLOUDFLARE_API_TOKEN;
      if (!accountId || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN required");
      const model = args.model ?? "@cf/meta/llama-3.1-8b-instruct";
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: args.system ?? "You are a precise assistant." },
            { role: "user", content: String(args.prompt ?? "") },
          ],
        }),
      });
      if (!r.ok) throw new Error(`Cloudflare AI ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      return { model, response: j.result?.response ?? j };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Tool schemas for OpenAI/xAI function-calling
export const TOOL_SCHEMAS = [
  { type: "function", function: { name: "zoho_list_deals",   description: "List recent Zoho CRM deals.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "zoho_list_leads",   description: "List recent Zoho CRM leads.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "zoho_list_contacts",description: "List recent Zoho CRM contacts.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "zoho_list_tasks",   description: "List recent Zoho CRM tasks.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "zoho_search_records", description: "Search Zoho CRM with a criteria string like (Stage:equals:Qualification).", parameters: { type: "object", properties: { module: { type: "string" }, criteria: { type: "string" } }, required: ["module","criteria"] } } },
  { type: "function", function: { name: "zoho_update_deal",  description: "Update a Zoho deal by id.", parameters: { type: "object", properties: { id: { type: "string" }, fields: { type: "object" } }, required: ["id","fields"] } } },
  { type: "function", function: { name: "zoho_create_task",  description: "Create a Zoho task.", parameters: { type: "object", properties: { subject: { type: "string" }, due_date: { type: "string" }, description: { type: "string" }, related_to: { type: "string" } }, required: ["subject"] } } },
  { type: "function", function: { name: "zoho_send_mail",    description: "Send a Zoho Mail message from the user's primary account.", parameters: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to","subject","body"] } } },
  { type: "function", function: { name: "zoho_list_recent_mail", description: "List recent Zoho Mail messages.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "marketing_campaign_brief", description: "Return a structured campaign brief scaffold to expand.", parameters: { type: "object", properties: { product: { type: "string" }, audience: { type: "string" }, goal: { type: "string" } }, required: ["product","audience","goal"] } } },
] as const;
