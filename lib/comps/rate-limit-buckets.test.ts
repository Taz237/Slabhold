import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

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
});
