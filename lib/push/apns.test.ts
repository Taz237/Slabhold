import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createServer } from "node:http2";
import { describe, it } from "node:test";
import { apnsConfig } from "./apns-config";
import {
  APNS_MAX_BYTES,
  APNS_ORIGIN,
  JWT_MAX_AGE_MS,
  apnsBody,
  apnsJwt,
  createApnsSender,
  http2Transport,
  type ApnsReply,
  type ApnsTransport,
} from "./apns";
import { singlePayload, summaryPayload, testPayload, type PushPayload } from "./payload";
import { DM_TTL_SECONDS, SOCIAL_TTL_SECONDS, pushTopic } from "./send";

const T0 = Date.parse("2026-11-06T18:00:00.000Z");
const TOKEN = "ab".repeat(32);
const TOKEN2 = "cd".repeat(32);

/** A throwaway P-256 key made for this test run. Never a real key. */
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const config = apnsConfig({
  APNS_KEY_ID: "KEY1234567",
  APNS_TEAM_ID: "TEAM765432",
  APNS_BUNDLE_ID: "app.example",
  APNS_PRIVATE_KEY: keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
})!;

const actor = { id: "a1", displayName: "Jordan Hale", username: "jordanhale", avatarUrl: null };
const like = singlePayload({ kind: "like", actor, postId: "p1", text: "Prizm Luka", showPreviews: true, badge: 3, ts: 1 });
const dm = singlePayload({ kind: "dm", actor, postId: null, text: "Still have the Wemby?", messageKind: "text", showPreviews: true, badge: 3, ts: 1 });

type Call = { origin: string; path: string; headers: Record<string, string>; body: string };

/** A fake HTTP/2 transport answering queued replies in order (200 when the queue is empty). */
function fakeTransport(answers: (Partial<ApnsReply> | "network")[] = []) {
  const calls: Call[] = [];
  let connects = 0;
  let closes = 0;
  const transport: ApnsTransport = {
    connect(origin) {
      connects += 1;
      return {
        async post(path, headers, body) {
          calls.push({ origin, path, headers, body });
          const answer = answers.shift() ?? { status: 200 };
          if (answer === "network") throw new Error("socket hang up");
          return { status: answer.status ?? 200, reason: answer.reason ?? null, retryAfter: answer.retryAfter ?? null };
        },
        close() {
          closes += 1;
        },
      };
    },
  };
  return { transport, calls, stats: () => ({ connects, closes }) };
}

const noSleep = async () => {};

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("APNs provider token", () => {
  it("is an ES256 JWT with kid, iss and iat that verifies with the public key", () => {
    const jwt = apnsJwt(config, T0);
    const [header, claims, signature] = jwt.split(".");
    assert.deepEqual(decode(header!), { alg: "ES256", kid: "KEY1234567" });
    assert.deepEqual(decode(claims!), { iss: "TEAM765432", iat: Math.floor(T0 / 1000) });
    const raw = Buffer.from(signature!, "base64url");
    assert.equal(raw.length, 64, "IEEE P1363 r||s, not DER");
    assert.ok(
      verify("sha256", Buffer.from(`${header}.${claims}`), { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, raw),
    );
  });

  it("is reused for 40 minutes, then rebuilt", async () => {
    let now = T0;
    const { transport, calls } = fakeTransport();
    const sender = createApnsSender(config, { transport, now: () => now });
    await sender.send([{ id: "d1", token: TOKEN }], like, { sleep: noSleep });
    now += JWT_MAX_AGE_MS - 1000;
    await sender.send([{ id: "d1", token: TOKEN }], like, { sleep: noSleep });
    assert.equal(calls[0]!.headers.authorization, calls[1]!.headers.authorization);
    now += 2000;
    await sender.send([{ id: "d1", token: TOKEN }], like, { sleep: noSleep });
    assert.notEqual(calls[1]!.headers.authorization, calls[2]!.headers.authorization);
  });

  it("is rebuilt once on 403 ExpiredProviderToken", async () => {
    let now = T0;
    const { transport, calls } = fakeTransport([{ status: 403, reason: "ExpiredProviderToken" }, { status: 200 }]);
    const sender = createApnsSender(config, { transport, now: () => (now += 1000) });
    const result = await sender.send([{ id: "d1", token: TOKEN }], like, { sleep: noSleep });
    assert.deepEqual(result, { delivered: ["d1"], gone: [], failed: [] });
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0]!.headers.authorization, calls[1]!.headers.authorization);
  });
});

describe("APNs request", () => {
  it("posts to production with the topic, type, priority, expiry and collapse id", async () => {
    const { transport, calls, stats } = fakeTransport();
    const sender = createApnsSender(config, { transport, now: () => T0 });
    await sender.send([{ id: "d1", token: TOKEN }], like, { sleep: noSleep });
    const [call] = calls;
    assert.equal(call!.origin, APNS_ORIGIN);
    assert.equal(APNS_ORIGIN, "https://api.push.apple.com");
    assert.equal(call!.path, `/3/device/${TOKEN}`);
    assert.match(call!.headers.authorization!, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(call!.headers["apns-topic"], "app.example");
    assert.equal(call!.headers["apns-push-type"], "alert");
    assert.equal(call!.headers["apns-priority"], "5");
    assert.equal(call!.headers["apns-expiration"], String(Math.floor(T0 / 1000) + SOCIAL_TTL_SECONDS));
    assert.equal(call!.headers["apns-collapse-id"], pushTopic(like.tag));
    assert.ok(Buffer.byteLength(call!.headers["apns-collapse-id"]!) <= 64);
    assert.deepEqual(stats(), { connects: 1, closes: 1 });
  });

  it("sends DMs at priority 10 with the DM lifetime", async () => {
    const { transport, calls } = fakeTransport();
    await createApnsSender(config, { transport, now: () => T0 }).send([{ id: "d1", token: TOKEN }], dm, { sleep: noSleep });
    assert.equal(calls[0]!.headers["apns-priority"], "10");
    assert.equal(calls[0]!.headers["apns-expiration"], String(Math.floor(T0 / 1000) + DM_TTL_SECONDS));
  });

  it("uses one connection for a batch and closes it", async () => {
    const { transport, calls, stats } = fakeTransport();
    const result = await createApnsSender(config, { transport, now: () => T0 }).send(
      [
        { id: "d1", token: TOKEN },
        { id: "d2", token: TOKEN2 },
      ],
      like,
      { sleep: noSleep },
    );
    assert.deepEqual(result.delivered.sort(), ["d1", "d2"]);
    assert.equal(calls.length, 2);
    assert.deepEqual(stats(), { connects: 1, closes: 1 });
  });

  it("makes no connection for no devices", async () => {
    const { transport, stats } = fakeTransport();
    const result = await createApnsSender(config, { transport }).send([], like);
    assert.deepEqual(result, { delivered: [], gone: [], failed: [] });
    assert.equal(stats().connects, 0);
  });

  it("sends alert, sound, thread and a same-origin url, and the unread badge", () => {
    const body = JSON.parse(apnsBody(like));
    assert.deepEqual(body, {
      aps: { alert: { title: like.title, body: like.body }, sound: "default", "thread-id": like.tag, badge: 3 },
      url: like.url,
    });
    assert.equal(body.aps.badge, 3);
    const summary = summaryPayload({ kind: "like", lead: actor, names: ["Jordan Hale", "Maya Chen"], count: 3, postId: "p1", badge: 9, ts: 1 });
    assert.equal(JSON.parse(apnsBody(summary)).aps.badge, 9);
    assert.equal(JSON.parse(apnsBody({ ...like, badge: -4 })).aps.badge, 0);
    assert.equal(JSON.parse(apnsBody({ ...like, badge: Number.NaN })).aps.badge, 0);
    const evil: PushPayload = { ...testPayload(1), url: "https://evil.example/x" };
    assert.equal(JSON.parse(apnsBody(evil)).url, "/notifications");
  });

  it("fits a long body under 4 KB", () => {
    const long: PushPayload = { ...like, body: "Prizm ".repeat(2000), title: "T".repeat(3000) };
    const json = apnsBody(long);
    assert.ok(Buffer.byteLength(json) <= APNS_MAX_BYTES);
    assert.ok(JSON.parse(json).aps.alert.body.endsWith("…"));
  });
});

describe("APNs status mapping", () => {
  const send = (answers: Parameters<typeof fakeTransport>[0], sleep: (ms: number) => Promise<void> = noSleep) => {
    const fake = fakeTransport(answers);
    return createApnsSender(config, { transport: fake.transport, now: () => T0 })
      .send([{ id: "d1", token: TOKEN }], like, { sleep })
      .then((result) => ({ result, calls: fake.calls }));
  };

  it("delivers on 200", async () => {
    const { result, calls } = await send([{ status: 200 }]);
    assert.deepEqual(result, { delivered: ["d1"], gone: [], failed: [] });
    assert.equal(calls.length, 1);
  });

  for (const answer of [
    { status: 410, reason: "Unregistered" },
    { status: 400, reason: "BadDeviceToken" },
    { status: 400, reason: "DeviceTokenNotForTopic" },
  ]) {
    it(`marks the device gone on ${answer.status} ${answer.reason}, without retrying`, async () => {
      const { result, calls } = await send([answer]);
      assert.deepEqual(result, { delivered: [], gone: ["d1"], failed: [] });
      assert.equal(calls.length, 1);
    });
  }

  it("fails other 400s without deleting", async () => {
    const { result } = await send([{ status: 400, reason: "BadCollapseId" }]);
    assert.deepEqual(result, { delivered: [], gone: [], failed: ["d1"] });
  });

  for (const reason of ["InvalidProviderToken", "MissingProviderToken"]) {
    it(`fails 403 ${reason} without deleting or retrying`, async () => {
      const { result, calls } = await send([{ status: 403, reason }]);
      assert.deepEqual(result, { delivered: [], gone: [], failed: ["d1"] });
      assert.equal(calls.length, 1);
    });
  }

  it("fails a second ExpiredProviderToken", async () => {
    const { result, calls } = await send([
      { status: 403, reason: "ExpiredProviderToken" },
      { status: 403, reason: "ExpiredProviderToken" },
    ]);
    assert.deepEqual(result.failed, ["d1"]);
    assert.equal(calls.length, 2);
  });

  for (const answer of [{ status: 429 }, { status: 500 }, { status: 503 }, "network" as const]) {
    const label = answer === "network" ? "network" : answer.status;
    it(`retries once after ${label}, then fails`, async () => {
      const waits: number[] = [];
      const { result, calls } = await send([answer, answer], async (ms) => {
        waits.push(ms);
      });
      assert.deepEqual(result.failed, ["d1"]);
      assert.equal(calls.length, 2);
      assert.equal(waits.length, 1);
      assert.ok(waits[0]! > 0 && waits[0]! <= 5000);
    });
  }

  it("honors a small Retry-After and succeeds on the retry", async () => {
    const waits: number[] = [];
    const { result } = await send([{ status: 429, retryAfter: "2" }, { status: 200 }], async (ms) => {
      waits.push(ms);
    });
    assert.deepEqual(result.delivered, ["d1"]);
    assert.deepEqual(waits, [2000]);
  });

  it("resends a shorter body once after 413", async () => {
    const long: PushPayload = { ...like, body: "Pulled a 2018 Prizm Luka silver, centered, sharp corners, thoughts?" };
    const fake = fakeTransport([{ status: 413 }, { status: 413 }]);
    const result = await createApnsSender(config, { transport: fake.transport, now: () => T0 }).send(
      [{ id: "d1", token: TOKEN }],
      long,
      { sleep: noSleep },
    );
    assert.deepEqual(result.failed, ["d1"]);
    assert.equal(fake.calls.length, 2);
    const second = JSON.parse(fake.calls[1]!.body).aps.alert.body as string;
    assert.ok(Array.from(second).length <= 40);
    assert.ok(second.length < long.body.length);
  });

  it("fails every device when the connection can't open", async () => {
    const transport: ApnsTransport = {
      connect() {
        throw new Error("no route");
      },
    };
    const result = await createApnsSender(config, { transport }).send([{ id: "d1", token: TOKEN }], like);
    assert.deepEqual(result, { delivered: [], gone: [], failed: ["d1"] });
  });
});

describe("APNs HTTP/2 transport", () => {
  it("posts over HTTP/2 and reads the status and reason", async () => {
    const seen: { path: string; topic: string; body: string }[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => (body += chunk));
      request.on("end", () => {
        seen.push({ path: String(request.headers[":path"]), topic: String(request.headers["apns-topic"]), body });
        if (request.headers[":path"]!.endsWith(TOKEN2)) {
          response.writeHead(410, { "content-type": "application/json" });
          response.end(JSON.stringify({ reason: "Unregistered" }));
          return;
        }
        response.writeHead(200, { "apns-id": "x" });
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const connection = http2Transport().connect(`http://127.0.0.1:${port}`);
    try {
      const ok = await connection.post(`/3/device/${TOKEN}`, { "apns-topic": "app.example" }, "{}");
      const gone = await connection.post(`/3/device/${TOKEN2}`, { "apns-topic": "app.example" }, "{}");
      assert.deepEqual(ok, { status: 200, reason: null, retryAfter: null });
      assert.deepEqual(gone, { status: 410, reason: "Unregistered", retryAfter: null });
      assert.deepEqual(seen[0], { path: `/3/device/${TOKEN}`, topic: "app.example", body: "{}" });
    } finally {
      connection.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects when the server isn't there", async () => {
    const connection = http2Transport().connect("http://127.0.0.1:1");
    try {
      await assert.rejects(connection.post(`/3/device/${TOKEN}`, {}, "{}"));
    } finally {
      connection.close();
    }
  });
});
