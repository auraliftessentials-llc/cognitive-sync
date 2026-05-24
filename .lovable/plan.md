
# Bulletproof Plan — Sync Everything, Lock It Down

This MERKABAH OS repo stays your single Lovable-synced repo (hub). All RYANPUDDY GitHub repos stay as separate repos (spokes) but are fully indexed, monitored, and surfaced inside MERKABAH OS. No code is physically merged — that would break their existing deploys and history. Instead, MERKABAH OS becomes the cockpit.

---

## Phase 1 — Project Library (the cockpit)

Extend the existing `projects` table + `/github` page into a real Project Library.

1. **Schema additions** to `public.projects`:
   - `category` enum: `master_os_omega` | `grokify` | `oralift` | `agent_systems` | `reference` | `archive`
   - `revenue_status` enum: `live` | `ready_to_launch` | `in_build` | `idea` | `paused`
   - `priority` int (1–5, for "focus to make money now" ranking)
   - `github_full_name` text (e.g. `RYANPUDDY/master-os-omega`)
   - `github_private` bool
   - `last_synced_at` timestamptz
   - `stars`, `open_issues`, `default_branch`, `last_commit_at`, `language`, `description_remote` — cached from GitHub API
   - `notes` text (your private strategy notes per project)
   - RLS: super_admin only (your eyes only — Throne lockdown applies)

2. **Server fn `syncGitHubLibrary`** (`src/lib/github-library.functions.ts`)
   - Uses existing `GITHUB_TOKEN` secret
   - Lists all repos under `RYANPUDDY` (public + private)
   - Upserts each into `projects` with cached metadata
   - Auto-tags category from repo name (heuristic) then you correct via UI
   - Returns diff: new / updated / archived

3. **`/library` route** (new, super_admin only) — the cockpit:
   - 4 columns grouped by category: **Master OS Omega · Grokify · Oralift · Agent Systems**
   - Each card: name, private/public badge, last commit, stars, revenue_status pill, priority stars, "Open on GitHub" + "Edit notes"
   - Top bar: "Sync now" button → calls `syncGitHubLibrary`
   - "Reference" section below for `nexu-io/open-design` and any other inspiration repos

4. **"Money Focus" panel** on `/library` and `/dashboard`:
   - Filters projects where `revenue_status IN ('live','ready_to_launch')`
   - Sorted by priority desc
   - Each row: next concrete action you set, last-touched date
   - This is your "what do I focus on TODAY to make money" view

---

## Phase 2 — Anthropic Admin Key (additive, secure)

- Add **new** secret `ANTHROPIC_ADMIN_KEY` via `secrets--add_secret` (you paste the *fresh, rotated* key in the secure form — never in chat).
- Existing `ANTHROPIC_API_KEY` untouched (Sacred Code rule).
- Thin server helper `src/lib/anthropic-admin.functions.ts` — super_admin only, used for org/workspace/usage/billing admin calls. Not wired into the brain race; pure ops surface.
- Surface basic usage/org info on a new `/settings/anthropic-admin` panel (read-only first; we add actions later when you ask).

---

## Phase 3 — Privacy Lockdown Checklist (you click, I document)

I cannot flip GitHub repo visibility for you — GitHub doesn't let third-party apps do that. So `/library` will include a **Privacy Audit panel** that:
- Shows every RYANPUDDY repo with current public/private status (from GitHub API).
- Red-flags every public repo with a one-click deep-link to that repo's `Settings → Change visibility → Private`.
- Tracks status: once a repo flips private, the audit goes green.

For the published Lovable site (`neural-guide-sync.lovable.app`):
- Private publish needs Business/Enterprise plan. Two real options I'll surface as buttons:
  - **Unpublish now** (kills the public URL until you republish)
  - **Upgrade plan** (link to billing)
- You decide; no auto-action.

---

## Phase 4 — nexu-io/open-design

Treated as **reference only** in `/library` under Reference. I will NOT copy code from it (license unverified, likely viral). If a specific pattern from that commit is useful, you point at it and I'll clean-room implement inside MERKABAH OS.

---

## What I will NOT do
- Delete or refactor any existing code (Sacred Code).
- Copy `nexu-io/open-design` source into the repo.
- Flip publish visibility, rotate keys, or change GitHub repo visibility autonomously.
- Touch anything outside the additive surfaces listed above.

---

## Technical summary (for the record)
- Migration: extend `public.projects` + enums + indexes; RLS = super_admin only.
- New server fns: `syncGitHubLibrary`, `setProjectMeta`, `getLibraryOverview`, `getAnthropicOrgInfo`.
- New routes: `/library`, `/settings/anthropic-admin` (both under `_authenticated`, gated by `has_role('super_admin')`).
- New secret: `ANTHROPIC_ADMIN_KEY` (requires you to enter the rotated value in the secure form).
- Reuses existing `GITHUB_TOKEN`, existing throne lockdown, existing brain stack.

---

## Sequence when you approve
1. Run migration (Phase 1 schema).
2. Build `syncGitHubLibrary` + `/library` page.
3. Trigger first sync — you'll see every RYANPUDDY repo appear.
4. You tag categories + revenue_status + priorities in the UI (5 min).
5. Add `ANTHROPIC_ADMIN_KEY` secret + admin panel.
6. Privacy Audit panel goes live with your one-click privacy links.

Approve and I switch to build mode and execute in this exact order.
