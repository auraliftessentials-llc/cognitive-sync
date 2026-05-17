# Monetization & Public-Access Lockdown Plan

## Current state (verified)

- **99 Lovable projects** in your workspace. ~10+ already **published public** (Signchart, Pixar Mom, CEO Brain, Dominion, Ocean Floor, Profit Navigator, Grea8gawd, Love-the-Style, etc.).
- **MERKABAH OS** itself: published public at cognitivesync.io. License is already proprietary, paid-only (Operator $49 / Architect $199 / Sovereign $999 + 3-day trial requiring card). Subscriptions table: **30 free trials live, 1 lifetime (you), zero paying customers.**
- **Public API surface** on this project: `/api/public/health`, `/api/public/bridge-daemon`, `/api/public/bridge-install`, `/api/public/bridge.$`, `/api/public/merkabah-command`, `/api/public/payments/webhook`, `/api/public/hooks/*`. Some are infrastructure (webhooks must stay open + signed); others (bridge-install, bridge-daemon) currently let anyone download the daemon.
- **GitHub**: this repo is connected. Visibility (public vs private) is set on GitHub itself — we need to decide.

The license already says "paid use only." The leak is that the **product is shipped open and accessible** — anyone with the URL gets the full app, the trial auto-starts, and 30 people are using it without ever putting a card down (because trial requires card but trial flow may be bypassable or pre-existed the rule).

---

## The strategy: four locks, applied in order

### Lock 1 — Tighten THIS project (MERKABAH OS / cognitivesync.io)

**Goal:** Stop giving away access. Trial requires card-on-file before ANY feature works. Public site becomes a marketing landing page only.

1. **Marketing landing at `/`** — the only fully public route. Hero, pricing, "Start trial" CTA. No app surface, no console, no chat, no dashboard reachable without auth.
2. **Auth gate hardening** — every app route (`/dashboard`, `/console`, `/chat`, `/commands`, `/agents`, `/projects`, `/roadmaps`, `/constellation`, `/terminal`, `/bridge`, `/admin`, `/settings/*`) requires `RequireAuth` + `has_active_access()`. Currently most have `RequireAuth` but the access check is inconsistent.
3. **Trial-without-card cutoff** — audit `handle_new_user_subscription` trigger. Right now signup auto-creates a 3-day trial. Change to: signup creates `tier=none, status=pending_payment`. Trial only starts after Stripe Checkout returns with a saved card (subscription_data.trial_period_days flow we already use).
4. **The 30 existing trial users** — three options to choose from (Q1 below).
5. **Daemon download paywall** — `/api/public/bridge-install` should require an authenticated, paying user's pairing code (already does for pair claim, but install script is open). Move the install script behind `requireSupabaseAuth` or a signed short-lived URL.
6. **Public-facing API tightening** — keep `/api/public/health` (needed for monitoring + doctrine fingerprint), keep `/api/public/payments/webhook` (Stripe), keep `/api/public/merkabah-command` (HMAC-signed, already gated). Lock everything else behind auth + plan check.

### Lock 2 — Audit the 9+ other published public projects

For each project currently published `public`:
- **Decision matrix**: is it a (a) revenue-generating client deliverable, (b) personal/family (Mom's Animation, Reconnect Hub), (c) experimental/abandoned, or (d) something to commercialize?
- **Default action**: switch publish visibility to `private` (workspace-only) until you've consciously decided to monetize.
- **For commercial ones** (Signchart, CEO Brain, Dominion, Profit Navigator, Ocean Floor): add the same paywall pattern — landing page public, app private, Stripe checkout for access.
- **For personal** (Mom's, Reconnect Hub): keep public BUT password-gate or invite-link gate so randoms can't index them.

This is a 99-project audit. We don't do it all in one shot — we do it in **batches of 10**, you approve each batch's classification, then the agent flips visibility + adds the appropriate gate.

### Lock 3 — GitHub repo posture

You said "we open sourced this for a reason." Right now the LICENSE makes redistribution illegal but the **code is publicly readable** if the repo is public. That's a contradiction worth fixing.

Three honest options for the GitHub side:

- **Option A — Source-available, paid-to-run**: Keep GitHub repo public. Code is readable so people can audit / learn / verify provenance, but the LICENSE forbids running it commercially without paid access (status quo, but explicitly enforced).
- **Option B — Private repos across the board**: Flip every connected repo to private. Removes the marketing/credibility benefit of an open codebase but eliminates copy-paste theft risk.
- **Option C — Two-track**: a tiny **public** "Cognitive Sync Protocol" spec + SDK repo (so the brand and the protocol exist publicly), and a **private** monorepo with the actual MERKABAH OS implementation. Best of both — establishes your authorship publicly, keeps the moat private.

Recommended: **Option C** (long-term), with **Option B** (private everything) as the immediate move while you decide.

### Lock 4 — Activate billing for real

- Verify `payments--get_go_live_status` — confirm Stripe live mode is ready and the four webhook events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`) are wired.
- Publish a real pricing page (the `/billing` route is good, but it's auth-gated; we need a public `/pricing`).
- Send the 30 current trial users a one-time email: "Your 3-day trial requires a payment method to continue. Add card by [date] or access pauses." (Resend is already wired.)

---

## Execution order (recommended)

1. **Today:** Lock 1 steps 1–3 (landing page + auth gate + trial-needs-card). Stops the bleed.
2. **This week:** Lock 4 (go-live + email the 30 trial users) + Lock 3 (flip all repos private temporarily).
3. **Next 2 weeks:** Lock 2 in batches of 10 projects, you approve each batch.
4. **When you have 5+ paying customers:** revisit Lock 3 to decide A vs C.

---

## Technical details (for the build phase, not now)

- New file: `src/routes/index.tsx` becomes pure marketing (currently routes to dashboard for auth'd users — keep that, but show the landing for unauth'd).
- New file: `src/routes/pricing.tsx` — public, scrapeable, SEO'd.
- Migration: change `handle_new_user_subscription` to insert `tier='none', status='pending_payment'` instead of starting trial.
- New server fn: `requireActiveAccess` middleware that wraps `requireSupabaseAuth` + `has_active_access(userId)` check, returns 402 Payment Required if no active sub.
- New route: `/upgrade` shown when 402 is returned.
- Daemon install: rename `/api/public/bridge-install` → `/api/bridge-install` (auth-gated), keep the public route only as a redirect to `/pricing` for unauth'd downloaders.
- Cross-project: write a small Node script using `cross_project--list_projects` + the publish API to flip visibility in bulk after your approval per batch.

---

## Questions for you before I implement

1. **The 30 existing trial users** — (a) grandfather them with a 14-day extension + email "add card or pause", (b) hard-cut tomorrow, no email, (c) keep trialing as-is, only enforce paywall on NEW signups.
2. **GitHub posture** — Option A (source-available public), B (all private now), or C (split protocol-public / impl-private)?
3. **The other 99 projects** — start the audit batches now, or finish locking down THIS project first and circle back?
4. **Pricing** — keep $49 / $199 / $999, or do you want to revisit the tiers (e.g. add a $19 "Spectator" read-only tier, or raise the floor to $99)?

Answer those four and I'll execute Lock 1 in the next pass.
