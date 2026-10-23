import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exactTime, timeAgo } from "./format";

describe("home timestamps", () => {
  it("uses the New York calendar so server UTC and a browser zone match", () => {
    const late = "2026-10-22T03:30:00.000Z";
    const afternoon = new Date("2026-10-22T16:00:00.000Z");
    assert.equal(timeAgo(late, afternoon), "Yesterday");
    assert.equal(exactTime(late), "Oct 21, 2026, 11:30 PM");

    const evening = "2026-10-22T01:00:00.000Z";
    const laterEvening = new Date("2026-10-22T02:00:00.000Z");
    assert.equal(timeAgo(evening, laterEvening), "1h");
  });

  it("keeps an older New York date stable, including the year", () => {
    const iso = "2024-01-02T18:00:00.000Z";
    const now = new Date("2026-10-22T16:00:00.000Z");
    assert.equal(timeAgo(iso, now), "Jan 2, 2024");
  });
});
