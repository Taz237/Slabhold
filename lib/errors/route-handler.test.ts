import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { handleClientError, MAX_BODY_BYTES } from "@/lib/errors/route-handler";
import { createRateLimiter } from "@/lib/errors/report";

const report = {
  kind: "unhandledrejection",
  message: "Load failed for sam@example.com",
  stack: "TypeError: Load failed\n    at a (b.js:1:1)",
  route: "/u/sam",
  version: "abc1234",
  platform: "ios",
};

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://slabhold.app/api/client-error", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": "1.2.3.4", ...headers },
    body,
  });
}

let logged: string[] = [];
const log = (line: string) => void logged.push(line);

beforeEach(() => {
  logged = [];
});
afterEach(() => {
  logged = [];
});

describe("POST /api/client-error", () => {
  it("logs one scrubbed line and answers 204", async () => {
    const limit = createRateLimiter({ perKey: 5, total: 100, windowMs: 60_000 });
    const res = await handleClientError(request(JSON.stringify(report)), { limit, log, serverVersion: "def5678" });
    assert.equal(res.status, 204);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /^\[client-error\] /);
    const entry = JSON.parse(logged[0].replace("[client-error] ", "")) as Record<string, unknown>;
    assert.equal(entry.kind, "unhandledrejection");
    assert.equal(entry.platform, "ios");
    assert.equal(entry.route, "/u/:username");
    assert.equal(entry.version, "abc1234");
    assert.equal(entry.serverVersion, "def5678");
    assert.doesNotMatch(logged[0], /example\.com/);
    assert.doesNotMatch(logged[0], /1\.2\.3\.4/);
  });

  it("drops cross-site posts without logging", async () => {
    const limit = createRateLimiter({ perKey: 5, total: 100, windowMs: 60_000 });
    const res = await handleClientError(
      request(JSON.stringify(report), { "sec-fetch-site": "cross-site", origin: "https://evil.example" }),
      { limit, log },
    );
    assert.equal(res.status, 204);
    assert.equal(logged.length, 0);
  });

  it("rejects bodies that are too big or not a report", async () => {
    const limit = createRateLimiter({ perKey: 5, total: 100, windowMs: 60_000 });
    const big = await handleClientError(request("x".repeat(MAX_BODY_BYTES + 1)), { limit, log });
    assert.equal(big.status, 413);
    const junk = await handleClientError(request("{not json"), { limit, log });
    assert.equal(junk.status, 400);
    const wrong = await handleClientError(request(JSON.stringify({ kind: "nope" })), { limit, log });
    assert.equal(wrong.status, 400);
    assert.equal(logged.length, 0);
  });

  it("rate-limits one sender", async () => {
    const limit = createRateLimiter({ perKey: 2, total: 100, windowMs: 60_000 });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await handleClientError(request(JSON.stringify(report)), { limit, log })).status);
    }
    assert.deepEqual(statuses, [204, 204, 429, 429]);
    assert.equal(logged.length, 2);
  });
});
