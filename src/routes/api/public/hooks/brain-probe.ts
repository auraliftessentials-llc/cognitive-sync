import { createFileRoute } from "@tanstack/react-router";
import { callBrain, PROVIDERS, type ProviderId } from "@/lib/brain.server";

export const Route = createFileRoute("/api/public/hooks/brain-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const only = url.searchParams.get("provider") as ProviderId | null;
        const ids: ProviderId[] = only
          ? [only]
          : (["xai", "google-direct", "openai-direct", "anthropic-direct", "lovable-google"] as ProviderId[]);

        const results: any[] = [];
        for (const id of ids) {
          const p = PROVIDERS[id];
          const hasKey = !!process.env[p.apiKeyEnv];
          if (!hasKey) {
            results.push({ provider: id, ok: false, reason: `${p.apiKeyEnv} missing` });
            continue;
          }
          const t0 = Date.now();
          try {
            const res = await callBrain({
              messages: [{ role: "user", content: "Reply with the single word: pong" }],
              preferredModel: p.model,
              timeoutMs: 8000,
            });
            results.push({
              provider: id,
              ok: true,
              used: res.provider,
              model: res.model,
              latency_ms: Date.now() - t0,
              output: (res.message.content ?? "").slice(0, 80),
              fallbacks: res.fallbacks,
            });
          } catch (e: any) {
            results.push({ provider: id, ok: false, latency_ms: Date.now() - t0, error: e?.message ?? String(e) });
          }
        }
        return new Response(JSON.stringify({ results }, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
