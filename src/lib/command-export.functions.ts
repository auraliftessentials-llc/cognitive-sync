/**
 * Command audit export — returns the user's merkabah_commands as CSV text.
 * Caller (UI) turns the string into a blob and triggers a download.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  limit: z.number().int().min(1).max(5000).optional(),
  status: z.enum(["executing", "complete", "error"]).optional(),
  since: z.string().datetime().optional(),
});

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const exportCommandsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("merkabah_commands")
      .select("id,created_at,source,status,winner,latency_ms,command,result,error")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 1000);
    if (data.status) q = q.eq("status", data.status);
    if (data.since) q = q.gte("created_at", data.since);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const headers = [
      "id",
      "created_at",
      "source",
      "status",
      "winner",
      "latency_ms",
      "command",
      "provider",
      "model",
      "output",
      "error",
    ];
    const lines = [headers.join(",")];
    for (const r of (rows ?? []) as any[]) {
      const result = r.result ?? {};
      lines.push(
        [
          r.id,
          r.created_at,
          r.source,
          r.status,
          r.winner,
          r.latency_ms,
          r.command,
          result.provider,
          result.model,
          result.output,
          r.error,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    return { csv: lines.join("\n"), count: rows?.length ?? 0 };
  });
