import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEAM_BADGE_USERNAMES, hasTeamBadge } from "@/lib/social/team-badge";

describe("team badge list", () => {
  it("is the listed usernames only", () => {
    assert.deepEqual([...TEAM_BADGE_USERNAMES], ["donnietaz", "slabhold", "ripsandlots", "kevstuff"]);
    for (const name of ["donnietaz", "slabhold", "ripsandlots", "kevstuff"]) {
      assert.equal(hasTeamBadge(name), true, name);
    }
  });

  it("ignores case, spaces and a leading @", () => {
    assert.equal(hasTeamBadge("DonnieTaz"), true);
    assert.equal(hasTeamBadge(" @slabhold "), true);
    assert.equal(hasTeamBadge("RipsAndLots"), true);
    assert.equal(hasTeamBadge("@KevStuff"), true);
  });

  it("gives nobody else the badge, including look-alikes", () => {
    for (const name of ["collector", "slabholdupdates", "donnietaz2", "donnie", "slab_hold",
      "ripsandlot", "ripsandlots2", "rips_and_lots", "kevstuffs", "kev", "kev_stuff",
      "", null, undefined]) {
      assert.equal(hasTeamBadge(name), false, String(name));
    }
  });

  it("doesn't double up on an account with the official mark", () => {
    assert.equal(hasTeamBadge("slabhold", { official: true }), false);
    assert.equal(hasTeamBadge("kevstuff", { official: true }), false);
  });
});
