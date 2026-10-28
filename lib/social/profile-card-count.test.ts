import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { profileCardCount } from "./profile-tabs";

describe("profile Cards count", () => {
  it("shows the server count while cards are still loading, never 0", () => {
    assert.equal(profileCardCount({ own: false, server: 12, publicLoaded: null, ownTotal: null }), 12);
    assert.equal(profileCardCount({ own: true, server: 30, publicLoaded: null, ownTotal: null }), 30);
  });

  it("shows nothing (a skeleton) when there is no count yet", () => {
    assert.equal(profileCardCount({ own: false, server: null, publicLoaded: null, ownTotal: null }), null);
  });

  it("gives the owner their total, public and private", () => {
    // 4 public of 30 total.
    assert.equal(profileCardCount({ own: true, server: 30, publicLoaded: 4, ownTotal: 31 }), 31);
  });

  it("gives everyone else the public count once it loads", () => {
    assert.equal(profileCardCount({ own: false, server: 12, publicLoaded: 13, ownTotal: null }), 13);
    assert.equal(profileCardCount({ own: false, server: 12, publicLoaded: 0, ownTotal: null }), 0);
  });
});
