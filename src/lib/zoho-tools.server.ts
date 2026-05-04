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
  | "cloudflare_workers_ai"
  | "firecrawl_scrape"
  | "firecrawl_search"
  | "wikipedia_lookup"
  | "arxiv_search"
  | "duckduckgo_instant"
  | "linear_list_teams"
  | "linear_create_issue"
  | "linear_list_issues";

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
    case "firecrawl_scrape": {
      const lovable = process.env.LOVABLE_API_KEY;
      const fc = process.env.FIRECRAWL_API_KEY;
      if (!lovable || !fc) throw new Error("Firecrawl not configured (need LOVABLE_API_KEY + FIRECRAWL_API_KEY)");
      const r = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": fc, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: String(args.url ?? ""),
          formats: args.formats ?? ["markdown"],
          onlyMainContent: args.onlyMainContent ?? true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Firecrawl scrape ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
      return j;
    }
    case "firecrawl_search": {
      const lovable = process.env.LOVABLE_API_KEY;
      const fc = process.env.FIRECRAWL_API_KEY;
      if (!lovable || !fc) throw new Error("Firecrawl not configured");
      const r = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": fc, "Content-Type": "application/json" },
        body: JSON.stringify({ query: String(args.query ?? ""), limit: args.limit ?? 10, tbs: args.tbs }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Firecrawl search ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
      return j;
    }
    case "wikipedia_lookup": {
      const lang = String(args.lang ?? "en");
      const title = encodeURIComponent(String(args.title ?? args.query ?? ""));
      if (!title) throw new Error("title or query required");
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`, {
        headers: { "User-Agent": "MerkabahOS/1.0" },
      });
      if (!r.ok) {
        const s = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&search=${title}`);
        const sj = await s.json().catch(() => []);
        return { matches: sj?.[1] ?? [], descriptions: sj?.[2] ?? [], urls: sj?.[3] ?? [] };
      }
      const j = await r.json();
      return { title: j.title, extract: j.extract, url: j.content_urls?.desktop?.page, thumbnail: j.thumbnail?.source, lang };
    }
    case "arxiv_search": {
      const query = encodeURIComponent(String(args.query ?? ""));
      const max = Number(args.limit ?? 5);
      if (!query) throw new Error("query required");
      const r = await fetch(`http://export.arxiv.org/api/query?search_query=all:${query}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`);
      const xml = await r.text();
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
        const block = m[1];
        const pick = (tag: string) => {
          const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
          return mm ? mm[1].trim().replace(/\s+/g, " ") : null;
        };
        const linkMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/);
        return {
          title: pick("title"),
          summary: pick("summary"),
          published: pick("published"),
          authors: [...block.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map((a) => a[1]),
          url: linkMatch?.[1] ?? null,
        };
      });
      return { results: entries };
    }
    case "duckduckgo_instant": {
      const q = encodeURIComponent(String(args.query ?? ""));
      const r = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
      const j = await r.json().catch(() => ({}));
      return {
        abstract: j.AbstractText, source: j.AbstractSource, url: j.AbstractURL, heading: j.Heading,
        related: (j.RelatedTopics ?? []).slice(0, 5).map((t: any) => ({ text: t.Text, url: t.FirstURL })),
      };
    }
    case "linear_list_teams": {
      const lovable = process.env.LOVABLE_API_KEY;
      const lin = process.env.LINEAR_API_KEY;
      if (!lovable || !lin) throw new Error("Linear not configured");
      const r = await fetch("https://connector-gateway.lovable.dev/linear/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": lin, "Content-Type": "application/json" },
        body: JSON.stringify({ query: `query { teams(first: 25) { nodes { id name key } } }` }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.errors) throw new Error(`Linear teams ${r.status}: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
      return j.data;
    }
    case "linear_create_issue": {
      const lovable = process.env.LOVABLE_API_KEY;
      const lin = process.env.LINEAR_API_KEY;
      if (!lovable || !lin) throw new Error("Linear not configured");
      let teamId: string | undefined = args.team_id;
      if (!teamId) {
        const tr = await fetch("https://connector-gateway.lovable.dev/linear/graphql", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": lin, "Content-Type": "application/json" },
          body: JSON.stringify({ query: `query { teams(first: 25) { nodes { id name key } } }` }),
        });
        const tj = await tr.json().catch(() => ({}));
        const teams: any[] = tj?.data?.teams?.nodes ?? [];
        const wantedKey = (args.team_key as string | undefined)?.toUpperCase();
        teamId = wantedKey ? teams.find((t) => t.key === wantedKey)?.id : teams[0]?.id;
        if (!teamId) throw new Error("No Linear team found — pass team_id or team_key");
      }
      const r = await fetch("https://connector-gateway.lovable.dev/linear/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": lin, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }`,
          variables: {
            input: {
              teamId,
              title: String(args.title ?? "Untitled"),
              description: args.description ? String(args.description) : undefined,
              priority: typeof args.priority === "number" ? args.priority : undefined,
            },
          },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.errors) throw new Error(`Linear create ${r.status}: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
      return j.data?.issueCreate;
    }
    case "linear_list_issues": {
      const lovable = process.env.LOVABLE_API_KEY;
      const lin = process.env.LINEAR_API_KEY;
      if (!lovable || !lin) throw new Error("Linear not configured");
      const limit = Number(args.limit ?? 20);
      const r = await fetch("https://connector-gateway.lovable.dev/linear/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": lin, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query { issues(first: ${limit}, orderBy: updatedAt) { nodes { id identifier title state { name } priority url updatedAt team { key } } } }`,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.errors) throw new Error(`Linear issues ${r.status}: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
      return j.data;
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
  { type: "function", function: { name: "web_research", description: "Live web research via Perplexity. Returns a grounded answer + citation URLs. Use for competitor intel, market data, news, or any fact you need to verify in real time.", parameters: { type: "object", properties: { query: { type: "string" }, recency: { type: "string", enum: ["day","week","month","year"] }, deep: { type: "boolean", description: "Use sonar-pro for multi-step reasoning" } }, required: ["query"] } } },
  { type: "function", function: { name: "cloudflare_list_zones", description: "List Cloudflare zones (domains) on this account.", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
  { type: "function", function: { name: "cloudflare_list_dns", description: "List DNS records for a Cloudflare zone.", parameters: { type: "object", properties: { zone_id: { type: "string" }, limit: { type: "number" } }, required: ["zone_id"] } } },
  { type: "function", function: { name: "cloudflare_create_dns", description: "Create a DNS record on a Cloudflare zone.", parameters: { type: "object", properties: { zone_id: { type: "string" }, type: { type: "string" }, name: { type: "string" }, content: { type: "string" }, proxied: { type: "boolean" }, ttl: { type: "number" } }, required: ["zone_id","type","name","content"] } } },
  { type: "function", function: { name: "cloudflare_purge_cache", description: "Purge Cloudflare cache for a zone (all or specific URLs).", parameters: { type: "object", properties: { zone_id: { type: "string" }, urls: { type: "array", items: { type: "string" } } }, required: ["zone_id"] } } },
  { type: "function", function: { name: "cloudflare_workers_ai", description: "Run a prompt through a Cloudflare Workers AI model (default Llama 3.1 8B).", parameters: { type: "object", properties: { prompt: { type: "string" }, system: { type: "string" }, model: { type: "string" } }, required: ["prompt"] } } },
] as const;
