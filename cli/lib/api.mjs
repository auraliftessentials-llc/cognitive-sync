/**
 * Thin wrapper around fetch that talks to /api/cli/*.
 */
export async function apiFetch(cfg, method, path, body) {
  const url = `${cfg.url.replace(/\/$/, "")}/api/cli/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      "User-Agent": "neural-cli/0.1",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (!res.ok) {
    const msg = parsed?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}
