import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addCalendarDays, countdownTo, inWeek, previousWeek, reloadKeyForReset, shouldReloadForReset, weekContaining, weekStanding } from "./week";
import { FINAL_LABEL, PROVISIONAL_LABEL } from "./rules";

const FRIDAY = new Date("2026-10-23T18:00:00.000Z");

describe("leaderboard weeks", () => {
  it("runs Monday 00:00 through Sunday 23:59 America/New_York", () => {
    const week = weekContaining(FRIDAY);
    assert.equal(week.start.toISOString(), "2026-10-19T04:00:00.000Z");
    assert.equal(week.end.toISOString(), "2026-10-26T04:00:00.000Z");
    assert.equal(week.startDate, "2026-10-19");
    assert.equal(week.endDate, "2026-10-25");
    assert.equal(week.label, "Oct 19 – Oct 25");
    assert.equal(inWeek(new Date("2026-10-26T03:59:59.999Z"), week), true);
    assert.equal(inWeek(new Date("2026-10-26T04:00:00.000Z"), week), false);
    assert.equal(inWeek(new Date("2026-10-19T03:59:59.999Z"), week), false);
    assert.equal(inWeek(new Date("2026-10-19T04:00:00.000Z"), week), true);
  });

  it("keeps the spring-forward week at 167 hours", () => {
    const week = weekContaining(new Date("2026-03-04T15:00:00.000Z"));
    assert.equal(week.start.toISOString(), "2026-03-02T05:00:00.000Z");
    assert.equal(week.end.toISOString(), "2026-03-09T04:00:00.000Z");
    assert.equal(week.end.getTime() - week.start.getTime(), 167 * 60 * 60 * 1000);
    assert.equal(addCalendarDays("2026-03-02", 7), "2026-03-09");
  });

  it("keeps the fall-back week at 169 hours", () => {
    const week = weekContaining(new Date("2026-10-28T15:00:00.000Z"));
    assert.equal(week.start.toISOString(), "2026-10-26T04:00:00.000Z");
    assert.equal(week.end.toISOString(), "2026-11-02T05:00:00.000Z");
    assert.equal(week.end.getTime() - week.start.getTime(), 169 * 60 * 60 * 1000);
  });

  it("marks a week Provisional until Tuesday 00:00 ET, then Closed", () => {
    const week = weekContaining(FRIDAY);
    assert.equal(week.finalAt.toISOString(), "2026-10-27T04:00:00.000Z");
    assert.equal(weekStanding(week, FRIDAY), PROVISIONAL_LABEL);
    const monday = new Date("2026-10-26T05:00:00.000Z");
    assert.equal(weekStanding(week, monday), PROVISIONAL_LABEL);
    assert.equal(weekStanding(week, new Date("2026-10-27T03:59:59.000Z")), PROVISIONAL_LABEL);
    assert.equal(FINAL_LABEL, "Closed");
    assert.equal(weekStanding(week, new Date("2026-10-27T04:00:00.000Z")), FINAL_LABEL);
    const next = weekContaining(monday);
    assert.equal(next.start.toISOString(), "2026-10-26T04:00:00.000Z");
    assert.equal(previousWeek(monday).start.toISOString(), week.start.toISOString());
    assert.equal(weekStanding(next, monday), PROVISIONAL_LABEL);
  });

  it("counts down to the next Monday reset", () => {
    const week = weekContaining(FRIDAY);
    const left = countdownTo(week.end, FRIDAY);
    assert.equal(left.days, 2);
    assert.equal(left.hours, 10);
    assert.equal(left.label, "Resets in 2d 10h 00m 00s");
    assert.equal(countdownTo(week.end, week.end).label, "Resets in 0d 00h 00m 00s");
    assert.equal(countdownTo(week.end, week.end).done, true);
    assert.equal(left.done, false);
    const resetsAt = week.end.toISOString();
    assert.equal(reloadKeyForReset(resetsAt), `lb-reloaded:${resetsAt}`);
    assert.equal(shouldReloadForReset({ done: true, pastAtMount: true, alreadyReloaded: false }), false);
    assert.equal(shouldReloadForReset({ done: true, pastAtMount: false, alreadyReloaded: true }), false);
    assert.equal(shouldReloadForReset({ done: false, pastAtMount: false, alreadyReloaded: false }), false);
    assert.equal(shouldReloadForReset({ done: true, pastAtMount: false, alreadyReloaded: false }), true);
  });
});
