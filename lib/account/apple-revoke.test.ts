import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  APPLE_REVOKE_URL,
  CLIENT_SECRET_TTL_SECONDS,
  appleClientSecret,
  appleRevokeConfig,
  appleRevokeConfigProblems,
  revokeAppleToken,
} from "./apple-revoke";

/** A throwaway P-256 key made for this test run. Never a real key. */
const { privateKey: testKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = testKey.export({ format: "pem", type: "pkcs8" }).toString();
const full = {
  APPLE_TEAM_ID: "TEAM000000",
  APPLE_KEY_ID: "KEY0000000",
  APPLE_CLIENT_ID: "app.example.web",
  APPLE_PRIVATE_KEY: pem,
};

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("appleRevokeConfig", () => {
  it("reads all four values", () => {
    const config = appleRevokeConfig(full);
    assert.ok(config);
    assert.equal(config.teamId, "TEAM000000");
    assert.equal(config.keyId, "KEY0000000");
    assert.equal(config.clientId, "app.example.web");
    assert.equal(config.privateKey.asymmetricKeyType, "ec");
  });

  for (const name of Object.keys(full) as (keyof typeof full)[]) {
    it(`is off when ${name} is missing or blank`, () => {
      assert.equal(appleRevokeConfig({ ...full, [name]: undefined }), null);
      assert.equal(appleRevokeConfig({ ...full, [name]: "   " }), null);
    });
  }

  it("is off with no env, a junk key, or a non-EC key", () => {
    assert.equal(appleRevokeConfig({}), null);
    assert.equal(appleRevokeConfig({ ...full, APPLE_PRIVATE_KEY: "not a key" }), null);
    const { privateKey } = generateKeyPairSync("ed25519");
    const other = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    assert.equal(appleRevokeConfig({ ...full, APPLE_PRIVATE_KEY: other }), null);
  });

  it('accepts the .p8 on one line with literal "\\n", and with quotes', () => {
    const oneLine = pem.trim().replace(/\n/g, "\\n");
    assert.ok(appleRevokeConfig({ ...full, APPLE_PRIVATE_KEY: oneLine }));
    assert.ok(appleRevokeConfig({ ...full, APPLE_PRIVATE_KEY: `"${oneLine}"` }));
  });

  it("never falls back to the push key or its key id", () => {
    const apns = { APNS_KEY_ID: "PUSHKEY000", APNS_TEAM_ID: "TEAM000000", APNS_BUNDLE_ID: "app.example", APNS_PRIVATE_KEY: pem };
    assert.equal(appleRevokeConfig(apns), null);
    assert.doesNotMatch(readFileSync(join(process.cwd(), "lib/account/apple-revoke.ts"), "utf8"), /APNS_/);
  });

  it("names what's wrong by setting name only, never a value", () => {
    assert.deepEqual(appleRevokeConfigProblems(full), []);
    assert.deepEqual(appleRevokeConfigProblems({}), [
      "APPLE_TEAM_ID missing",
      "APPLE_KEY_ID missing",
      "APPLE_CLIENT_ID missing",
      "APPLE_PRIVATE_KEY missing",
    ]);
    const problems = appleRevokeConfigProblems({ ...full, APPLE_KEY_ID: "", APPLE_PRIVATE_KEY: "super-secret-junk" });
    assert.deepEqual(problems, ["APPLE_KEY_ID missing", "APPLE_PRIVATE_KEY is not a valid .p8 key"]);
    assert.doesNotMatch(problems.join(" "), /super-secret-junk|TEAM000000|app\.example/);
  });
});

describe("appleClientSecret", () => {
  const config = appleRevokeConfig(full)!;
  const nowMs = 1_800_000_000_000;
  const jwt = appleClientSecret(config, nowMs);
  const [header, claims, signature] = jwt.split(".");

  it("has the ES256 header with the key id", () => {
    assert.deepEqual(decode(header), { alg: "ES256", kid: "KEY0000000" });
  });

  it("has Apple's claims and a short life", () => {
    const iat = Math.floor(nowMs / 1000);
    assert.deepEqual(decode(claims), {
      iss: "TEAM000000",
      iat,
      exp: iat + CLIENT_SECRET_TTL_SECONDS,
      aud: "https://appleid.apple.com",
      sub: "app.example.web",
    });
    assert.ok(CLIENT_SECRET_TTL_SECONDS >= 60 && CLIENT_SECRET_TTL_SECONDS <= 15 * 60, "minutes, not months");
  });

  it("is signed by the key (raw r||s, 64 bytes)", () => {
    const raw = Buffer.from(signature, "base64url");
    assert.equal(raw.length, 64);
    const ok = verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: createPublicKey(testKey), dsaEncoding: "ieee-p1363" },
      raw,
    );
    assert.equal(ok, true);
  });
});

describe("revokeAppleToken", () => {
  type Call = { url: string; init: RequestInit };
  function fakeFetch(reply: () => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return reply();
    }) as typeof fetch;
    return { calls, fetcher };
  }
  function logs() {
    const lines: string[] = [];
    return { lines, log: (...args: unknown[]) => void lines.push(args.map(String).join(" ")) };
  }

  it("does not call Apple when it isn't set up", async () => {
    const { calls, fetcher } = fakeFetch(() => new Response(null, { status: 200 }));
    const { lines, log } = logs();
    const result = await revokeAppleToken(
      { token: "tok-fixture", tokenTypeHint: "refresh_token" },
      { env: { ...full, APPLE_KEY_ID: undefined }, fetch: fetcher, log },
    );
    assert.deepEqual(result, { revoked: false, reason: "unconfigured" });
    assert.equal(calls.length, 0);
    assert.match(lines.join("\n"), /APPLE_KEY_ID missing/);
  });

  it("posts the form Apple wants and treats 200 as revoked", async () => {
    const { calls, fetcher } = fakeFetch(() => new Response(null, { status: 200 }));
    const { lines, log } = logs();
    const result = await revokeAppleToken(
      { token: "tok-fixture", tokenTypeHint: "refresh_token" },
      { env: full, fetch: fetcher, log, now: () => 1_800_000_000_000 },
    );
    assert.deepEqual(result, { revoked: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, APPLE_REVOKE_URL);
    assert.equal(APPLE_REVOKE_URL, "https://appleid.apple.com/auth/revoke");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(new Headers(calls[0].init.headers).get("content-type"), "application/x-www-form-urlencoded");
    assert.ok(calls[0].init.signal, "has a timeout");
    const form = new URLSearchParams(String(calls[0].init.body));
    assert.deepEqual([...form.keys()].sort(), ["client_id", "client_secret", "token", "token_type_hint"]);
    assert.equal(form.get("client_id"), "app.example.web");
    assert.equal(form.get("token"), "tok-fixture");
    assert.equal(form.get("token_type_hint"), "refresh_token");
    const secret = form.get("client_secret")!;
    // client_id is the same Services ID as the JWT's sub.
    assert.equal(decode(secret.split(".")[1]).sub, form.get("client_id"));
    // The log has the outcome only.
    assert.doesNotMatch(lines.join("\n"), /tok-fixture|PRIVATE KEY/);
    assert.ok(!lines.join("\n").includes(secret));
  });

  it("passes the access_token hint through", async () => {
    const { calls, fetcher } = fakeFetch(() => new Response(null, { status: 200 }));
    await revokeAppleToken({ token: "tok-fixture", tokenTypeHint: "access_token" }, { env: full, fetch: fetcher, log() {} });
    assert.equal(new URLSearchParams(String(calls[0].init.body)).get("token_type_hint"), "access_token");
  });

  it("is not revoked on a non-200, and logs the status only", async () => {
    const { fetcher } = fakeFetch(() => new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 }));
    const { lines, log } = logs();
    const result = await revokeAppleToken(
      { token: "tok-fixture", tokenTypeHint: "refresh_token" },
      { env: full, fetch: fetcher, log },
    );
    assert.deepEqual(result, { revoked: false, reason: "http", status: 400 });
    assert.match(lines.join("\n"), /400/);
    assert.doesNotMatch(lines.join("\n"), /tok-fixture/);
  });

  it("is not revoked on a network error or a timeout, and never throws", async () => {
    const { fetcher } = fakeFetch(() => {
      throw new Error("socket hang up tok-fixture");
    });
    const { lines, log } = logs();
    const result = await revokeAppleToken(
      { token: "tok-fixture", tokenTypeHint: "refresh_token" },
      { env: full, fetch: fetcher, log },
    );
    assert.deepEqual(result, { revoked: false, reason: "network" });
    assert.doesNotMatch(lines.join("\n"), /tok-fixture/);
  });

  it("is not revoked for an empty token, without calling Apple", async () => {
    const { calls, fetcher } = fakeFetch(() => new Response(null, { status: 200 }));
    const result = await revokeAppleToken({ token: "  ", tokenTypeHint: "refresh_token" }, { env: full, fetch: fetcher, log() {} });
    assert.deepEqual(result, { revoked: false, reason: "no-token" });
    assert.equal(calls.length, 0);
  });
});
