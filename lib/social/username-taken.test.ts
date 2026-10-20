import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { remoteSignUp, remoteUpdateProfile } from "./remote";
import { TAKEN_USERNAME, ilikeExact, usernameTakenMessage } from "./username-taken";

const signupInput = {
  email: "ada@example.com",
  password: "secret1",
  username: "Wax_Room",
  displayName: "Ada",
};

const profilePatch = {
  username: "taken_name",
  displayName: "Ada",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
};

function client(options: {
  rows?: { id: string }[];
  lookupError?: { message: string } | null;
  signUpError?: { message: string; code?: string } | null;
  session?: object | null;
  user?: { id: string } | null;
  storedSession?: object | null;
  profileError?: { message: string; code?: string } | null;
}) {
  const ilike: string[] = [];
  let signUps = 0;
  const supabase = {
    from() {
      const api = {
        select() {
          return api;
        },
        ilike(_column: string, value: string) {
          ilike.push(value);
          return api;
        },
        limit() {
          return Promise.resolve({
            data: options.lookupError ? null : (options.rows ?? []),
            error: options.lookupError ?? null,
          });
        },
        upsert() {
          return Promise.resolve({ error: options.profileError ?? null });
        },
        update() {
          return api;
        },
        eq() {
          return Promise.resolve({ error: options.profileError ?? null });
        },
      };
      return api;
    },
    auth: {
      async signUp() {
        signUps += 1;
        return {
          data: {
            session: options.session === undefined ? { access_token: "t" } : options.session,
            user: options.user === undefined ? { id: "user-1" } : options.user,
          },
          error: options.signUpError ?? null,
        };
      },
      async getSession() {
        return { data: { session: options.storedSession ?? null } };
      },
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    ilike: () => ilike,
    signUps: () => signUps,
  };
}

describe("usernameTakenMessage", () => {
  it("maps a unique violation and the auth trigger failure", () => {
    assert.equal(usernameTakenMessage({ code: "23505", message: "duplicate key" }), TAKEN_USERNAME);
    assert.equal(
      usernameTakenMessage({ message: "Database error saving new user" }),
      TAKEN_USERNAME,
    );
    assert.equal(usernameTakenMessage({ code: "42501", message: "permission denied" }), null);
  });

  it("escapes ilike wildcards so the lookup is an exact handle", () => {
    assert.equal(ilikeExact("wax_room"), "wax\\_room");
    assert.equal(ilikeExact("100%"), "100\\%");
  });
});

describe("remoteSignUp taken usernames", () => {
  it("rejects a case-insensitive match before auth.signUp", async () => {
    const fake = client({ rows: [{ id: "other" }] });
    const result = await remoteSignUp(fake.supabase, signupInput);
    assert.equal(result.error, TAKEN_USERNAME);
    assert.deepEqual(fake.ilike(), ["wax\\_room"]);
    assert.equal(fake.signUps(), 0);
  });

  it("turns a 23505 and a trigger failure into the taken message", async () => {
    const unique = client({
      signUpError: { code: "23505", message: "duplicate key value" },
    });
    assert.equal((await remoteSignUp(unique.supabase, signupInput)).error, TAKEN_USERNAME);

    const trigger = client({
      signUpError: { message: "Database error saving new user" },
    });
    assert.equal((await remoteSignUp(trigger.supabase, signupInput)).error, TAKEN_USERNAME);

    const profile = client({
      profileError: { code: "23505", message: "duplicate key value" },
    });
    assert.equal((await remoteSignUp(profile.supabase, signupInput)).error, TAKEN_USERNAME);
  });

  it("leaves other signup errors alone", async () => {
    const fake = client({ signUpError: { message: "Invalid login credentials" } });
    assert.equal(
      (await remoteSignUp(fake.supabase, signupInput)).error,
      "Invalid login credentials",
    );
  });

  it("returns success when confirm-email is off and a session exists", async () => {
    const created = client({ session: { access_token: "t" } });
    assert.deepEqual(await remoteSignUp(created.supabase, signupInput), {});

    const stored = client({ session: null, storedSession: { access_token: "t" } });
    assert.deepEqual(await remoteSignUp(stored.supabase, signupInput), {});
  });

  it("still asks the user to confirm when signup created no session", async () => {
    const pending = client({ session: null, user: { id: "user-1" } });
    const result = await remoteSignUp(pending.supabase, signupInput);
    assert.equal(result.notice, "Check your email to confirm the account, then log in.");
    assert.equal(result.error, undefined);
  });
});

describe("remoteUpdateProfile taken usernames", () => {
  it("turns a 23505 and the trigger message into the taken message", async () => {
    const unique = client({
      profileError: { code: "23505", message: "duplicate key value" },
    });
    assert.equal(
      (await remoteUpdateProfile(unique.supabase, "user-1", profilePatch)).error,
      TAKEN_USERNAME,
    );

    const trigger = client({
      profileError: { message: "Database error saving new user" },
    });
    assert.equal(
      (await remoteUpdateProfile(trigger.supabase, "user-1", profilePatch)).error,
      TAKEN_USERNAME,
    );
  });

  it("leaves other profile errors alone", async () => {
    const fake = client({ profileError: { message: "permission denied", code: "42501" } });
    assert.equal(
      (await remoteUpdateProfile(fake.supabase, "user-1", profilePatch)).error,
      "permission denied",
    );
  });
});
