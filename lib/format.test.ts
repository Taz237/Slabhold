import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { money, signedMoney } from "./format";

describe("money", () => {
  it("always formats as $35.00 style", () => {
    assert.equal(money(35), "$35.00");
    assert.equal(money(35, false), "$35.00");
    assert.equal(money(35, true), "$35.00");
    assert.equal(money(2.5), "$2.50");
    assert.equal(money(120), "$120.00");
  });

  it("keeps signedMoney on the same formatter", () => {
    assert.equal(signedMoney(12), "+$12.00");
    assert.equal(signedMoney(-3.5), "−$3.50");
  });
});
