import { createFileRoute } from "@tanstack/react-router";
import { ConnectorStatusPanel } from "@/components/ConnectorStatusPanel";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Global Status — MERKABAH OS" },
      { name: "description", content: "Live global connector status, uptime trends and exportable reports for MERKABAH OS." },
      { property: "og:title", content: "Global Status — MERKABAH OS" },
      { property: "og:description", content: "Live global connector status, uptime trends and exportable reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-widest uppercase">Global Status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live connector health, auto-refreshed every 30 seconds. Drill into any row for detail, or export a report.
        </p>
      </header>
      <ConnectorStatusPanel />
      <footer className="pt-6 text-[11px] text-muted-foreground border-t border-border/40">
        © 2024–2026 Aura Lift Essentials LLC™ · Made &amp; created by Ryan Puddy, Web3 Architect ·{" "}
        <a className="underline" href="/LICENSE">LICENSE</a> ·{" "}
        <a className="underline" href="/TRADEMARKS.md">TRADEMARKS</a> · Aura Lift Essentials™ is a trademark of Aura Lift Essentials LLC™.
      </footer>
    </main>
  );
}
