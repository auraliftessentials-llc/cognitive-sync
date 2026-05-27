# Worldwide Marketing Super-Optimization Plan

Goal: make MERKABAH OS / cognitivesync.io maximally discoverable, shareable, and conversion-ready across global markets — without removing or refactoring any existing code (Sacred Code rule honored). Every step is additive.

---

## Phase 1 — SEO Foundation (the floor)

Cannot rank without these. Currently the project likely ships default Lovable metadata.

1. **Per-route `head()` metadata** on every public route (`/`, `/library`, `/login`, marketing routes). Each gets unique:
   - `<title>` < 60 chars, keyword-led
   - `<meta name="description">` < 160 chars
   - `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
   - `twitter:card=summary_large_image`, `twitter:title/description/image`
   - `<link rel="canonical">`
2. **JSON-LD structured data** on root: `Organization` (Aura Lift Essentials LLC, founder Ryan Puddy, logo, sameAs links), `SoftwareApplication` for MERKABAH OS.
3. **Single H1 per page**, semantic HTML audit on landing route.
4. **`public/robots.txt`** — allow all, sitemap directive.
5. **`src/routes/sitemap[.]xml.ts`** — server route enumerating public routes, BASE_URL = `https://cognitivesync.io`.

## Phase 2 — Worldwide Targeting

6. **hreflang tags** in root `head()` for `en`, `en-US`, `en-GB`, `x-default` (expand as markets are picked).
7. **Open Graph image generation** — a branded merkabah hero image at `src/assets/og-merkabah.jpg` (premium imagegen, 1200x630), wired into every route's `og:image`.
8. **PWA manifest polish** — verify `name`, `short_name`, `description`, `categories`, `screenshots[]` (Play Store / iOS install rich preview).
9. **Performance signals** — verify lazy-loading on hero images, `loading="lazy"` on below-fold.

## Phase 3 — Conversion & Tracking Surfaces

10. **New route `/marketing`** (additive, throne-visible) showing:
    - Live SEO score (calls `seo--list_findings` via server fn)
    - GA4 / Plausible status (placeholder until tracking ID added)
    - OG preview cards for each route
    - hreflang coverage map
11. **Analytics hook** — add `<script>` slot in `__root.tsx` `head()` for a future GA4 / Plausible ID (read from `import.meta.env.VITE_ANALYTICS_ID`). No-op when unset.
12. **Footer audit** — confirm Aura Legal Pack footer renders site-wide (© 2024–2026 Aura Lift Essentials LLC™ · Made & created by Ryan Puddy, Web3 Architect · /LICENSE · /TRADEMARKS.md). Add if missing — additive only.

## Phase 4 — Marketing Ops (post-foundation)

13. **Trigger `seo--trigger_scan`** after Phase 1–2 ship, surface findings in `/marketing`.
14. **Semrush connector** — already documented; recommend connecting Operator's Semrush account so `/marketing` can pull live keyword/rank data via the gateway.
15. **Custom domain check** — verify cognitivesync.io is published and primary; share-preview vs Active status.
16. **Press kit route `/press`** — logo downloads, founder bio (Ryan Puddy, Web3 Architect, Founder of Aura Lift Essentials LLC™), boilerplate, contact ryanauralift@gmail.com.

---

## What this plan does NOT do

- No deletion, refactor, or "cleanup" of existing code (Sacred Code).
- No autonomous publish flip, no domain DNS changes, no Semrush connection without your OK.
- No marketing copy is invented for products you haven't briefed me on — Phase 1 metadata uses MERKABAH OS positioning already in memory; product-specific landing pages need your copy.
- No social media auto-posting, no email blasts, no paid ads wired up.

## Sequence

1. Phase 1 (SEO floor) — ~1 build cycle, fully additive.
2. Phase 2 (worldwide targeting + OG image) — ~1 build cycle.
3. Phase 3 (`/marketing` cockpit + analytics hook) — ~1 build cycle.
4. Phase 4 — gated on your approval per item (SEO scan, Semrush connect, press kit copy).

## Decisions I need from you before Phase 1

- **Primary domain to bake into canonical/sitemap**: `cognitivesync.io` (assumed) vs `neural-guide-sync.lovable.app`?
- **Initial target markets** for hreflang beyond `en` / `x-default`? (UK, AU, DE, FR, ES, BR…)
- **Public positioning of MERKABAH OS** — sovereign AI operator platform? AI productivity OS? One-liner you want in the meta description.
- **Are there products beyond MERKABAH OS** you want surfaced for marketing (Grokify, Oralift, Agent Systems from your cockpit categories)? Each gets its own landing route if yes.

Reply with the answers (or "you pick defaults") and I'll execute Phase 1 immediately.
