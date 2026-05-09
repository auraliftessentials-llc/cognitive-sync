// Layer 3 — Round-trip integration: link → resolve → unlink → resolve.
// Exercises the same code path the server functions use (admin client + RPC),
// guaranteeing the headline contract: any linked email = same primary id;
// after unlink, the account resolves back to itself.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { admin } from "./_helpers/db.ts";
import { createTestUser, deleteTestUsers, TestUser } from "./_helpers/test-users.ts";

let primary: TestUser;
let secondary: TestUser;

async function setup() {
  [primary, secondary] = await Promise.all([
    createTestUser("rt-primary"),
    createTestUser("rt-secondary"),
  ]);
}

async function teardown() {
  await deleteTestUsers([primary.id, secondary.id]);
}

async function resolve(uid: string): Promise<string> {
  const { data, error } = await admin.rpc("resolve_operator_identity", { _user_id: uid });
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

Deno.test("identity round-trip", async (t) => {
  await setup();
  try {
    await t.step("before linking: secondary resolves to itself", async () => {
      assertEquals(await resolve(secondary.id), secondary.id);
    });

    await t.step("link secondary → primary", async () => {
      const { error } = await admin.from("identity_links").insert({
        primary_user_id: primary.id,
        linked_user_id: secondary.id,
        linked_email: secondary.email,
        linked_provider: "email",
      });
      assertEquals(error, null);
    });

    await t.step("after link: secondary resolves to primary", async () => {
      assertEquals(await resolve(secondary.id), primary.id);
    });

    await t.step("re-linking same pair fails (unique constraint preserved)", async () => {
      const { error } = await admin.from("identity_links").insert({
        primary_user_id: primary.id,
        linked_user_id: secondary.id,
        linked_email: secondary.email,
        linked_provider: "email",
      });
      assert(error, "duplicate link insert must fail");
    });

    await t.step("unlink", async () => {
      const { error } = await admin.from("identity_links").delete().eq("linked_user_id", secondary.id);
      assertEquals(error, null);
    });

    await t.step("after unlink: secondary resolves to itself again", async () => {
      assertEquals(await resolve(secondary.id), secondary.id);
    });

    await t.step("primary always resolves to itself throughout", async () => {
      assertEquals(await resolve(primary.id), primary.id);
    });
  } finally {
    await teardown();
  }
});
