import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showCreateMenu } from "./show-create-menu";

const me = { username: "Donnie" };

describe("showCreateMenu", () => {
  it("hides the button when logged out", () => {
    assert.equal(showCreateMenu("/", null), false);
    assert.equal(showCreateMenu("/profile", null), false);
    assert.equal(showCreateMenu("/u/Donnie", null), false);
  });

  it("shows on the timeline and your own profile", () => {
    assert.equal(showCreateMenu("/", me), true);
    assert.equal(showCreateMenu("/profile", me), true);
    assert.equal(showCreateMenu("/u/Donnie", me), true);
    assert.equal(showCreateMenu("/u/donnie", me), true);
  });

  it("hides on other profiles and other tabs", () => {
    assert.equal(showCreateMenu("/u/someone", me), false);
    assert.equal(showCreateMenu("/u/Donnie/followers", me), false);
    assert.equal(showCreateMenu("/u/Donnie%20", me), false);
    assert.equal(showCreateMenu("/more", me), false);
    assert.equal(showCreateMenu("/compose", me), false);
    assert.equal(showCreateMenu("/collection", me), false);
  });
});
