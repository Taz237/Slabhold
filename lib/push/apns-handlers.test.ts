import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  APNS_UNAVAILABLE,
  handleApnsRegister,
  handleApnsRemove,
  isMissingTable,
  parseApnsToken,
  type ApnsDeviceWriter,
} from "./apns-handlers";
import { UNAVAILABLE } from "./handlers";

const ME = "11111111-1111-4111-8111-111111111111";
const TOKEN = "AB".repeat(32);

function fakeWriter(result: { error: string | null; missingTable?: boolean } = { error: null }) {
  const calls: { op: string; userId: string; token: string }[] = [];
  const writer: ApnsDeviceWriter = {
    async upsert(userId, token) {
      calls.push({ op: "upsert", userId, token });
      return result;
    },
    async remove(userId, token) {
      calls.push({ op: "remove", userId, token });
      return result;
    },
  };
  return { writer, calls };
}

describe("APNs token", () => {
  it("accepts 64 to 200 hex characters and lowercases them", () => {
    assert.equal(parseApnsToken({ token: TOKEN }), TOKEN.toLowerCase());
    assert.equal(parseApnsToken({ token: ` ${"a".repeat(200)} ` }), "a".repeat(200));
  });

  for (const token of ["a".repeat(63), "a".repeat(201), "g".repeat(64), `${"a".repeat(64)}/x`, "", 42, null]) {
    it(`rejects ${JSON.stringify(token)?.slice(0, 20)}`, () => {
      assert.equal(parseApnsToken({ token }), null);
    });
  }

  it("rejects a missing body", () => {
    assert.equal(parseApnsToken(null), null);
    assert.equal(parseApnsToken("token"), null);
  });
});

describe("POST and DELETE /api/push/apns", () => {
  it("answers 503 with the web routes' unavailable body when APNs is off", async () => {
    const { writer, calls } = fakeWriter();
    for (const handle of [handleApnsRegister, handleApnsRemove]) {
      const off = await handle({ available: false, userId: ME, body: { token: TOKEN }, writer });
      assert.equal(off.status, 503);
      assert.deepEqual(off.body, UNAVAILABLE.body);
      const noWriter = await handle({ available: true, userId: ME, body: { token: TOKEN }, writer: null });
      assert.deepEqual(noWriter, APNS_UNAVAILABLE);
    }
    assert.equal(calls.length, 0);
  });

  it("needs a signed-in caller", async () => {
    const { writer, calls } = fakeWriter();
    assert.equal((await handleApnsRegister({ available: true, userId: null, body: { token: TOKEN }, writer })).status, 401);
    assert.equal((await handleApnsRemove({ available: true, userId: null, body: { token: TOKEN }, writer })).status, 401);
    assert.equal(calls.length, 0);
  });

  it("rejects a bad token before any write", async () => {
    const { writer, calls } = fakeWriter();
    assert.equal((await handleApnsRegister({ available: true, userId: ME, body: { token: "nope" }, writer })).status, 400);
    assert.equal((await handleApnsRemove({ available: true, userId: ME, body: {}, writer })).status, 400);
    assert.equal(calls.length, 0);
  });

  it("saves the lowercased token for the caller, never an id from the body", async () => {
    const { writer, calls } = fakeWriter();
    const result = await handleApnsRegister({
      available: true,
      userId: ME,
      body: { token: TOKEN, userId: "33333333-3333-4333-8333-333333333333", user_id: "x" },
      writer,
    });
    assert.deepEqual(result, { status: 200, body: { ok: true, available: true } });
    assert.deepEqual(calls, [{ op: "upsert", userId: ME, token: TOKEN.toLowerCase() }]);
  });

  it("removes only the caller's row", async () => {
    const { writer, calls } = fakeWriter();
    const result = await handleApnsRemove({ available: true, userId: ME, body: { token: TOKEN }, writer });
    assert.deepEqual(result, { status: 200, body: { ok: true } });
    assert.deepEqual(calls, [{ op: "remove", userId: ME, token: TOKEN.toLowerCase() }]);
  });

  it("reads a missing table as off (503), and other errors as 500", async () => {
    const missing = fakeWriter({ error: "relation does not exist", missingTable: true });
    assert.deepEqual(await handleApnsRegister({ available: true, userId: ME, body: { token: TOKEN }, writer: missing.writer }), APNS_UNAVAILABLE);
    const broken = fakeWriter({ error: "boom" });
    assert.equal((await handleApnsRegister({ available: true, userId: ME, body: { token: TOKEN }, writer: broken.writer })).status, 500);
    assert.equal((await handleApnsRemove({ available: true, userId: ME, body: { token: TOKEN }, writer: broken.writer })).status, 500);
  });

  it("knows a missing table when it sees one", () => {
    assert.equal(isMissingTable({ code: "42P01", message: "" }), true);
    assert.equal(isMissingTable({ code: "PGRST205", message: "" }), true);
    assert.equal(isMissingTable({ code: null, message: 'relation "public.push_apns_devices" does not exist' }), true);
    assert.equal(isMissingTable({ code: "23505", message: "duplicate key" }), false);
    assert.equal(isMissingTable(null), false);
  });
});

describe("/api/push/apns wiring", () => {
  const source = readFileSync(new URL("../../app/api/push/apns/route.ts", import.meta.url), "utf8");
  const body = (name: string) => {
    const start = source.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf("\n}\n", start));
  };

  it("runs on Node and answers GET with available only, never cached", () => {
    assert.match(source, /export const runtime = "nodejs";/);
    const get = body("GET");
    assert.match(get, /apnsConfigured\(\) && \(await tableReady\(\)\)/);
    assert.match(get, /Response\.json\(\{ available \}, \{ headers: \{ "Cache-Control": "no-store" \} \}\)/);
    assert.doesNotMatch(get, /crossSiteRejection/);
  });

  for (const name of ["POST", "DELETE"]) {
    it(`${name}: off first, then the origin check, then auth from the request`, () => {
      const handler = body(name);
      const off = handler.indexOf("if (!apnsConfigured()) return reply(APNS_UNAVAILABLE);");
      const origin = handler.indexOf("crossSiteRejection(request)");
      const auth = handler.indexOf("requestUserId(request)");
      assert.ok(off >= 0 && origin > off && auth > origin);
    });
  }

  it("never logs a token", () => {
    assert.doesNotMatch(source, /console\./);
  });
});
