## Goal

Lock in the "one true brain" guarantee with automated tests so every linked email always resolves to the same primary `user_id` — and any regression that breaks RLS or identity resolution fails the build before it ships.

## What gets tested

Three layers, each covering a different failure mode:

### 1. SQL contract tests (pgTAP-style, run via Deno test against the live DB)
Target: `public.resolve_operator_identity()` + `identity_links` RLS.

- `resolve_operator_identity(unlinked_user)` returns the same id (idempotent for unlinked users).
- `resolve_operator_identity(linked_user)` returns the **primary**, never the linked id.
- `resolve_operator_identity(primary_user)` returns the primary unchanged.
- Multiple linked accounts → all resolve to the same single primary (no fan-out, no duplicates).
- Function is `STABLE SECURITY DEFINER` with `search_path=public` (introspect `pg_proc`) — guards against the recent linter findings.

### 2. RLS policy tests (Deno test, two anon clients with different JWTs)
Target: `identity_links` table policies + cross-user data leak prevention.

- Owner (primary) can `SELECT` / `INSERT` / `DELETE` their own link rows.
- Linked user can `SELECT` the row pointing at them but **cannot** `INSERT` or `DELETE`.
- A third unrelated user gets zero rows on `SELECT *` and is rejected on `INSERT` with `primary_user_id = other_user`.
- `UPDATE` is denied for everyone (no policy exists — verify it stays that way).
- Negative test: confirm an attacker cannot escalate by inserting `(primary_user_id = victim, linked_user_id = attacker)` — RLS `WITH CHECK` blocks it.

### 3. Server-function integration tests (Deno test hitting `/api/...` server fns)
Target: `listIdentityLinks`, `linkAccountAsAdmin`, `unlinkAccount` from `src/lib/identity.functions.ts`.

- Signing in as **any linked email** returns the **same** `primary.id` from `listIdentityLinks` — this is the headline assertion.
- `listLinkableAccounts` returns 403 for non-super_admin.
- `linkAccountAsAdmin` rejects self-link and rejects non-admin callers.
- After link → resolve → unlink, the linked user resolves back to themselves (round-trip safety).
- Idempotency: re-linking the same pair fails cleanly (unique constraint), does not corrupt state.

## Where the tests live

```
supabase/functions/_tests/
  identity-resolve.test.ts      ← SQL contract (layer 1)
  identity-rls.test.ts          ← RLS policy (layer 2)
  identity-serverfn.test.ts     ← Server function (layer 3)
  _helpers/
    test-users.ts               ← creates/cleans 3 ephemeral auth users
    db.ts                       ← service-role + per-user anon client factories
```

Run via `supabase--test_edge_functions` (Deno + `--allow-net --allow-env`). Same harness already used by the project — no new tooling.

## Test fixtures (auto-managed, no leakage)

Each test file uses `beforeAll`/`afterAll` to:
1. Create three ephemeral users via `auth.admin.createUser` with random emails (`identity-test-{uuid}@example.invalid`).
2. Designate user A = primary, user B = linked, user C = unrelated.
3. Insert `identity_links(A, B)` row directly via service role.
4. On teardown: delete all three users (cascades clean up `identity_links`, `profiles`, `subscriptions`).

No production data touched, no super_admin role granted to test users (admin-only paths use service-role client to bypass auth and assert the *function-level* check, not RLS).

## CI integration

- Add a `test:identity` script entry that calls the Deno test runner on `supabase/functions/_tests/identity-*.test.ts`.
- Document in `mem://features/identity-tests` so future agents know to extend these tests when touching `identity_links`, `resolve_operator_identity`, or any auth middleware.

## Files created

- `supabase/functions/_tests/identity-resolve.test.ts`
- `supabase/functions/_tests/identity-rls.test.ts`
- `supabase/functions/_tests/identity-serverfn.test.ts`
- `supabase/functions/_tests/_helpers/test-users.ts`
- `supabase/functions/_tests/_helpers/db.ts`
- `mem://features/identity-tests` (memory entry)

## Files NOT touched

- `src/lib/identity.functions.ts` — already correct, tests pin its behavior.
- `supabase/migrations/*` — no schema changes.
- `src/integrations/supabase/auth-middleware.ts` — out of scope for this round (separate plan if you want to wrap it with `requireOperatorIdentity`).

## Rollback

Tests are pure additions under `supabase/functions/_tests/`. Delete the folder → identical to today. Zero runtime impact on the app.

## Estimated wall time

~8–12 min. No migrations, no OAuth, no UI — just three test files and helpers, then one green run via the test tool to confirm.

## Open question

After tests are green, do you want me to also add the `requireOperatorIdentity` middleware (the wrapper that makes `auth.uid()` from any linked account behave as the primary in server-fn `context.userId`)? That's the piece that actually *uses* `resolve_operator_identity` in production paths — these tests prove the function works, but middleware adoption is what makes "any sign-in = same brain" real across the app. I'd recommend a follow-up plan for that, not bundling it here.