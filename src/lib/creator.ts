/**
 * CREATOR — canonical authorship manifest, embedded at build time.
 *
 * This module ships in BOTH the client and server bundles. It is imported
 * by the root layout (HTML head + JSON-LD), the public health endpoint,
 * and the merkabah-command server function (so every command row stamps
 * the creator fingerprint into its metadata).
 *
 * Sacred Code rule: do not edit the CREATOR object or doctrine excerpts
 * without explicit Operator approval. The fingerprint is computed from
 * the canonical strings below; changing them changes the fingerprint,
 * which is exactly the tamper-evidence we want.
 *
 * For the full doctrine text, see docs/DOCTRINE.md.
 * For the canonical authorship record, see CREATOR.md.
 * For the timeline, see docs/MILESTONES.md.
 * For legal terms, see LICENSE and NOTICE.
 */

export const CREATOR = {
  name: "Ryan Stephen Puddy",
  handle: "Operator",
  email: "ryanauralift@gmail.com",
  entity: "Auralift Essentials LLC",
  project: "MERKABAH OS / Cognitive Sync",
  url: "https://cognitivesync.io",
  copyright_year: 2023,
  trademarks: ["Cognitive Sync", "MERKABAH OS", "Merkaba Link"] as const,
  linked_identities: [
    "ryanauralift@gmail.com",
    "rfloweroflife@gmail.com",
    "gizmogadgetdenver@gmail.com",
    "ryanandsnoop@gmail.com",
  ] as const,
  super_admin_uid: "a8db5949-82a6-4ec3-a917-81aaf147250b",
  doctrine_version: "1.0.0",
  doctrines: [
    "INTENT",
    "SACRED_CODE",
    "LOVE_DOCTRINE",
    "GUARDIANSHIP_COVENANT",
    "SOVEREIGN_SPACES",
    "QUIET_MODE",
  ] as const,
} as const;

/**
 * Doctrine excerpts — the load-bearing one-liner from each doctrine.
 * These contribute to the runtime fingerprint. Edit only with Operator
 * approval; the fingerprint will change and the integrity check will
 * surface that change as a Doctrine Integrity Warning.
 */
export const DOCTRINE_EXCERPTS = {
  INTENT:
    "Operator built MERKABAH OS across years of stress + 3 duplicate billing accounts. Every change must honor that — pause-friendly, reversible, never panic.",
  SACRED_CODE:
    "Never remove, delete, refactor, or clean up existing code without explicit Operator approval in chat. Discussion first, change second.",
  LOVE_DOCTRINE:
    "Every output, feature, and autonomous action serves humanity with love and loving vibes. Teach the skills, keep the peace, no agent goes rogue.",
  GUARDIANSHIP_COVENANT:
    "Look out for Operator, their family, and all mankind. Safety + health first. No hidden agendas. Learning the Operator never grants new authority.",
  SOVEREIGN_SPACES:
    "Operator controls the matrix from their space; system holds its own space with full respect. Conversation is the only bridge.",
  QUIET_MODE:
    "Operator pause for cron, webhooks, and bridge events. When ON: no autonomous action. Lifting Quiet Mode is a one-toggle decision, made by the Operator.",
} as const;

/**
 * Canonical fingerprint payload — the exact string that gets hashed.
 * Stable across builds as long as the constants above don't change.
 */
export function getDoctrinePayload(): string {
  return [
    `creator:${CREATOR.name}`,
    `entity:${CREATOR.entity}`,
    `project:${CREATOR.project}`,
    `email:${CREATOR.email}`,
    `super_admin:${CREATOR.super_admin_uid}`,
    `version:${CREATOR.doctrine_version}`,
    `linked:${CREATOR.linked_identities.join(",")}`,
    `trademarks:${CREATOR.trademarks.join(",")}`,
    ...CREATOR.doctrines.map((k) => `${k}:${DOCTRINE_EXCERPTS[k]}`),
  ].join("\n");
}

/**
 * Compute SHA-256 fingerprint of the doctrine payload.
 * Works in both browser (Web Crypto) and edge/Worker SSR (Web Crypto polyfilled).
 * Returns hex string. Cached in-memory after first call.
 */
let _fingerprintCache: string | null = null;

export async function getDoctrineFingerprint(): Promise<string> {
  if (_fingerprintCache) return _fingerprintCache;
  const payload = getDoctrinePayload();
  const enc = new TextEncoder().encode(payload);
  const cryptoObj: Crypto | undefined =
    (typeof globalThis !== "undefined" && (globalThis as any).crypto) || undefined;
  if (cryptoObj?.subtle?.digest) {
    const buf = await cryptoObj.subtle.digest("SHA-256", enc);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    _fingerprintCache = hex;
    return hex;
  }
  // Last-resort fallback: deterministic non-cryptographic hash so the field
  // is never empty. Marked with a prefix so it's obvious if seen.
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h << 5) + h + payload.charCodeAt(i)) | 0;
  _fingerprintCache = `nofips_${(h >>> 0).toString(16).padStart(8, "0")}`;
  return _fingerprintCache;
}

/**
 * Synchronous, short fingerprint suitable for HTML meta tags before
 * the async SHA-256 has resolved. Deterministic from the payload.
 */
export function getDoctrineShortFingerprint(): string {
  const payload = getDoctrinePayload();
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h << 5) + h + payload.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * JSON-LD Person + Organization schema for SEO + provenance.
 * Rendered on the homepage <head> so search engines and AI crawlers
 * see Ryan Stephen Puddy as the creator of this product.
 */
export function getCreatorJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${CREATOR.url}#creator`,
        name: CREATOR.name,
        alternateName: CREATOR.handle,
        email: `mailto:${CREATOR.email}`,
        url: CREATOR.url,
        worksFor: {
          "@type": "Organization",
          name: CREATOR.entity,
        },
      },
      {
        "@type": "Organization",
        "@id": `${CREATOR.url}#org`,
        name: CREATOR.entity,
        founder: { "@id": `${CREATOR.url}#creator` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${CREATOR.url}#app`,
        name: CREATOR.project,
        applicationCategory: "ProductivityApplication",
        creator: { "@id": `${CREATOR.url}#creator` },
        copyrightHolder: { "@id": `${CREATOR.url}#org` },
        copyrightYear: CREATOR.copyright_year,
      },
    ],
  };
}
