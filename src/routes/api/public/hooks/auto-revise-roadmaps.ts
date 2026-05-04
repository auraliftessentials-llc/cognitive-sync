import { createFileRoute } from "@tanstack/react-router";
import { autoReviseDueRoadmaps } from "@/lib/roadmap.server";

export const Route = createFileRoute("/api/public/hooks/auto-revise-roadmaps")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await autoReviseDueRoadmaps();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
