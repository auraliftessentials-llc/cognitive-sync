/**
 * Cloudflare ops — server-only helpers for the agent.
 * Powered by CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets.
 *
 * Capabilities:
 *  - listZones / listDnsRecords / upsertDnsRecord / deleteDnsRecord
 *  - purgeCache (whole-zone or by URL)
 *  - listWorkers
 *  - verifyToken (used by health badge)
 */

const CF_BASE = "https://api.cloudflare.com/client/v4";

function auth() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN not configured");
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID not configured");
  return { token, accountId, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function cf<T = any>(path: string, init?: RequestInit): Promise<T> {
  const { headers } = auth();
  const r = await fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) {
    const msg = JSON.stringify(j?.errors ?? j).slice(0, 300);
    throw new Error(`Cloudflare ${path} ${r.status}: ${msg}`);
  }
  return j.result as T;
}

export async function verifyToken() {
  return cf("/user/tokens/verify");
}

export async function listZones() {
  return cf<Array<{ id: string; name: string; status: string }>>("/zones?per_page=50");
}

export async function listDnsRecords(zoneId: string) {
  return cf<Array<{ id: string; type: string; name: string; content: string; proxied: boolean }>>(
    `/zones/${zoneId}/dns_records?per_page=200`,
  );
}

export async function upsertDnsRecord(
  zoneId: string,
  rec: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; id?: string },
) {
  const body = JSON.stringify({
    type: rec.type,
    name: rec.name,
    content: rec.content,
    ttl: rec.ttl ?? 1,
    proxied: rec.proxied ?? false,
  });
  if (rec.id) {
    return cf(`/zones/${zoneId}/dns_records/${rec.id}`, { method: "PUT", body });
  }
  return cf(`/zones/${zoneId}/dns_records`, { method: "POST", body });
}

export async function deleteDnsRecord(zoneId: string, recordId: string) {
  return cf(`/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" });
}

export async function purgeCache(zoneId: string, files?: string[]) {
  const body = files?.length ? JSON.stringify({ files }) : JSON.stringify({ purge_everything: true });
  return cf(`/zones/${zoneId}/purge_cache`, { method: "POST", body });
}

export async function listWorkers() {
  const { accountId } = auth();
  return cf<Array<{ id: string; created_on: string; modified_on: string }>>(
    `/accounts/${accountId}/workers/scripts`,
  );
}
