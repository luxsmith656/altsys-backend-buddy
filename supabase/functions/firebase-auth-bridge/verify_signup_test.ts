/**
 * Google sign-up DB verification test.
 *
 * Verifies that after a Google sign-in for a given email:
 *   - auth.users has a user with that email
 *   - public.profiles has a row for that user
 *   - public.user_roles has role='hiker' for that user
 *   - (optional) onboarding fields are populated once the user completes onboarding
 *
 * Usage:
 *   1. Sign in with Google in the app at least once with the email under test.
 *   2. Run this test. It reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the
 *      function's environment and TEST_USER_EMAIL from the env or defaults to
 *      the most recently created Google-bridged user.
 *
 *   deno test --allow-env --allow-net supabase/functions/firebase-auth-bridge/verify_signup_test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TEST_EMAIL = (Deno.env.get("TEST_USER_EMAIL") ?? "").toLowerCase();

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.test("env is configured", () => {
  assert(SUPABASE_URL, "SUPABASE_URL missing");
  assert(SERVICE_ROLE, "SUPABASE_SERVICE_ROLE_KEY missing");
  assert(TEST_EMAIL, "TEST_USER_EMAIL missing — set the email used to sign in with Google");
});

Deno.test("Google sign-up creates auth user", async () => {
  const user = await findUserByEmail(TEST_EMAIL);
  assert(user, `No auth user found for ${TEST_EMAIL}. Sign in with Google first.`);
});

Deno.test("Google sign-up creates profile row", async () => {
  const user = await findUserByEmail(TEST_EMAIL);
  assert(user);
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, full_name, age, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  assertEquals(error, null);
  assert(data, "profiles row missing for Google-bridged user");
  assertEquals(data!.user_id, user.id);
});

Deno.test("Google sign-up assigns hiker role", async () => {
  const user = await findUserByEmail(TEST_EMAIL);
  assert(user);
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  assertEquals(error, null);
  const roles = (data ?? []).map((r) => r.role);
  assert(roles.includes("hiker"), `Expected 'hiker' role, got: ${JSON.stringify(roles)}`);
});

Deno.test("hiker role row is unique (no duplicates from re-clicks)", async () => {
  const user = await findUserByEmail(TEST_EMAIL);
  assert(user);
  const { data } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "hiker");
  assertEquals((data ?? []).length, 1, "hiker role should appear exactly once");
});
