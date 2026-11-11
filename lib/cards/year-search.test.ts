import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CARD_SEASONS, CARD_YEARS, yearOptionsForSport } from "@/lib/card-options";
import { yearSearchMatches } from "@/lib/cards/year-search";

const basketball = yearOptionsForSport("Basketball");
const football = yearOptionsForSport("Football");

describe("Older years search", () => {
  it("treats a partial year as a filter that always has matches", () => {
    for (const typed of ["1", "19", "199", "1990", "90", "90-", "1990-", "1990-9"]) {
      assert.ok(yearSearchMatches(basketball, typed).length > 0, `${typed} has matches`);
    }
  });

  it("puts 1990-91 and 1990 first for 1990", () => {
    assert.deepEqual(yearSearchMatches(basketball, "1990").slice(0, 2), ["1990-91", "1990"]);
    assert.deepEqual(yearSearchMatches(football, "1990").slice(0, 2), ["1990", "1990-91"]);
  });

  it("reads two digits as the season's year: 90 is 1990 and 1990-91", () => {
    assert.deepEqual(yearSearchMatches(basketball, "90").slice(0, 2), ["1990-91", "1990"]);
    assert.deepEqual(yearSearchMatches(basketball, "23").slice(0, 2), ["2023-24", "2023"]);
  });

  it("lists the 1990s for 199, newest first", () => {
    const top = yearSearchMatches(football, "199").slice(0, 10);
    assert.deepEqual(top, ["1999", "1998", "1997", "1996", "1995", "1994", "1993", "1992", "1991", "1990"]);
  });

  it("matches a typed season like 90-91 or 1990/91", () => {
    assert.equal(yearSearchMatches(basketball, "90-91")[0], "1990-91");
    assert.equal(yearSearchMatches(basketball, "1990/91")[0], "1990-91");
    assert.equal(yearSearchMatches(basketball, "1990-1991")[0], "1990-91");
  });

  it("shows every year with nothing typed", () => {
    assert.equal(yearSearchMatches(basketball, "").length, CARD_SEASONS.length + CARD_YEARS.length);
    assert.equal(yearSearchMatches(basketball, "  ").length, basketball.length);
  });

  it("finds nothing for text that can never be a year", () => {
    assert.deepEqual(yearSearchMatches(basketball, "abc"), []);
    assert.deepEqual(yearSearchMatches(basketball, "1850"), []);
  });
});
