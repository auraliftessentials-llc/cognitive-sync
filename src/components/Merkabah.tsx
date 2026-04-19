import { useEffect, useRef } from "react";

/**
 * Merkabah — sacred-geometry brand mark.
 * Two interlocking tetrahedra rendered as a counter-rotating star tetrahedron
 * with a luminous blue/cyan core. Pure SVG + CSS, no deps.
 */
export function Merkabah({
  size = 28,
  spin = true,
  className = "",
}: {
  size?: number;
  spin?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  // Use unique ids per instance to avoid SVG defs collisions
  const idRef = useRef(`mk-${Math.random().toString(36).slice(2, 8)}`);
  const id = idRef.current;

  useEffect(() => {
    if (!ref.current) return;
  }, []);

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Outer halo */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.72 0.18 240 / 0.55) 0%, transparent 65%)",
          filter: "blur(6px)",
        }}
      />
      <svg
        ref={ref}
        viewBox="-50 -50 100 100"
        width={size}
        height={size}
        className="relative"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={`${id}-up`} x1="0" y1="-40" x2="0" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="oklch(0.95 0.06 230)" />
            <stop offset="100%" stopColor="oklch(0.55 0.22 250)" />
          </linearGradient>
          <linearGradient id={`${id}-dn`} x1="0" y1="40" x2="0" y2="-40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="oklch(0.85 0.18 200)" />
            <stop offset="100%" stopColor="oklch(0.45 0.2 260)" />
          </linearGradient>
          <radialGradient id={`${id}-core`} cx="0" cy="0" r="20" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="oklch(0.98 0.05 220)" stopOpacity="1" />
            <stop offset="60%" stopColor="oklch(0.7 0.22 240)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="oklch(0.45 0.22 260)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Upward tetrahedron */}
        <g
          style={{
            transformOrigin: "center",
            animation: spin ? "merkabah-spin-cw 14s linear infinite" : undefined,
          }}
        >
          <polygon
            points="0,-42 36,21 -36,21"
            fill="none"
            stroke={`url(#${id}-up)`}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </g>
        {/* Downward tetrahedron */}
        <g
          style={{
            transformOrigin: "center",
            animation: spin ? "merkabah-spin-ccw 14s linear infinite" : undefined,
          }}
        >
          <polygon
            points="0,42 36,-21 -36,-21"
            fill="none"
            stroke={`url(#${id}-dn)`}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </g>

        {/* Luminous core */}
        <circle cx="0" cy="0" r="18" fill={`url(#${id}-core)`} />
        <circle
          cx="0"
          cy="0"
          r="3.2"
          fill="oklch(0.99 0.04 220)"
          style={{ filter: "drop-shadow(0 0 4px oklch(0.85 0.2 230))" }}
        />
      </svg>
    </span>
  );
}
