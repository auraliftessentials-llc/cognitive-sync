/**
 * Cloudflare server functions — callable from UI / Voice Hub / agent.
 * All require an authenticated Lovable user.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  verifyToken,
  listZones,
  listDnsRecords,
  upsertDnsRecord,
  deleteDnsRecord,
  purgeCache,
  listWorkers,
} from "./cloudflare.server";

export const cfVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const r = await verifyToken();
      return { ok: true as const, result: r };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? String(e) };
    }
  });

export const cfListZones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { zones: await listZones() };
  });

export const cfListDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ zoneId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    return { records: await listDnsRecords(data.zoneId) };
  });

export const cfUpsertDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        zoneId: z.string().min(1),
        id: z.string().optional(),
        type: z.string().min(1),
        name: z.string().min(1),
        content: z.string().min(1),
        ttl: z.number().int().optional(),
        proxied: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { zoneId, ...rec } = data;
    return { record: await upsertDnsRecord(zoneId, rec) };
  });

export const cfDeleteDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ zoneId: z.string(), recordId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await deleteDnsRecord(data.zoneId, data.recordId);
    return { ok: true };
  });

export const cfPurgeCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ zoneId: z.string(), files: z.array(z.string()).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    return { result: await purgeCache(data.zoneId, data.files) };
  });

export const cfListWorkers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { workers: await listWorkers() };
  });
