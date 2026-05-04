import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildRoadCardSvg } from "@/lib/roadmap.server";
import { Sparkles, Map as MapIcon } from "lucide-react";

const getSharedRoadmap = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("roadmaps")
      .select("id,title,merkaba_level,duration_weeks,weekly_hours,data,created_at,share_token")
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Not found");
    const svg = buildRoadCardSvg(row as any);
    const { data: progress } = await supabaseAdmin
      .from("roadmap_progress")
      .select("topic_name,status,mastery_level,updated_at")
      .eq("roadmap_id", row.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    return { roadmap: row, svg, progress: progress ?? [] };
  });

export const Route = createFileRoute("/share/roadmap/$token")({
  head: ({ loaderData }) => {
    const t = (loaderData as any)?.roadmap?.title ?? "Merkaba Ascension Path";
    const desc = "A sacred ascension roadmap forged in MERKABAH OS.";
    return {
      meta: [
        { title: `${t} — Merkabah OS` },
        { name: "description", content: desc },
        { property: "og:title", content: t },
        { property: "og:description", content: desc },
      ],
    };
  },
  loader: ({ params }) => getSharedRoadmap({ data: { token: params.token } }),
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Path not found</h1>
        <p className="text-muted-foreground">This share link is invalid or has been revoked.</p>
        <Link to="/" className="text-primary underline">Back to Merkabah OS</Link>
      </div>
    </div>
  ),
  component: SharedRoadmap,
});

function SharedRoadmap() {
  const { roadmap, svg, progress } = Route.useLoaderData() as any;
  const data = roadmap.data ?? {};
  const completed = progress.filter((p: any) => p.status === "completed").length;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-xs uppercase tracking-[0.3em] text-primary flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Merkabah OS
          </Link>
          <Link to="/auth" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
            Forge your own →
          </Link>
        </header>

        <div
          className="rounded-xl overflow-hidden border border-primary/30"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MapIcon className="h-7 w-7 text-primary" /> {roadmap.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{data.merkaba_vibe}</p>
          <div className="mt-2 flex gap-4 text-xs uppercase tracking-wider text-muted-foreground">
            <span>{roadmap.merkaba_level}</span>
            <span>{roadmap.duration_weeks} weeks</span>
            <span>{data.total_estimated_hours ?? "—"} hrs</span>
            <span>{completed} topics completed</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {(data.weeks ?? []).map((w: any, i: number) => (
            <div key={i} className="rounded border border-border bg-card/40 p-3">
              <div className="text-xs uppercase tracking-wider text-primary">Week {i + 1}</div>
              <div className="font-semibold">{w.sacred_focus ?? w.focus ?? `Week ${i + 1}`}</div>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {(w.topics ?? []).slice(0, 6).map((t: any, j: number) => (
                  <li key={j}>· {typeof t === "string" ? t : t.name ?? ""}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
          Walk a sacred path of your own at{" "}
          <Link to="/" className="text-primary underline">cognitivesync.io</Link>
        </div>
      </div>
    </div>
  );
}
