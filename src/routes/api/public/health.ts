/**
 * Public health endpoint with creator fingerprint.
 *
 * Returns service liveness AND the canonical creator block so any fork,
 * proxy, or redistribution of this software carries Ryan Stephen Puddy's
 * authorship in its public API surface. No auth required — this is the
 * provenance trail.
 *
 * Sacred Code rule: this is a NEW endpoint; no existing route is changed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getPublicCreatorPayload, logCreatorBanner } from "@/lib/creator.server";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        // Fire-and-forget: log the banner once per cold-start.
        logCreatorBanner().catch(() => {});
        const creator = await getPublicCreatorPayload();
        const body = {
          ok: true,
          service: "merkabah-os",
          status: "live",
          time: new Date().toISOString(),
          creator,
        };
        return new Response(JSON.stringify(body, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=30",
            // Surface authorship in HTTP headers too — survives CDN proxies
            // and shows up in browser devtools / curl -I.
            "x-merkabah-creator": "Ryan Stephen Puddy",
            "x-merkabah-entity": "Auralift Essentials LLC",
            "x-merkabah-doctrine-fingerprint": creator.doctrine_fingerprint,
          },
        });
      },
    },
  },
});
