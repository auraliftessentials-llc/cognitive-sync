/**
 * Firecrawl + Linear server functions — for the agent / Voice Hub / Frontier Intel.
 * Both go through the connector gateway with LOVABLE_API_KEY + per-connection key.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl";
const LINEAR_GATEWAY = "https://connector-gateway.lovable.dev/linear";

function gatewayHeaders(connKeyEnv: string) {
  const lovable = process.env.LOVABLE_API_KEY;
  const conn = process.env[connKeyEnv];
  if (!lovable) throw new Error("LOVABLE_API_KEY not configured");
  if (!conn) throw new Error(`${connKeyEnv} not configured`);
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": conn,
    "Content-Type": "application/json",
  };
}

// ---------- Firecrawl ----------

export const firecrawlScrape = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        url: z.string().url(),
        formats: z.array(z.string()).optional(),
        onlyMainContent: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const r = await fetch(`${FIRECRAWL_GATEWAY}/v2/scrape`, {
      method: "POST",
      headers: gatewayHeaders("FIRECRAWL_API_KEY"),
      body: JSON.stringify({
        url: data.url,
        formats: data.formats ?? ["markdown"],
        onlyMainContent: data.onlyMainContent ?? true,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Firecrawl scrape ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  });

export const firecrawlSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
        tbs: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const r = await fetch(`${FIRECRAWL_GATEWAY}/v2/search`, {
      method: "POST",
      headers: gatewayHeaders("FIRECRAWL_API_KEY"),
      body: JSON.stringify({ query: data.query, limit: data.limit ?? 10, tbs: data.tbs }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Firecrawl search ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  });

// ---------- Linear ----------

async function linearGql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${LINEAR_GATEWAY}/graphql`, {
    method: "POST",
    headers: gatewayHeaders("LINEAR_API_KEY"),
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) {
    throw new Error(`Linear GQL ${r.status}: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
  }
  return j.data as T;
}

export const linearViewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return linearGql(`query { viewer { id name email } teams(first: 20) { nodes { id name key } } }`);
  });

export const linearCreateIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        teamId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.number().int().min(0).max(4).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return linearGql(
      `mutation Create($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { id identifier title url } }
      }`,
      { input: { teamId: data.teamId, title: data.title, description: data.description, priority: data.priority } },
    );
  });

export const linearListIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ teamId: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const filter = data.teamId ? `, filter: { team: { id: { eq: "${data.teamId}" } } }` : "";
    return linearGql(
      `query { issues(first: ${data.limit ?? 20}${filter}, orderBy: updatedAt) {
        nodes { id identifier title state { name } priority url updatedAt }
      } }`,
    );
  });
