// Layer 2 — RLS policy tests for identity_links.
// Confirms cross-user data isolation and that escalation inserts are blocked.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { admin, clientForToken } from "./_helpers/db.ts";
import { createTestUser, deleteTestUsers, TestUser } from "./_helpers/test-users.ts";

let primary: TestUser;
let linked: TestUser;
let attacker: TestUser;

async function setup() {
  [primary, linked, attacker] = await Promise.all([
    createTestUser("rls-primary"),
    createTestUser("rls-linked"),
    createTestUser("rls-attacker"),
  ]);
  const { error } = await admin.from("identity_links").insert({
    primary_user_id: primary.id,
    linked_user_id: linked.id,
    linked_email: linked.email,
    linked_provider: "email",
  });
  if (error) throw new Error(`seed: ${error.message}`);
}

async function teardown() {
  await deleteTestUsers([primary.id, linked.id, attacker.id]);
}

Deno.test("identity_links RLS", async (t) => {
  await setup();
  try {
    const asPrimary = clientForToken(primary.accessToken);
    const asLinked = clientForToken(linked.accessToken);
    const asAttacker = clientForToken(attacker.accessToken);

    await t.step("primary can SELECT own link", async () => {
      const { data, error } = await asPrimary.from("identity_links").select("*").eq("primary_user_id", primary.id);
      assertEquals(error, null);
      assertEquals(data?.length, 1);
    });

    await t.step("linked user can SELECT row pointing at them", async () => {
      const { data, error } = await asLinked.from("identity_links").select("*").eq("linked_user_id", linked.id);
      assertEquals(error, null);
      assertEquals(data?.length, 1);
    });

    await t.step("attacker sees zero rows", async () => {
      const { data, error } = await asAttacker.from("identity_links").select("*");
      assertEquals(error, null);
      assertEquals(data?.length, 0);
    });

    await t.step("attacker cannot INSERT a link claiming victim as primary", async () => {
      const { error } = await asAttacker.from("identity_links").insert({
        primary_user_id: primary.id, // forging victim
        linked_user_id: attacker.id,
        linked_email: attacker.email,
        linked_provider: "email",
      });
      assert(error, "RLS WITH CHECK should reject this insert");
    });

    await t.step("linked user cannot DELETE the link", async () => {
      const { error } = await asLinked.from("identity_links").delete().eq("linked_user_id", linked.id);
      // Either explicit error OR silent zero rows affected; verify row still present.
      const { data } = await admin.from("identity_links").select("id").eq("linked_user_id", linked.id);
      assertEquals(data?.length, 1, `link must still exist (delete error: ${error?.message ?? "none"})`);
    });

    await t.step("UPDATE is denied for everyone (no policy exists)", async () => {
      const { error } = await asPrimary.from("identity_links").update({ linked_email: "hacked@x.com" }).eq("linked_user_id", linked.id);
      const { data } = await admin.from("identity_links").select("linked_email").eq("linked_user_id", linked.id).single();
      assertEquals(data?.linked_email, linked.email, `UPDATE must be blocked (error: ${error?.message ?? "none"})`);
    });

    await t.step("primary CAN delete own link", async () => {
      const { error } = await asPrimary.from("identity_links").delete().eq("linked_user_id", linked.id);
      assertEquals(error, null);
      const { data } = await admin.from("identity_links").select("id").eq("linked_user_id", linked.id);
      assertEquals(data?.length, 0);
    });
  } finally {
    await teardown();
  }
});
