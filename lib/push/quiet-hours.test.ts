import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PREFS } from "./prefs";
import { inQuietHours, isValidTimeZone, localMinutes } from "./quiet-hours";

const quiet = (start: string, end: string, timeZone = "America/New_York") => ({
  ...DEFAULT_PREFS,
  quietEnabled: true,
  quietStart: start,
  quietEnd: end,
  timeZone,
});

describe("quiet hours", () => {
  it("is off by default", () => {
    assert.equal(inQuietHours(DEFAULT_PREFS, new Date("2026-10-30T04:00:00Z")), false);
  });

  it("handles a same-day window", () => {
    const prefs = quiet("13:00", "15:00");
    // 13:30 EDT
    assert.equal(inQuietHours(prefs, new Date("2026-10-30T17:30:00Z")), true);
    // 15:00 EDT is the end, exclusive
    assert.equal(inQuietHours(prefs, new Date("2026-10-30T19:00:00Z")), false);
    assert.equal(inQuietHours(prefs, new Date("2026-10-30T16:59:00Z")), false);
  });

  it("handles a window that crosses midnight", () => {
    const prefs = quiet("22:00", "08:00");
    assert.equal(inQuietHours(prefs, new Date("2026-10-31T02:30:00Z")), true); // 22:30 EDT
    assert.equal(inQuietHours(prefs, new Date("2026-10-31T07:00:00Z")), true); // 03:00 EDT
    assert.equal(inQuietHours(prefs, new Date("2026-10-31T11:59:00Z")), true); // 07:59 EDT
    assert.equal(inQuietHours(prefs, new Date("2026-10-31T12:00:00Z")), false); // 08:00 EDT
    assert.equal(inQuietHours(prefs, new Date("2026-10-31T01:59:00Z")), false); // 21:59 EDT
  });

  it("follows local time across DST changes", () => {
    const prefs = quiet("07:00", "09:00");
    // 2026-03-08: New York springs forward. 07:30 EDT is 11:30 UTC.
    assert.equal(inQuietHours(prefs, new Date("2026-03-08T11:30:00Z")), true);
    // The day before, 11:30 UTC was 06:30 EST.
    assert.equal(inQuietHours(prefs, new Date("2026-03-07T11:30:00Z")), false);
    // 2026-11-01: falls back. 07:30 EST is 12:30 UTC.
    assert.equal(inQuietHours(prefs, new Date("2026-11-01T12:30:00Z")), true);
    assert.equal(localMinutes(new Date("2026-03-08T07:30:00Z"), "America/New_York"), 3 * 60 + 30);
    // The skipped hour never shows as 02:xx.
    assert.equal(localMinutes(new Date("2026-03-08T07:00:00Z"), "America/New_York"), 3 * 60);
  });

  it("works in zones other than New York", () => {
    const tokyo = quiet("22:00", "08:00", "Asia/Tokyo");
    assert.equal(inQuietHours(tokyo, new Date("2026-10-30T14:00:00Z")), true); // 23:00 JST
    assert.equal(inQuietHours(tokyo, new Date("2026-10-30T03:00:00Z")), false); // 12:00 JST
    const london = quiet("22:00", "08:00", "Europe/London");
    // 2026-10-25: London leaves BST. 07:30 UTC is 07:30 GMT.
    assert.equal(inQuietHours(london, new Date("2026-10-25T07:30:00Z")), true);
    const kolkata = quiet("00:00", "06:30", "Asia/Kolkata");
    assert.equal(inQuietHours(kolkata, new Date("2026-10-30T00:50:00Z")), true); // 06:20 IST
    assert.equal(inQuietHours(kolkata, new Date("2026-10-30T01:00:00Z")), false); // 06:30 IST
  });

  it("treats a bad zone or an empty window as no quiet hours", () => {
    assert.equal(isValidTimeZone("Mars/Base"), false);
    assert.equal(isValidTimeZone("America/Chicago"), true);
    assert.equal(inQuietHours(quiet("22:00", "08:00", "Mars/Base"), new Date()), false);
    assert.equal(inQuietHours(quiet("08:00", "08:00"), new Date()), false);
  });
});
