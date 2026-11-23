import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SIGNUP_SOURCE_KEYS, signupSourceMeta } from "./signup-source";

describe("signup source", () => {
  it("is invite when an invite link was opened, with the inviter's handle", () => {
    const meta = signupSourceMeta({
      invite: { username: "maya", code: "0123456789abcdef0123456789abcdef" },
      utm: { utm_source: "tiktok", utm_medium: "social", utm_campaign: "nov" },
      platform: "web",
    });
    assert.deepEqual(meta, {
      signup_source: "invite",
      invite_from: "maya",
      utm_source: "tiktok",
      utm_medium: "social",
      utm_campaign: "nov",
      signup_platform: "web",
    });
  });

  it("is utm with first-touch campaign values and no invite", () => {
    assert.deepEqual(signupSourceMeta({ invite: null, utm: { utm_source: "instagram" }, platform: "ios-app" }), {
      signup_source: "utm",
      utm_source: "instagram",
      signup_platform: "ios-app",
    });
  });

  it("is direct with nothing remembered", () => {
    assert.deepEqual(signupSourceMeta({ invite: null, utm: {}, platform: "web" }), {
      signup_source: "direct",
      signup_platform: "web",
    });
  });

  it("writes no empty keys: no null invite_from, no blank utm", () => {
    const meta = signupSourceMeta({
      invite: null,
      utm: { utm_source: "  ", utm_medium: "", utm_campaign: undefined },
      platform: "web",
    });
    assert.deepEqual(meta, { signup_source: "direct", signup_platform: "web" });
    for (const value of Object.values(meta)) assert.ok(typeof value === "string" && value.length > 0);
    assert.equal("invite_from" in meta, false);
  });

  it("drops a bad inviter handle and trims long campaign values", () => {
    const meta = signupSourceMeta({
      invite: { username: "Not a handle!", code: null },
      utm: { utm_campaign: "x".repeat(300) },
      platform: "web",
    });
    assert.equal(meta.signup_source, "utm");
    assert.equal("invite_from" in meta, false);
    assert.ok((meta.utm_campaign ?? "").length <= 100);
  });

  it("only ever writes the allowed keys: never an IP, email or device id", () => {
    const meta = signupSourceMeta({
      invite: { username: "maya", code: null },
      utm: { utm_source: "a", utm_medium: "b", utm_campaign: "c", email: "x@y.z", ip: "1.2.3.4" } as never,
      platform: "web",
    });
    for (const key of Object.keys(meta)) assert.ok((SIGNUP_SOURCE_KEYS as readonly string[]).includes(key), key);
    assert.deepEqual([...SIGNUP_SOURCE_KEYS].sort(), [
      "invite_from",
      "signup_platform",
      "signup_source",
      "utm_campaign",
      "utm_medium",
      "utm_source",
    ]);
  });
});

describe("signup source is written to auth user metadata", () => {
  async function signUpData(source: unknown) {
    const { remoteSignUp } = await import("@/lib/social/remote");
    const calls: { options?: { data?: Record<string, unknown> } }[] = [];
    const api = {
      select: () => api,
      ilike: () => api,
      limit: () => Promise.resolve({ data: [], error: null }),
      upsert: () => Promise.resolve({ error: null }),
      insert: () => Promise.resolve({ error: null }),
    };
    const supabase = {
      from: () => api,
      auth: {
        async signUp(args: { options?: { data?: Record<string, unknown> } }) {
          calls.push(args);
          return { data: { session: null, user: { id: "user-1" } }, error: null };
        },
        async getSession() {
          return { data: { session: null } };
        },
      },
    };
    await remoteSignUp(supabase as never, {
      email: "ada@example.com",
      password: "secret1",
      username: "ada_cards",
      displayName: "Ada",
      ...(source === undefined ? {} : { source: source as never }),
    });
    return calls[0]?.options?.data;
  }

  it("adds invite, utm or direct next to the handle", async () => {
    const invite = signupSourceMeta({ invite: { username: "maya", code: null }, utm: {}, platform: "web" });
    assert.deepEqual(await signUpData(invite), {
      signup_source: "invite",
      invite_from: "maya",
      signup_platform: "web",
      username: "ada_cards",
      display_name: "Ada",
    });
    const utm = signupSourceMeta({ invite: null, utm: { utm_source: "tiktok" }, platform: "ios-app" });
    assert.equal((await signUpData(utm))?.signup_source, "utm");
    const direct = signupSourceMeta({ invite: null, utm: {}, platform: "web" });
    assert.equal((await signUpData(direct))?.signup_source, "direct");
  });

  it("writes nothing extra with no source, and drops empty or unknown keys", async () => {
    assert.deepEqual(await signUpData(undefined), { username: "ada_cards", display_name: "Ada" });
    assert.deepEqual(
      await signUpData({ signup_source: "", invite_from: null, utm_source: " ", email: "x@y.z", ip: "1.2.3.4" }),
      { username: "ada_cards", display_name: "Ada" },
    );
  });

  it("never lets the source replace the handle or name", async () => {
    const data = await signUpData({ signup_source: "direct", username: "evil", display_name: "Evil" } as never);
    assert.equal(data?.username, "ada_cards");
    assert.equal(data?.display_name, "Ada");
  });

  it("is wired into email signup and the Apple/Google handle step", async () => {
    const { readFileSync } = await import("node:fs");
    const form = readFileSync("components/auth-form.tsx", "utf8");
    assert.match(form, /source: browserSignupSource\(\)/);
    const handle = readFileSync("components/onboarding/handle-setup.tsx", "utf8");
    assert.match(handle, /updateUser\(\{ data: \{ \.\.\.signupSourceData\(browserSignupSource\(\)\)/);
  });
});
