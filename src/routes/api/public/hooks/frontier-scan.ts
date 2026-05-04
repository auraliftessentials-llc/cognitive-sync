import { createFileRoute } from "@tanstack/react-router";
import { runFrontierScan } from "@/lib/frontier-intel.server";

export const Route = createFileRoute("/api/public/hooks/frontier-scan")({
  server: {
    handlers: {
      POST: async () => {
        const result = await runFrontierScan();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => {
        const result = await runFrontierScan();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
