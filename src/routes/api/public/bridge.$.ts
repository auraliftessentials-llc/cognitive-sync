/**
 * MERKABAH · Mac Bridge endpoint — full live mode.
 *
 * Routes:
 *   GET  /api/public/bridge/status                  — public health
 *   POST /api/public/bridge/pair                    — body: {code, hostname?} → mints API key
 *   POST /api/public/bridge/heartbeat               — Bearer mbk_… → updates last_seen
 *   POST /api/public/bridge/event                   — Bearer mbk_… → daemon pushes audit/result
 *
 * Auth model:
 *   Per-device API key `mbk_…` (44 chars). Stored as sha256 hash in bridge_devices.
 *   Daemon sends `Authorization: Bearer mbk_…` on every call.
 *   Sandboxing (allowed_roots) and capabilities (fs.read/fs.write/shell.exec)
 *   are enforced at the daemon. The cloud only authenticates the device and
 *   logs the action; the daemon refuses anything outside its allowed roots.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import crypto from "crypto";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function authDevice(request: Request) {
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(mbk_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const hash = sha256(m[1]);
  const { data } = await supabaseAdmin.rpc("find_bridge_device", { _hash: hash });
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as { device_id: string; user_id: string; allowed_roots: string[]; capabilities: string[] };
}

export const Route = createFileRoute("/api/public/bridge/$")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "authorization, content-type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          },
        }),

      GET: async ({ params }) => {
        if (params._splat === "status") {
          return json({
            ok: true,
            phase: "live",
            message: "Bridge endpoint live. Pair a device from Merkabah OS → Bridge.",
            version: 1,
          });
        }
        return json({ ok: false, error: "Not found" }, 404);
      },

      POST: async ({ request, params }) => {
        const path = params._splat ?? "";

        // 1) Pairing — exchange short code for a long-lived API key
        if (path === "pair") {
          let body: any = {};
          try { body = await request.json(); } catch { /* tolerate */ }
          const code = String(body?.code ?? "").trim().toUpperCase();
          const hostname = (String(body?.hostname ?? "").slice(0, 80) || "") as string;
          if (!/^[A-Z0-9]{8}$/.test(code)) return json({ ok: false, error: "Bad code" }, 400);

          // Mint the API key first, then atomically claim the pairing row
          const raw = "mbk_" + crypto.randomBytes(32).toString("base64url");
          const hash = sha256(raw);
          const prefix = raw.slice(0, 12);

          const { data: deviceId, error } = await supabaseAdmin.rpc("claim_bridge_pairing", {
            _code: code, _hash: hash, _prefix: prefix, _hostname: hostname,
          });
          if (error) return json({ ok: false, error: error.message }, 500);
          if (!deviceId) return json({ ok: false, error: "Pairing code invalid or expired" }, 410);

          return json({ ok: true, device_id: deviceId, api_key: raw });
        }

        // 2) All other endpoints require Bearer mbk_…
        const principal = await authDevice(request);
        if (!principal) return json({ ok: false, error: "Unauthorized" }, 401);

        if (path === "heartbeat") {
          return json({
            ok: true,
            allowed_roots: principal.allowed_roots,
            capabilities: principal.capabilities,
            server_time: new Date().toISOString(),
          });
        }

        if (path === "event") {
          let body: any = {};
          try { body = await request.json(); } catch { /* tolerate */ }
          const action = String(body?.action ?? "unknown").slice(0, 40);
          const target = body?.target ? String(body.target).slice(0, 500) : null;
          const ok = body?.ok !== false;
          const errorMsg = body?.error ? String(body.error).slice(0, 500) : null;
          const bytes = Number.isFinite(body?.bytes) ? Math.min(body.bytes, 2_000_000_000) : null;
          const duration_ms = Number.isFinite(body?.duration_ms) ? Math.min(body.duration_ms, 600_000) : null;

          await supabaseAdmin.from("bridge_audit").insert({
            device_id: principal.device_id,
            user_id: principal.user_id,
            action, target, ok, error: errorMsg, bytes, duration_ms,
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          });
          return json({ ok: true });
        }

        return json({ ok: false, error: "Unknown bridge path" }, 404);
      },
    },
  },
});
