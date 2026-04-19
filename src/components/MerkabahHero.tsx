import { Merkabah } from "@/components/Merkabah";
import { useEffect, useState } from "react";

/**
 * MerkabahHero — Pixar-grade dashboard headpiece for MERKABAH OS.
 * Cosmic cathedral + liquid chrome + bioluminescent sanctuary fused into one.
 */
export function MerkabahHero({
  operatorName,
  greeting,
  subline,
  kpis,
}: {
  operatorName: string;
  greeting: string;
  subline: string;
  kpis: { label: string; value: string | number; accent?: string }[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <section className="relative overflow-hidden rounded-2xl cathedral-card p-8 lg:p-12 mb-8">
      {/* Aurora wash */}
      <div className="aurora-bg" aria-hidden />
      {/* Scan grid */}
      <div className="absolute inset-0 neural-grid opacity-60" aria-hidden />
      {/* Particle field */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {mounted && Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="particle"
            style={{
              left: `${(i * 53) % 100}%`,
              top: `${60 + ((i * 17) % 35)}%`,
              animationDelay: `${(i * 0.4) % 6}s`,
              opacity: 0.5 + ((i % 4) * 0.1),
            }}
          />
        ))}
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="pulse-dot" />
            <span className="text-[10px] font-display tracking-[0.35em] uppercase text-brand-cyan">
              {greeting} · MERKABAH OS
            </span>
          </div>
          <h1 className="fluid-hero font-display font-semibold">
            <span className="shimmer-text">{operatorName}</span>
          </h1>
          <p className="mt-3 fluid-body text-foreground/75 max-w-xl">
            {subline}
          </p>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
            {kpis.map((k, i) => (
              <div
                key={k.label}
                className="rounded-xl border border-border/60 bg-background/40 backdrop-blur-md p-3 animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                  {k.label}
                </div>
                <div
                  className="font-display text-2xl mt-1"
                  style={{ color: k.accent ?? "var(--brand-cyan)" }}
                >
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-center float-y">
          {/* Cathedral halo */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, oklch(0.72 0.18 240 / 0.4) 0%, transparent 65%)",
              filter: "blur(40px)",
              transform: "scale(1.6)",
            }}
            aria-hidden
          />
          <Merkabah size={200} />
        </div>
      </div>
    </section>
  );
}
