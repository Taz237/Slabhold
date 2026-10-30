import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PREFS, PUSH_TOGGLES, clockText, kindEnabled, prefsFromRow, prefsToRow, pushKindOf } from "./prefs";

describe("notification prefs", () => {
  it("uses every default when there is no row", () => {
    const prefs = prefsFromRow(null);
    assert.deepEqual(prefs, DEFAULT_PREFS);
    for (const kind of ["follow", "like", "comment", "repost", "quote", "mention", "dm"]) {
      assert.equal(kindEnabled(prefs, kind), true, kind);
    }
    assert.equal(prefs.showPreviews, true);
    assert.equal(prefs.quietEnabled, false);
    assert.equal(prefs.quietStart, "22:00");
    assert.equal(prefs.quietEnd, "08:00");
  });

  it("turns off one type at a time", () => {
    const columns = {
      follow: "push_follow",
      like: "push_like",
      comment: "push_reply",
      repost: "push_repost",
      quote: "push_quote",
      mention: "push_mention",
      dm: "push_dm",
    } as const;
    for (const [kind, column] of Object.entries(columns)) {
      const prefs = prefsFromRow({ [column]: false });
      for (const other of Object.keys(columns)) {
        assert.equal(kindEnabled(prefs, other), other !== kind, `${column} off, ${other}`);
      }
    }
  });

  it("reads show previews off, quiet hours and Postgres times", () => {
    const prefs = prefsFromRow({
      show_previews: false,
      quiet_enabled: true,
      quiet_start: "23:30:00",
      quiet_end: "06:15:00",
      time_zone: "Europe/London",
    });
    assert.equal(prefs.showPreviews, false);
    assert.equal(prefs.quietEnabled, true);
    assert.equal(prefs.quietStart, "23:30");
    assert.equal(prefs.quietEnd, "06:15");
    assert.equal(prefs.timeZone, "Europe/London");
  });

  it("never pushes unknown kinds such as want alerts", () => {
    assert.equal(kindEnabled(DEFAULT_PREFS, "want_alert"), false);
    assert.equal(kindEnabled(DEFAULT_PREFS, "deal_confirm"), false);
    assert.equal(pushKindOf("comment"), "reply");
  });

  it("round-trips through the row shape and rejects bad clocks", () => {
    const row = prefsToRow("u1", { ...DEFAULT_PREFS, like: false });
    assert.equal(row.push_like, false);
    assert.deepEqual(prefsFromRow(row), { ...DEFAULT_PREFS, like: false });
    assert.equal(clockText("24:00"), null);
    assert.equal(clockText("7:00"), null);
    assert.equal(PUSH_TOGGLES.length, 7);
  });
});
