import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { CommandLog } from "@/components/CommandLog";

export const Route = createFileRoute("/commands")({
  head: () => ({
    meta: [
      { title: "Command Log — Merkabah OS" },
      { name: "description", content: "Live realtime log of every Operator command, with Grok 4 race telemetry." },
      { property: "og:title", content: "Command Log — Merkabah OS" },
      { property: "og:description", content: "Every command. Logged. Raced. Auditable." },
    ],
  }),
  component: CommandsPage,
});

function CommandsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="h-[calc(100vh-0px)]">
          <CommandLog />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
