import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCardOwner } from "./ownership";

describe("isCardOwner", () => {
  it("is true only when the session user is the card owner", () => {
    assert.equal(isCardOwner("owner", "owner"), true);
    assert.equal(isCardOwner("owner", "someone-else"), false);
    assert.equal(isCardOwner("owner", null), false);
    assert.equal(isCardOwner(null, "owner"), false);
    assert.equal(isCardOwner(undefined, undefined), false);
  });
});
