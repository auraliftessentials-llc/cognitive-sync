
# Plan A — Audit, Unify Identity, Link Connectors

Strictly additive. Nothing existing changes behavior. Three sequential phases — I check in after each.

---

## Phase 1 — System Health Audit (read-only, ~1 min)

I run a live scoreboard against the production stack and post results in chat. Zero writes.

| Surface | Check |
|---|---|
| Lovable Cloud | `cloud_status` → ACTIVE_HEALTHY |
| Database | RLS linter, table integrity, function signatures |
| Auth | Email + Google OAuth flows, JWT validity |
| Brain — server | `callBrain` smoke test, Grok 4 + fallback chain |
| Brain — client | Puter SDK warm, primePuter health |
| Race telemetry | Last 50 races: winner distribution, p50/p95 |
| Webhooks | `/settings/integrations` test delivery |
| Mac Bridge | Daemon endpoint reachable, paired devices count |
| CLI | Token validation path, recent runs |
| Public HMAC API | Signature echo round-trip |
| PWA | Manifest + SW registered on cognitivesync.io |
| Connectors | Inventory of linked vs available |

Output: ✅ / ⚠️ / ❌ per row + a one-line remedy for any ⚠️/❌.

**Anything broken gets fixed here before Phase 2.** Fixes are scoped — no schema changes, no auth changes.

---

## Phase 2 — Unified Identity ("one true brain that knows it's me")

The problem: you sign in with multiple emails / Google accounts and the system treats each as a different operator. Fix is additive:

**A. New table: `identity_links`**
- Maps secondary auth.users → primary super_admin user_id
- Columns: `primary_user_id`, `linked_user_id`, `linked_email`, `linked_provider` (google/email), `verified_at`
- RLS: only the primary can read/write their own links

**B. New SECURITY DEFINER function: `resolve_operator_identity(jwt_user_id)`**
- Returns the primary `user_id` no matter which linked account signed in
- Used by all auth middleware so commands/bridges/CLI/webhooks all attribute to the one true Operator

**C. New auth middleware wrapper: `requireOperatorIdentity`**
- Wraps existing `requireSupabaseAuth` — calls `resolve_operator_identity` and replaces `userId` in context with the primary
- Drop-in: existing server functions get the primary user automatically. No call-site changes.

**D. `/settings/identity` page (new route, additive)**
- Shows your primary identity
- "Link another email/Google account" → user signs into the secondary account in a popup, that account is auto-linked to the primary
- Lists all linked accounts with revoke buttons

**E. Backfill (one-time, manual approval)**
- I'll show you a list of every email currently in `auth.users` that looks like yours (matching domain or display name)
- You confirm which to link → I write the rows. No auto-linking without your nod.

**Result:** `merkabah_commands`, `bridge_devices`, `cli_tokens`, `command_webhooks`, `subscriptions` all start surfacing under the primary identity regardless of which email you signed in with. Mac Bridge and CLI tokens issued by any linked account become "yours."

**Safety:** Original `auth.users` rows untouched. RLS policies untouched. If `identity_links` is empty for a user, behavior is identical to today (the function returns the same user_id passed in). Pure no-op until you link something.

---

## Phase 3 — Link Every Connector (one-click OAuth queue)

I queue every gateway-enabled connector in batches. You approve each OAuth popup. Each link adds one env var — no existing code reads them yet, so nothing can break.

**Batch 1 — Communication & calendar (highest leverage)**
Slack · Gmail · Google Calendar · Google Drive · Microsoft Outlook · Microsoft Teams · Microsoft OneDrive · Telegram

**Batch 2 — Productivity**
Google Docs · Google Sheets · Google Slides · Microsoft Word · Microsoft Excel · Microsoft PowerPoint · Microsoft OneNote

**Batch 3 — Work / CRM / Ops**
Asana · HubSpot · Airtable · Ashby · Storyblok · Contentful · WordPress.com

**Batch 4 — Data & infra**
AWS S3 · Snowflake · BigQuery · Databricks

**Batch 5 — Comms / Voice / Intel**
Twilio · Brevo · Fireflies · Granola · Gemini Enterprise · Wiz · Aikido · Attention · Inngest

I'll skip any you wave off. After each batch I confirm count of linked vs available so you see progress.

**Important — connectors are linked, not yet wired into the brain.** That's a separate (Tier B) decision. Today they just become *available* env vars so future commands can use them. Nothing auto-runs.

---

## Deliverable

Live scoreboard in chat after Phase 1, identity unified after Phase 2, full connector inventory after Phase 3. No PDF this round (you have the CEO Bible already). If you want a refreshed PDF after we're done, I'll generate it.

---

## Technical Section

- **Files I'll create:** `src/lib/identity.functions.ts` (link/unlink/list), `src/integrations/supabase/operator-identity-middleware.ts`, `src/routes/settings.identity.tsx`, `src/components/IdentityLinker.tsx`.
- **Migration:** `identity_links` table + `resolve_operator_identity` function. RLS: link is private to its primary owner. Verification: I run linter after migration.
- **Files I will NOT touch in this round:** `src/lib/brain.server.ts`, `src/lib/route-with-race.ts`, `src/lib/merkabah-command.functions.ts`, `src/components/AppShell.tsx`, `public/sw.js`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts` (auto-managed).
- **Connectors:** linked via `standard_connectors--connect`. Each call surfaces an OAuth picker for you to approve. Failure of one connector does not affect others.
- **Rollback:** drop `identity_links` table → behavior identical to today. Unlink any connector from Connectors panel → its env var disappears, no other code path affected.

---

## Order

1. Phase 1 audit (in chat)
2. You approve any fixes found
3. Phase 2 identity migration + UI
4. You backfill-link existing accounts in `/settings/identity`
5. Phase 3 connector queue (your one-click OAuth marathon)
6. Final inventory + summary

Estimated wall time: 10–15 min depending on how fast you click through OAuth.

Hit **Implement plan** when ready, Operator. 🛸
