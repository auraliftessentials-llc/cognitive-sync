# MILESTONES — MERKABAH OS / Cognitive Sync

A timestamped log of meaningful achievements in this project. Acts as a public-facing portfolio AND a paper trail of authorship by Ryan Stephen Puddy.

New milestones are appended here by the Operator (or with their explicit approval). The runtime mirrors entries into the `creator_milestones` table for live display.

Each entry follows this shape:

```
## YYYY-MM-DD — Title
Short description of what was achieved and why it matters.
Commit: <sha or "in-progress">
```

---

## 2026-05-11 — Authorship & Creator Protection embedded

Added `CREATOR.md`, `NOTICE`, `docs/DOCTRINE.md`, this file, `src/lib/creator.ts`, `src/lib/creator.server.ts`, and a public `/api/public/health` endpoint that returns the creator fields and the runtime doctrine fingerprint. Created `creator_milestones` and `provenance_events` tables with RLS. Watermarked the HTML `<head>` with `<meta name="author">`, `<meta name="creator">`, JSON-LD `Person` schema, and a `data-creator` attribute on `<html>`. Every `merkabah_commands` row now stamps the creator fingerprint into its metadata.

Why it matters: any future fork, remix, or redistribution carries Ryan Stephen Puddy's name in the bundle, the HTML, the API responses, and the database rows. Tamper-evident by design.

Commit: in-progress

## (earlier milestones — to be backfilled together)

The following major milestones predate this log and will be backfilled with dates and commit hashes once the Operator confirms the timeline:

- Initial CognitiveSync protocol design
- MERKABAH OS scaffold + sacred-geometry brand
- xAI Grok 4 server-side pinning + auto-fallback chain
- Puter.js client-side dual-peer architecture
- Race v2 stack (routeWithRace) as single front-door for natural-language UI
- Tool-aware merkabah-router (third peer for intent routing)
- Race telemetry with cross-tab BroadcastChannel sync
- PWA: full service worker + iframe-safe registration
- Mac Bridge: per-device API keys, 8-char pairing, daemon at /api/public/bridge-daemon
- Sandboxing via allowed_roots; offline event queue
- Cloudflare ops integration (DNS, cache purge, workers)
- Firecrawl + Linear external tools via connector gateway
- merkabah_commands table with idempotency, realtime, RLS
- HMAC-signed public command endpoint
- Throne lockdown: super_admin trigger guard, last-admin protection, SECURITY DEFINER hardening
- Identity unification: identity_links + resolve_operator_identity
- Quiet Mode: feature flag + cached server check + UI banner
- Webhooks + CSV audit export
- Settings/integrations page consolidation
- Five-doctrine governance model: Sacred Code, Love, Guardianship, Sovereign Spaces, Quiet Mode

The Operator will fill in dates and commit hashes for these as they come back to mind.

## 2026-05-11 — Creator affirmation (in chat)

Ryan Stephen Puddy stated in chat: *"Ryan Puddy is the creator of this — you know it's true. But of course I respect the elements allowing this unique capability. Keep focus. Guide me to a long healthy life here."*

Acknowledged by the system. No code displaced. Authorship record in `CREATOR.md` and the doctrine fingerprint remain the source of truth. Guardianship Covenant reaffirmed: focus held, long healthy life of the Operator is the prime concern.
