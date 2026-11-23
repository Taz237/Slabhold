import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { oauthLandingPath, oauthRedirectTo } from "@/lib/auth/oauth";
import {
  APPLE_TOKEN_COOKIE,
  DELETE_API_PATH,
  DELETE_FLOW_MAX_AGE_SECONDS,
  DELETE_PENDING_COOKIE,
  DELETE_RESUME_PATH,
  flowCookieOptions,
  handleAccountDelete,
  isDeleteResume,
  oauthFlowCookies,
  parseAppleToken,
  parsePending,
  type FlowCookie,
} from "./apple-delete-flow";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TOKEN = "tok-fixture.with.dots";

function named(cookies: FlowCookie[], name: string) {
  return cookies.find((cookie) => cookie.name === name);
}
function cleared(cookies: FlowCookie[]) {
  return (
    named(cookies, DELETE_PENDING_COOKIE)?.maxAge === 0 &&
    named(cookies, APPLE_TOKEN_COOKIE)?.maxAge === 0 &&
    named(cookies, APPLE_TOKEN_COOKIE)?.path === DELETE_API_PATH
  );
}

/** One call to the route's logic, with counters. */
function scene(over: Partial<Parameters<typeof handleAccountDelete>[0]> = {}) {
  const calls = { revoke: [] as { token: string; hint: string }[], deletes: 0, order: [] as string[] };
  const input: Parameters<typeof handleAccountDelete>[0] = {
    sessionUserId: USER,
    ready: true,
    body: null,
    apple: true,
    revokeConfigured: true,
    pendingRaw: null,
    tokenRaw: null,
    revoke: async (token, hint) => {
      calls.revoke.push({ token, hint });
      calls.order.push("revoke");
      return { revoked: true };
    },
    runDelete: async () => {
      calls.deletes += 1;
      calls.order.push("delete");
      return { status: 200, body: { ok: true } };
    },
    ...over,
  };
  return { calls, run: () => handleAccountDelete(input) };
}

describe("flow cookies", () => {
  it("are httpOnly, Secure, SameSite=Lax and last minutes", () => {
    const options = flowCookieOptions({ name: "x", value: "y", path: "/", maxAge: DELETE_FLOW_MAX_AGE_SECONDS });
    assert.deepEqual(options, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: DELETE_FLOW_MAX_AGE_SECONDS });
    assert.ok(DELETE_FLOW_MAX_AGE_SECONDS >= 60 && DELETE_FLOW_MAX_AGE_SECONDS <= 15 * 60);
  });

  it("only count for the user they name", () => {
    assert.deepEqual(parsePending(`p.${USER}`, USER), { tried: false });
    assert.deepEqual(parsePending(`t.${USER}`, USER), { tried: true });
    for (const raw of [`p.${OTHER}`, "1", "", null, undefined, USER]) assert.equal(parsePending(raw, USER), null);
    assert.equal(parsePending(`p.${USER}`, null), null);
    assert.deepEqual(parseAppleToken(`r.${USER}.${TOKEN}`, USER), { token: TOKEN, hint: "refresh_token" });
    assert.deepEqual(parseAppleToken(`a.${USER}.${TOKEN}`, USER), { token: TOKEN, hint: "access_token" });
    for (const raw of [`r.${OTHER}.${TOKEN}`, `x.${USER}.${TOKEN}`, `r.${USER}.`, TOKEN, "", null]) {
      assert.equal(parseAppleToken(raw, USER), null);
    }
  });
});

describe("/auth/oauth: the token cookie", () => {
  it("sets nothing on an ordinary sign-in, even with a provider token", () => {
    const cookies = oauthFlowCookies({ pendingRaw: null, userId: USER, session: { provider_refresh_token: TOKEN, provider_token: "x" } });
    assert.deepEqual(cookies, []);
  });

  it("keeps the refresh token when a delete is pending, for the delete route only", () => {
    const cookies = oauthFlowCookies({
      pendingRaw: `p.${USER}`,
      userId: USER,
      session: { provider_refresh_token: TOKEN, provider_token: "access-fixture" },
    });
    assert.equal(cookies.length, 1);
    assert.deepEqual(cookies[0], {
      name: APPLE_TOKEN_COOKIE,
      value: `r.${USER}.${TOKEN}`,
      path: DELETE_API_PATH,
      maxAge: DELETE_FLOW_MAX_AGE_SECONDS,
    });
  });

  it("falls back to the access token", () => {
    const cookies = oauthFlowCookies({ pendingRaw: `p.${USER}`, userId: USER, session: { provider_token: TOKEN } });
    assert.deepEqual(parseAppleToken(cookies[0].value, USER), { token: TOKEN, hint: "access_token" });
  });

  it("with no provider token, marks the delete as tried instead (so it can't loop)", () => {
    const cookies = oauthFlowCookies({ pendingRaw: `p.${USER}`, userId: USER, session: {} });
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, DELETE_PENDING_COOKIE);
    assert.deepEqual(parsePending(cookies[0].value, USER), { tried: true });
    assert.equal(named(cookies, APPLE_TOKEN_COOKIE), undefined);
  });

  it("a different login gets no token cookie and ends the pending delete", () => {
    const cookies = oauthFlowCookies({ pendingRaw: `p.${USER}`, userId: OTHER, session: { provider_refresh_token: TOKEN } });
    assert.ok(cleared(cookies));
    assert.ok(cookies.every((cookie) => !cookie.value.includes(TOKEN)));
  });

  it("the route sets cookies, never a URL, and keeps the handle step off the resume page", () => {
    const route = read("app/auth/oauth/route.ts");
    assert.match(route, /oauthFlowCookies\(/);
    assert.match(route, /response\.cookies\.set\(cookie\.name, cookie\.value, flowCookieOptions\(cookie\)\)/);
    assert.doesNotMatch(route, /searchParams\.set\(|console\./);
    assert.doesNotMatch(route.replace(/oauthFlowCookies\([\s\S]*?\);/, ""), /provider_(refresh_)?token/);
    assert.match(route, /handle && isDeleteResume\(next\) \? null : next/);
  });

  it("the redirect is the plain resume path, with no token in it", () => {
    assert.equal(oauthLandingPath({ next: DELETE_RESUME_PATH, ok: true, needsHandle: false }), DELETE_RESUME_PATH);
    assert.equal(DELETE_RESUME_PATH, "/settings/privacy?delete=resume");
    const back = new URL(oauthRedirectTo("https://slabhold.app", DELETE_RESUME_PATH, true));
    assert.equal(back.searchParams.get("next"), DELETE_RESUME_PATH);
    assert.equal(isDeleteResume("?delete=resume"), true);
    assert.equal(isDeleteResume(DELETE_RESUME_PATH), true);
    for (const not of ["", null, "?delete=1", "/settings/privacy", "?x=delete=resume"]) assert.equal(isDeleteResume(not), false);
  });
});

describe("delete route: revoke is off (today's flow)", () => {
  it("deletes at once and shows the Settings steps for an Apple login", async () => {
    const { calls, run } = scene({ revokeConfigured: false });
    const reply = await run();
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body, { ok: true, apple: true });
    assert.equal(calls.deletes, 1);
    assert.equal(calls.revoke.length, 0);
    assert.ok(cleared(reply.cookies));
  });

  it("leaves a non-Apple delete as it was, set up or not", async () => {
    for (const revokeConfigured of [false, true]) {
      const { calls, run } = scene({ apple: false, revokeConfigured });
      const reply = await run();
      assert.deepEqual(reply.body, { ok: true });
      assert.equal(calls.deletes, 1);
      assert.equal(calls.revoke.length, 0);
    }
  });
});

describe("delete route: revoke is on", () => {
  it("asks for Continue with Apple first and deletes nothing", async () => {
    const { calls, run } = scene();
    const reply = await run();
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body, { needApple: true });
    assert.equal(calls.deletes, 0);
    assert.equal(calls.revoke.length, 0);
    assert.equal(reply.cookies.length, 1);
    assert.deepEqual(reply.cookies[0], {
      name: DELETE_PENDING_COOKIE,
      value: `p.${USER}`,
      path: "/",
      maxAge: DELETE_FLOW_MAX_AGE_SECONDS,
    });
  });

  it("revokes first, then deletes, and skips the Settings steps on a 200", async () => {
    const { calls, run } = scene({ body: { resume: true }, pendingRaw: `p.${USER}`, tokenRaw: `r.${USER}.${TOKEN}` });
    const reply = await run();
    assert.deepEqual(reply.body, { ok: true });
    assert.ok(!("apple" in reply.body));
    assert.deepEqual(calls.order, ["revoke", "delete"]);
    assert.deepEqual(calls.revoke, [{ token: TOKEN, hint: "refresh_token" }]);
    assert.ok(cleared(reply.cookies));
  });

  it("uses the access_token hint for an access token", async () => {
    const { calls, run } = scene({ pendingRaw: `p.${USER}`, tokenRaw: `a.${USER}.${TOKEN}` });
    await run();
    assert.deepEqual(calls.revoke, [{ token: TOKEN, hint: "access_token" }]);
  });

  it("still deletes when Apple says no, errors or throws, and keeps the Settings steps", async () => {
    const failures = [
      async () => ({ revoked: false }),
      async () => {
        throw new Error("boom");
      },
    ];
    for (const revoke of failures) {
      const { calls, run } = scene({ pendingRaw: `p.${USER}`, tokenRaw: `r.${USER}.${TOKEN}`, revoke });
      const reply = await run();
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.body, { ok: true, apple: true });
      assert.equal(calls.deletes, 1);
      assert.ok(cleared(reply.cookies));
    }
  });

  it("still deletes when Apple came back with no token (tried), with the Settings steps", async () => {
    const { calls, run } = scene({ body: { resume: true }, pendingRaw: `t.${USER}` });
    const reply = await run();
    assert.deepEqual(reply.body, { ok: true, apple: true });
    assert.equal(calls.deletes, 1);
    assert.equal(calls.revoke.length, 0);
  });

  it("a cancelled Apple login does not delete: the automatic call without a token is refused", async () => {
    const { calls, run } = scene({ body: { resume: true }, pendingRaw: `p.${USER}` });
    const reply = await run();
    assert.equal(reply.status, 409);
    assert.match(reply.body.error ?? "", /not deleted/);
    assert.equal(calls.deletes, 0);
    assert.ok(cleared(reply.cookies));
  });

  it("after a cancel, typing DELETE again asks for Apple again", async () => {
    const { calls, run } = scene({ pendingRaw: `p.${USER}` });
    assert.deepEqual((await run()).body, { needApple: true });
    assert.equal(calls.deletes, 0);
  });

  it("ignores another user's cookies", async () => {
    const { calls, run } = scene({ pendingRaw: `t.${OTHER}`, tokenRaw: `r.${OTHER}.${TOKEN}` });
    assert.deepEqual((await run()).body, { needApple: true });
    assert.equal(calls.deletes, 0);
    assert.equal(calls.revoke.length, 0);
  });
});

describe("delete route: the automatic call can't delete by itself", () => {
  it("is refused with no pending cookie, for any login", async () => {
    for (const over of [{ apple: false }, { revokeConfigured: false }, { pendingRaw: `p.${OTHER}` }, {}]) {
      const { calls, run } = scene({ body: { resume: true }, ...over });
      const reply = await run();
      assert.equal(reply.status, 409);
      assert.equal(calls.deletes, 0);
    }
  });

  it("only the literal resume flag counts, and no user id is read from the body", async () => {
    const { calls, run } = scene({ apple: false, body: { resume: "true", userId: OTHER } });
    assert.deepEqual((await run()).body, { ok: true });
    assert.equal(calls.deletes, 1);
    // The body is read in one place, for the resume flag only.
    const uses = read("lib/account/apple-delete-flow.ts").match(/input\.body[^\n]*/g) ?? [];
    assert.deepEqual(uses, ["input.body as { resume?: unknown } | null)?.resume === true;"]);
  });
});

describe("delete route: signed out or failing", () => {
  it("passes the 401 through and sets no pending cookie", async () => {
    const { run } = scene({ sessionUserId: null, runDelete: async () => ({ status: 401, body: { error: "You need to be signed in." } }) });
    const reply = await run();
    assert.equal(reply.status, 401);
    assert.ok(cleared(reply.cookies));
  });

  it("a failed delete never says apple, and clears the cookies", async () => {
    const { run } = scene({
      pendingRaw: `p.${USER}`,
      tokenRaw: `r.${USER}.${TOKEN}`,
      revoke: async () => ({ revoked: false }),
      runDelete: async () => ({ status: 500, body: { error: "Couldn't finish deleting your account. Try again." } }),
    });
    const reply = await run();
    assert.equal(reply.status, 500);
    assert.ok(!("apple" in reply.body));
    assert.ok(cleared(reply.cookies));
  });
});

describe("the route file", () => {
  const route = read("app/api/account/delete/route.ts");

  it("reads the Apple login before the user is deleted", () => {
    assert.match(route, /usedAppleSignIn\(/);
    assert.ok(route.indexOf("getUserById(") < route.indexOf("runAccountDelete("), "looked up before the user is gone");
  });

  it("takes the user id from the session and sets the cookies the handler returns", () => {
    assert.match(route, /sessionUserId = await getAuthUserId\(\)/);
    assert.match(route, /runAccountDelete\(\{\s*sessionUserId,/);
    assert.match(route, /response\.cookies\.set\(cookie\.name, cookie\.value, flowCookieOptions\(cookie\)\)/);
    assert.match(route, /revokeAppleToken\(\{ token, tokenTypeHint \}\)/);
    assert.doesNotMatch(route, /console\.[a-z]+\([^)]*(token|cookie)/i);
  });
});
