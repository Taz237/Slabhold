import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MESSAGE,
  MAX_STACK_LINES,
  createRateLimiter,
  normalizeRoute,
  parseClientErrorReport,
  scrubText,
  shortStack,
} from "@/lib/errors/report";

describe("scrubText", () => {
  it("removes emails, tokens and query strings", () => {
    const out = scrubText(
      "Failed for sam@example.com at https://slabhold.app/cards/1?access_token=abc#x with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlc2ln and Bearer sk_live_12345",
    );
    assert.doesNotMatch(out, /sam@example\.com/);
    assert.doesNotMatch(out, /access_token/);
    assert.doesNotMatch(out, /eyJhbGci/);
    assert.doesNotMatch(out, /sk_live_12345/);
    assert.match(out, /\[email\]/);
    assert.match(out, /https:\/\/slabhold\.app\/cards\/1/);
    assert.match(out, /\[token\]/);
  });

  it("hides long secret-looking runs and long quoted text", () => {
    const out = scrubText(
      `key a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4 said "just pulled a gold refractor out of a blaster today"`,
    );
    assert.doesNotMatch(out, /a1b2c3d4e5f6/);
    assert.doesNotMatch(out, /gold refractor/);
    assert.match(out, /"\[text\]"/);
  });

  it("keeps short ordinary messages and caps the length", () => {
    assert.equal(scrubText("Cannot read properties of undefined (reading 'id')"), "Cannot read properties of undefined (reading 'id')");
    assert.equal(scrubText("card ".repeat(MAX_MESSAGE)).length, MAX_MESSAGE);
  });
});

describe("shortStack", () => {
  it("keeps the top frames only, scrubbed", () => {
    const stack = ["TypeError: boom", ...Array.from({ length: 20 }, (_, i) => `    at f${i} (https://slabhold.app/_next/static/chunks/a.js?v=secret:1:${i})`)].join("\n");
    const out = shortStack(stack);
    assert.ok(out);
    assert.equal(out.split("\n").length, MAX_STACK_LINES);
    assert.doesNotMatch(out, /secret/);
  });

  it("is null without a stack", () => {
    assert.equal(shortStack(undefined), null);
    assert.equal(shortStack(""), null);
  });
});

describe("normalizeRoute", () => {
  it("keeps the path, drops the query and hides ids and handles", () => {
    assert.equal(normalizeRoute("/cards/3f2b1c9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f?ref=x"), "/cards/:id");
    assert.equal(normalizeRoute("/u/sam/followers"), "/u/:username/followers");
    assert.equal(normalizeRoute("/i/sam"), "/i/:username");
    assert.equal(normalizeRoute("/posts/42#reply"), "/posts/:id");
    assert.equal(normalizeRoute("https://slabhold.app/collection?tab=pc"), "/collection");
    assert.equal(normalizeRoute(""), "/");
  });
});

describe("parseClientErrorReport", () => {
  const good = {
    kind: "error",
    message: "boom for sam@example.com",
    stack: "Error: boom\n    at x (a.js:1:1)",
    route: "/u/sam",
    version: "abc1234",
    platform: "ios",
    digest: "12345",
  };

  it("accepts a good report and scrubs it again on the server", () => {
    const report = parseClientErrorReport(good);
    assert.ok(report);
    assert.equal(report.kind, "error");
    assert.equal(report.platform, "ios");
    assert.equal(report.route, "/u/:username");
    assert.doesNotMatch(report.message, /example\.com/);
    assert.equal(report.digest, "12345");
  });

  it("rejects junk", () => {
    assert.equal(parseClientErrorReport(null), null);
    assert.equal(parseClientErrorReport("boom"), null);
    assert.equal(parseClientErrorReport({ ...good, kind: "nope" }), null);
    assert.equal(parseClientErrorReport({ ...good, message: 42 }), null);
  });

  it("falls back to safe values for odd fields", () => {
    const report = parseClientErrorReport({ ...good, platform: "android", version: "<script>", digest: "x y z" });
    assert.ok(report);
    assert.equal(report.platform, "web");
    assert.equal(report.version, "unknown");
    assert.equal(report.digest, null);
  });
});

describe("createRateLimiter", () => {
  it("allows a few per key per window, then says no until the window passes", () => {
    let now = 0;
    const limit = createRateLimiter({ perKey: 2, total: 100, windowMs: 1000, now: () => now });
    assert.equal(limit("a"), true);
    assert.equal(limit("a"), true);
    assert.equal(limit("a"), false);
    assert.equal(limit("b"), true);
    now = 1001;
    assert.equal(limit("a"), true);
  });

  it("caps the total across keys", () => {
    const limit = createRateLimiter({ perKey: 10, total: 3, windowMs: 1000, now: () => 0 });
    assert.equal(limit("a"), true);
    assert.equal(limit("b"), true);
    assert.equal(limit("c"), true);
    assert.equal(limit("d"), false);
  });
});
