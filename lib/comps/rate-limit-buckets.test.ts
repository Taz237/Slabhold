import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { anonymousSubject } from "./anon-subject";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("card value rate limit bucket", () => {
  it("uses a card_values bucket separate from requests", () => {
    const rate = read("lib/comps/rate-limit.ts");
    const route = read("app/api/card-values/route.ts");
    const sold = read("app/api/comps/sold/route.ts");
    const refresh = read("app/api/card-values/refresh/route.ts");

    const bucket = (name: string) => {
      const match = rate.match(new RegExp(`const ${name} = "([^"]+)"`));
      assert.ok(match, name);
      return match[1];
    };
    const limit = (name: string) => {
      const match = rate.match(new RegExp(`export const ${name} = (\\d+)`));
      assert.ok(match, name);
      return Number(match[1]);
    };

    assert.equal(bucket("CARD_VALUES_BUCKET"), "card_values");
    assert.equal(bucket("REQUESTS_BUCKET"), "requests");
    assert.notEqual(bucket("CARD_VALUES_BUCKET"), bucket("REQUESTS_BUCKET"));
    assert.equal(limit("CARD_VALUES_LIMIT"), 120);
    assert.equal(limit("REQUESTS_LIMIT"), 20);
    assert.match(rate, /export const CARD_VALUES_WINDOW_MS = 10 \* 60 \* 1000/);
    assert.match(rate, /function consumeCardValueLimit[\s\S]*CARD_VALUES_BUCKET/);
    assert.match(rate, /function consumeRequestLimit[\s\S]*REQUESTS_BUCKET/);
    assert.match(route, /consumeCardValueLimit\(userId\)/);
    assert.match(route, /consumeAnonymousCardValueLimit\(request\)/);
    assert.equal(route.includes("consumeRequestLimit"), false);
    assert.match(sold, /consumeRequestLimit\(userId\)/);
    assert.match(refresh, /consumeRequestLimit\(userId\)/);
  });

  it("salts the anonymous IP hash and warns once when the salt is missing", () => {
    const previous = process.env.RATE_LIMIT_SALT;
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    const request = (ip: string) =>
      new Request("https://slabhold.vercel.app/api/card-values", {
        headers: { "x-forwarded-for": ip },
      });
    try {
      delete process.env.RATE_LIMIT_SALT;
      const unsalted = anonymousSubject(request("203.0.113.5"));
      const again = anonymousSubject(request("203.0.113.5"));
      assert.equal(
        unsalted,
        createHash("sha256").update("card-values:203.0.113.5").digest("hex"),
      );
      assert.equal(again, unsalted);
      assert.equal(warnings.length, 1);
      assert.match(String(warnings[0]?.[0]), /RATE_LIMIT_SALT is not set/);

      process.env.RATE_LIMIT_SALT = "seasoning";
      const salted = anonymousSubject(request("203.0.113.5"));
      assert.equal(
        salted,
        createHash("sha256").update("seasoning:card-values:203.0.113.5").digest("hex"),
      );
      assert.notEqual(salted, unsalted);
      assert.equal(warnings.length, 1);
    } finally {
      console.warn = original;
      if (previous === undefined) delete process.env.RATE_LIMIT_SALT;
      else process.env.RATE_LIMIT_SALT = previous;
    }
  });
});
