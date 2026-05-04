import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal & IP — Cognitive Sync" },
      { name: "description", content: "Cognitive Sync proprietary license, copyright, and trademark notice. © 2023 Ryan Stephen Puddy / Auralift Essentials LLC." },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
        <h1 className="mt-6 text-4xl font-bold tracking-wide uppercase">Legal &amp; IP</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Copyright © 2023 Ryan Stephen Puddy / Auralift Essentials LLC. All rights reserved.
        </p>

        <section className="prose prose-invert mt-10 space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold">Ownership &amp; Authorship</h2>
            <p>
              Cognitive Sync — including the Merkabah OS client, the Cognitive Sync protocol,
              Merkaba Link cross-device sync, the Universal AI Router, the Self-Evolving
              Intelligence Core, the Mac Bridge daemon, the Mission Control dashboard, and all
              associated source code, designs, names, marks, logos, and documentation — is the
              exclusive intellectual property of <strong>Ryan Stephen Puddy</strong> and
              <strong> Auralift Essentials LLC</strong>.
            </p>
            <p>
              Ryan Stephen Puddy is the <strong>sole original author and creator</strong> of the
              Cognitive Sync protocol and ecosystem, first authored in 2023. The names
              "Cognitive Sync", "Merkabah OS", "Merkaba Link", and the spinning Merkaba logo
              are trademarks of Auralift Essentials LLC.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Paid Use Only</h2>
            <p>
              Access to the Software requires either an active paid subscription (Operator,
              Architect, or Sovereign tier) with a valid payment method on file, an active
              3-day free trial that has captured a valid credit or debit card, or explicit
              lifetime access granted in writing by the Licensor.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Central Cluster Mandate</h2>
            <p>
              Every instance of Cognitive Sync must connect to the central Cognitive Sync
              Cluster operated by Auralift Essentials LLC. Self-hosting, mirroring, or
              alternative routing layers are prohibited without a separate written enterprise
              agreement.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Restrictions</h2>
            <p>
              You may not copy, redistribute, sublicense, reverse-engineer, fork, or operate
              competing services. You may not use the Software to train competing AI models
              or routers. You may not remove copyright, trademark, or attribution notices.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Full License</h2>
            <p>
              The complete proprietary license is included with the Software as the file
              <code> LICENSE</code> at the project root.
            </p>
          </div>
        </section>

        <p className="mt-12 text-xs text-muted-foreground">
          Cognitive Sync™ — the new operating layer of the internet.
        </p>
      </div>
    </div>
  );
}
