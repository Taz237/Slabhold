import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTargetPrice } from "./target-price";

describe("parseTargetPrice", () => {
  it("allows an empty target", () => {
    assert.deepEqual(parseTargetPrice(""), { ok: true, value: null });
    assert.deepEqual(parseTargetPrice("   "), { ok: true, value: null });
  });

  it("accepts a positive price", () => {
    assert.deepEqual(parseTargetPrice("35"), { ok: true, value: 35 });
    assert.deepEqual(parseTargetPrice("12.5"), { ok: true, value: 12.5 });
  });

  it("rejects 0, negative, and non-numeric values", () => {
    assert.equal(parseTargetPrice("0").ok, false);
    assert.equal(parseTargetPrice("0.0").ok, false);
    assert.equal(parseTargetPrice("-5").ok, false);
    assert.equal(parseTargetPrice("abc").ok, false);
    assert.equal(parseTargetPrice("$35").ok, false);
    assert.equal(parseTargetPrice("10abc").ok, false);
  });
});
