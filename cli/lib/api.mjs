/**
 * Thin wrapper around fetch that talks to /api/cli/*.
 * Adds streaming helper for SSE endpoints.
 */
import { version as PKG_VERSION } from "../package.json" with { type: "json" };

export async function apiFetch(cfg, method, path, body) {
  const url = `${cfg.url.replace(/\/$/, "")}/api/cli/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      "User-Agent": `neural-cli/${PKG_VERSION}`,
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

/**
 * Stream SSE events from POST /api/cli/stream.
 * Calls onEvent({ event, data }) for each parsed event.
 */
export async function apiStream(cfg, body, onEvent, opts = {}) {
  const url = `${cfg.url.replace(/\/$/, "")}/api/cli/stream`;
  const ctrl = opts.signal ? null : new AbortController();
  const signal = opts.signal ?? ctrl?.signal;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": `neural-cli/${PKG_VERSION}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`stream failed [${res.status}]: ${text.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let currentEvent = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") { currentEvent = "message"; continue; }
      if (line.startsWith(":")) continue;
      if (line.startsWith("event: ")) { currentEvent = line.slice(7).trim(); continue; }
      if (line.startsWith("data: ")) {
        const json = line.slice(6).trim();
        try {
          const data = JSON.parse(json);
          onEvent({ event: currentEvent, data });
        } catch {
          // ignore partial
        }
      }
    }
  }
  return ctrl;
}
