/**
 * Self-Evolving Intelligence Core — server functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runFrontierScan } from "./frontier-intel.server";

export type IntelItem = {
  id: string;
  source: string;
  category: string;
  title: string;
  url: string | null;
  summary: string;
  impact_score: number;
  tags: string[];
  discovered_at: string;
};

export const getRecentIntel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<IntelItem[]> => {
    const { data } = await supabaseAdmin
      .from("frontier_intel")
      .select("id,source,category,title,url,summary,impact_score,tags,discovered_at")
      .order("discovered_at", { ascending: false })
      .limit(50);
    return (data ?? []) as IntelItem[];
  });

export const triggerFrontierScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => runFrontierScan());
