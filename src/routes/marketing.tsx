import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe2, Share2, Search, Sparkles, ExternalLink } from "lucide-react";

const CANONICAL = "https://cognitivesync.io";
const OG_IMAGE = `${CANONICAL}/og-merkabah.jpg`;

const ROUTES = [
  { path: "/", title: "MERKABAH OS — The Operator's Command Layer", priority: "1.0" },
  { path: "/pricing", title: "Pricing — MERKABAH OS · $49 / $199 / $999", priority: "0.9" },
  { path: "/legal", title: "Legal — MERKABAH OS", priority: "0.6" },
  { path: "/auth", title: "Sign in — MERKABAH OS", priority: "0.5" },
];

const HREFLANG = [
  { code: "en", label: "English (default)" },
  { code: "en-US", label: "United States" },
  { code: "en-GB", label: "United Kingdom" },
  { code: "x-default", label: "Fallback" },
];

export const Route = createFileRoute("/marketing")({
  head: () => ({
    meta: [
      { title: "Marketing Cockpit — MERKABAH OS" },
      { name: "description", content: "Internal worldwide marketing cockpit: SEO snapshot, share previews, hreflang map." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MarketingPage,
});

function MarketingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-10 max-w-6xl space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="uppercase tracking-wider">Worldwide Marketing</Badge>
          </div>
          <h1 className="text-4xl font-display tracking-wide uppercase glow-text">Marketing Cockpit</h1>
          <p className="text-muted-foreground max-w-2xl">
            Live SEO posture for <code className="text-primary">{CANONICAL}</code>. Use this to verify share previews, sitemap coverage, and international targeting before every campaign push.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Share Preview */}
          <Card className="glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Share2 className="h-4 w-4" /> Social share preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg overflow-hidden border border-border bg-black">
                <img
                  src="/og-merkabah.jpg"
                  alt="MERKABAH OS open graph card"
                  width={1920}
                  height={1024}
                  className="w-full h-auto"
                  loading="lazy"
                />
                <div className="p-3 text-xs space-y-1">
                  <div className="text-muted-foreground uppercase tracking-wider">cognitivesync.io</div>
                  <div className="font-semibold">MERKABAH OS — The Operator's Command Layer</div>
                  <div className="text-muted-foreground">Sovereign command layer for founders — brain-switching executive agents, live CRM intelligence.</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Served at <code>{OG_IMAGE}</code> · 1920×1024 · summary_large_image
              </div>
            </CardContent>
          </Card>

          {/* Hreflang Map */}
          <Card className="glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe2 className="h-4 w-4" /> International targeting</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {HREFLANG.map((h) => (
                  <li key={h.code} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0">
                    <span className="font-mono text-primary">{h.code}</span>
                    <span className="text-muted-foreground">{h.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                All locales currently canonicalize to <code>{CANONICAL}/</code>. Add region-specific landing routes before expanding hreflang.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sitemap snapshot */}
        <Card className="glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" /> Indexable routes</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2">Path</th>
                  <th className="py-2">Title</th>
                  <th className="py-2 text-right">Priority</th>
                </tr>
              </thead>
              <tbody>
                {ROUTES.map((r) => (
                  <tr key={r.path} className="border-b border-border/40">
                    <td className="py-2">
                      <Link to={r.path as never} className="text-primary hover:underline font-mono">{r.path}</Link>
                    </td>
                    <td className="py-2 text-muted-foreground">{r.title}</td>
                    <td className="py-2 text-right font-mono">{r.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex gap-4 text-xs">
              <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> /sitemap.xml
              </a>
              <a href="/robots.txt" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> /robots.txt
              </a>
            </div>
          </CardContent>
        </Card>

        <footer className="text-xs text-muted-foreground pt-6 border-t border-border">
          Marketing cockpit is <code>noindex,nofollow</code>. © 2024–2026 Aura Lift Essentials LLC™ · Ryan Puddy, Web3 Architect.
        </footer>
      </div>
    </div>
  );
}
