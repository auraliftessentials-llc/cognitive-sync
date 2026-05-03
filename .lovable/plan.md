
# Migrate to Your Own Supabase — Zero Downtime

## Goal
Move the entire app off Lovable Cloud (`cldgrtzmlykoeahxkhuq`) onto your own Supabase project (`bjchgcrbapeeuzzaereh`) without breaking anything currently in production: bridge devices stay paired, agents keep running, scheduled jobs keep firing, users stay signed in.

## Why this needs a careful plan
The current backend is not trivial. It has:
- **22 tables** with full RLS (workspaces, agents, agent_runs, agent_tool_calls, conversations, messages, bridge_devices, bridge_audit, cli_tokens, cli_schedules, cli_schedule_runs, cron_heartbeat, audit_log, profiles, projects, suggestions, user_roles, workspace_members, workspace_invites, zoho_connections, brain_health, feature_flags, user_feature_overrides, user_notices, key_rotations)
- **2 custom enums** (`app_role`, `workspace_role`)
- **12 SECURITY DEFINER functions** (has_role, has_workspace_role, claim_bridge_pairing, find_bridge_device, find_cli_token_user, claim_schedule, etc.) — these power RLS, bridge auth, and the scheduler
- **Auth users** with passwords, OAuth identities, sessions, and JWTs already issued
- **One edge function** (`agent-stream`) plus all the secrets it reads
- **Live paired bridge devices** holding API keys whose hashes are in `bridge_devices.api_key_hash`

If we just swap the URL, everything breaks: schemas missing, RLS empty, users signed out, paired Macs stop talking to the server, scheduler dies.

---

## What "zero downtime" actually means here
True zero-downtime cutover for a stateful auth+DB system isn't free — there's always a brief moment when writes have to stop so the final delta can copy without races. Realistically we can hit:
- **~30-60 seconds** of read-only mode during the final cutover
- **No data loss**
- **Users stay signed in** (auth migrated with passwords + OAuth identities preserved)
- **Paired bridge devices keep working** (api_key_hash rows preserved → daemons just keep heartbeating)
- **Scheduler keeps firing** (cli_schedules + lock_until preserved)

If you want literal 0 ms of downtime, that requires dual-writes for hours/days and is significantly more code. I'd recommend the ~60s approach — same outcome, far less risk.

---

## The plan (5 phases)

### Phase 1 — Prep your new Supabase (no risk to current app)

1. You hand me the credentials of `bjchgcrbapeeuzzaereh` as secrets:
   - `MIGRATION_TARGET_SUPABASE_URL` = `https://bjchgcrbapeeuzzaereh.supabase.co`
   - `MIGRATION_TARGET_SUPABASE_PUBLISHABLE_KEY` (the `anon` / `publishable` key)
   - `MIGRATION_TARGET_SUPABASE_SERVICE_ROLE_KEY` (the `service_role` key — DO NOT paste this in chat, only via the secret tool)
   - `MIGRATION_TARGET_SUPABASE_DB_URL` (the direct Postgres connection string, found in Supabase → Settings → Database → Connection string → URI)

2. I write a single SQL bootstrap migration containing:
   - All 2 enums
   - All 22 table DDLs (with defaults, constraints)
   - All 12 functions (security definer, search_path locked)
   - All RLS policies, exact bytes-for-bytes copies
   - All indexes
   - The `handle_new_user` and `handle_new_user_workspace` triggers on `auth.users`

3. I run that SQL against `bjchgcrbapeeuzzaereh` only — Lovable Cloud untouched.

4. Verification: run a structural diff (table count, column count, policy count, function count) between the two projects. Fix any drift.

### Phase 2 — Pre-seed the new project with all current data

5. Bulk-copy every public-schema table from old → new using `pg_dump --data-only --table=public.X | psql` for each table, in dependency order (workspaces first, then workspace_members, then everything that references them).

6. Copy `auth.users`, `auth.identities`, `auth.sessions`, and `auth.refresh_tokens` using Supabase's documented auth migration approach (encrypted_password column copies fine across projects on the same Supabase platform; OAuth identity rows copy fine too — JWTs stay valid because the JWT secret can be set to match).

7. **Critical:** copy the JWT signing secret from old → new project (Supabase → Settings → API → JWT Secret). This is what keeps existing user sessions valid after cutover. Without this step every user is signed out.

8. Re-create every secret the edge functions and server functions need, inside the new project's Vault: `OPENAI_API_KEY`, `XAI_API_KEY`, `XAI_API_KEY_2`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `LOVABLE_API_KEY`, `RESEND_API_KEY`, `ELEVENLABS_API_KEY`, `PERPLEXITY_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GITHUB_TOKEN`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`.

9. Deploy the `agent-stream` edge function to the new project.

### Phase 3 — Dry-run validation (still no risk to prod)

10. I temporarily wire a `secondary` Supabase client at `src/integrations/supabase/secondary.ts` pointing at the new project (this is dead code until we flip the switch).

11. Add a hidden `/admin/migration-check` route that runs side-by-side queries: "old has N bridge_devices, new has N bridge_devices", "old has N agents, new has N agents", etc. across every table. Must be 100% match before we proceed.

12. Smoke-test on the new project (using the secondary client manually): sign in a test user, fire one agent run, send one bridge heartbeat — confirm everything works end-to-end without touching prod.

### Phase 4 — The cutover (this is the ~60s window)

13. **Pause writes:** flip a `feature_flag` named `read_only_mode = true`. Server functions check this and return a friendly "syncing, try again in a moment" error for any mutation.

14. **Final delta sync:** copy any rows that changed in the last few minutes (timestamp-based diff on every `created_at`/`updated_at` column).

15. **Swap env vars:** update Lovable's `VITE_SUPABASE_URL`, `SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_DB_URL`, `SUPABASE_JWKS` to the new project's values.

16. **Republish.** Edge runtime picks up new env. App now talks to `bjchgcrbapeeuzzaereh`.

17. **Lift read-only mode:** flip `read_only_mode = false` (this write goes to the NEW project).

18. Bridge devices: their next heartbeat (within 5-300s based on adaptive backoff) hits the new endpoint. Because their `api_key_hash` rows were copied, `find_bridge_device` matches and they keep working. They never even know.

### Phase 5 — Verify and decommission

19. Watch `brain_health`, `bridge_audit`, `agent_runs`, `cron_heartbeat` in the new project for 24h. Real activity should appear.

20. Confirm scheduler is firing (look for new `cli_schedule_runs` rows on the cron schedule).

21. Once stable: leave Lovable Cloud sitting there as a frozen backup for a week. Don't delete it. After the week, you can disable it from Lovable's Connectors page if you want.

---

## Technical specifics

**Why the JWT secret must be copied:** Supabase signs every user's session token with `JWT_SECRET`. When the app calls the new project, the new project verifies the bearer token using its own `JWT_SECRET`. If they don't match → instant signout for everyone. Copying the secret keeps every existing session valid. Supabase officially supports this for project migrations.

**Why bridge devices keep working:** The pairing flow stores `sha256(api_key)` in `bridge_devices.api_key_hash`. The daemon sends the raw key on every heartbeat. As long as the hash row exists in the new DB, the lookup in `find_bridge_device` succeeds. No re-pairing required.

**Why we don't lose CLI sessions:** Same story — `cli_tokens.token_hash` rows copy over, `find_cli_token_user` works as-is.

**The one thing that will need attention:** the `agent-stream` edge function URL pattern. Edge function URLs are scoped to the project ref, so `https://cldgrtzmlykoeahxkhuq.supabase.co/functions/v1/agent-stream` becomes `https://bjchgcrbapeeuzzaereh.supabase.co/functions/v1/agent-stream`. The auto-generated `client.ts` handles this via env, but anywhere we hardcoded the old URL needs updating. (Quick search of the codebase says there's no hardcoded reference, just env-based.)

**Schema lock during migration:** I'll set the new project's DB to refuse DDL from anything except the migration script during the copy, so nothing accidentally drifts.

**Rollback plan:** if anything goes wrong after the env swap, swap them back. Lovable Cloud is still there with all data up to the read-only flip. You'd lose only the writes that happened in the new project during the broken window (which we'll have logged).

---

## What I need from you to start

A single multi-select reply on which phases to do now. Phase 1 is safe to run today with zero risk to prod (it just sets up the empty schema in the new project). Phase 4 is the only phase that touches your live app, and I won't run it without explicit "go" from you in the moment.

Once you approve this plan I'll start with Phase 1 and check in after each phase before moving on.
