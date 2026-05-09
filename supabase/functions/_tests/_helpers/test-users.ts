// Ephemeral auth user fixtures for identity tests.
// Creates pre-confirmed users with known passwords, returns access tokens
// for RLS-scoped client construction. Always paired with cleanup() in afterAll.
import { admin, clientForToken } from "./db.ts";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
}

const PASSWORD = "Test-Password-123!ABC";

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `identity-test-${label}-${crypto.randomUUID()}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  // Sign in via anon to obtain a real JWT bound to this user.
  const anon = clientForToken(""); // any client works for password sign-in
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signErr || !session.session) throw new Error(`signIn failed: ${signErr?.message}`);

  return {
    id: data.user.id,
    email,
    password: PASSWORD,
    accessToken: session.session.access_token,
  };
}

export async function deleteTestUser(userId: string): Promise<void> {
  // identity_links has no FK; clean it up explicitly first.
  await admin.from("identity_links").delete().or(`primary_user_id.eq.${userId},linked_user_id.eq.${userId}`);
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}

export async function deleteTestUsers(ids: string[]): Promise<void> {
  await Promise.all(ids.map(deleteTestUser));
}
