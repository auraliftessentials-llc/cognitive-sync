/**
 * MERKABAH · Mac Bridge endpoint (Phase 3 stub).
 *
 * This is the future entry point for a local Mac daemon (`merkabah-bridge`)
 * to relay file system, app, and shell access from the Master's MacBook into
 * the PWA. It already enforces HMAC-SHA256 signature authentication so when
 * the daemon is built, no protocol or security work is needed.
 *
 * Flow:
 *   1. Mac daemon signs each request body with shared secret MERKABAH_BRIDGE_SECRET
 *      → header `x-merkabah-signature: <hex>`
 *   2. This endpoint verifies the signature in constant time
 *   3. Routes to the correct sub-handler (status / list / read / write / exec)
 *
 * Until the secret is set OR the daemon ships, every call returns
 * `503 Bridge offline — Phase 3 daemon not deployed`. That is the correct
 * answer; we never silently succeed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function unauthorized(reason: string) {
  return new Response(JSON.stringify({ ok: false, error: reason }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function verify(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/bridge/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Health probe — does NOT require signature.
        if (params._splat === "status") {
          return Response.json({
            ok: true,
            bridge_configured: !!process.env.MERKABAH_BRIDGE_SECRET,
            phase: process.env.MERKABAH_BRIDGE_SECRET ? "armed" : "stub",
            message:
              "Bridge endpoint is wired. Deploy the local merkabah-bridge daemon (Phase 3) to enable Mac filesystem & shell access.",
          });
        }
        return unauthorized("GET only allowed for /status");
      },

      POST: async ({ request, params }) => {
        const secret = process.env.MERKABAH_BRIDGE_SECRET;
        if (!secret) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Bridge offline — Phase 3 daemon not deployed.",
              hint: "Set MERKABAH_BRIDGE_SECRET in Cloud secrets and run the local merkabah-bridge daemon to activate.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }
        const body = await request.text();
        if (!verify(body, request.headers.get("x-merkabah-signature"), secret)) {
          return unauthorized("Invalid signature");
        }
        // Future: route to params._splat = "fs/list" | "fs/read" | "shell/exec" | ...
        return Response.json({
          ok: true,
          received_path: params._splat,
          echo: JSON.parse(body || "{}"),
          note: "Bridge handshake verified. Sub-handlers will be added in Phase 3.",
        });
      },
    },
  },
});
