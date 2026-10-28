import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SETUP_STEPS,
  TOUR_STEPS,
  oldPromptsHidden,
  setupSuggestions,
  parseSetupState,
  setupKey,
  setupProgress,
  setupStepAfter,
  setupVisible,
  tourAutoStarts,
  tourKey,
  tourStepFrom,
} from "./first-run";

const base = {
  signedIn: true,
  stored: null,
  table: "ready" as const,
  answered: false,
  pathname: "/",
  localNewUser: false,
};

describe("first-run setup steps", () => {
  it("has three steps: collect, follow, first card", () => {
    assert.deepEqual([...SETUP_STEPS], ["collect", "people", "card"]);
    assert.equal(setupProgress("collect"), 1 / 3);
    assert.equal(setupProgress("card"), 1);
  });

  it("can skip every step", () => {
    assert.equal(setupStepAfter("collect", "skip"), "people");
    assert.equal(setupStepAfter("people", "skip"), "card");
    assert.equal(setupStepAfter("card", "skip"), "done");
  });

  it("moves on and back", () => {
    assert.equal(setupStepAfter("collect", "next"), "people");
    assert.equal(setupStepAfter("people", "next"), "card");
    assert.equal(setupStepAfter("card", "next"), "done");
    assert.equal(setupStepAfter("card", "back"), "people");
    assert.equal(setupStepAfter("people", "back"), "collect");
    assert.equal(setupStepAfter("collect", "back"), "collect");
  });

  it("keys progress per user and ignores junk", () => {
    assert.equal(setupKey("u1"), "slabhold.setup.u1");
    assert.equal(parseSetupState("people"), "people");
    assert.equal(parseSetupState("done"), "done");
    assert.equal(parseSetupState("nope"), null);
    assert.equal(parseSetupState(null), null);
  });
});

describe("first-run setup visibility", () => {
  it("shows to a new account that has not answered what they collect", () => {
    assert.equal(setupVisible(base), true);
  });

  it("stays hidden once finished or skipped", () => {
    assert.equal(setupVisible({ ...base, stored: "done" }), false);
  });

  it("resumes a step that was in progress, even after interests are saved", () => {
    assert.equal(setupVisible({ ...base, stored: "people", answered: true }), true);
    assert.equal(setupVisible({ ...base, stored: "card", answered: true }), true);
  });

  it("does not show to existing collectors who already answered", () => {
    assert.equal(setupVisible({ ...base, answered: true }), false);
  });

  it("waits while loading, and stays off signed out or in collecting settings", () => {
    assert.equal(setupVisible({ ...base, table: "loading" }), false);
    assert.equal(setupVisible({ ...base, signedIn: false }), false);
    assert.equal(setupVisible({ ...base, pathname: "/settings/collecting" }), false);
  });

  it("uses the new-account check when the interests table is missing", () => {
    assert.equal(setupVisible({ ...base, table: "missing" }), false);
    assert.equal(setupVisible({ ...base, table: "missing", localNewUser: true }), true);
  });
});

describe("old prompts", () => {
  it("hide while setup, the You're in moment, or the tour is on screen", () => {
    assert.equal(oldPromptsHidden({ setupActive: true, celebrating: false, tourOpen: false }), true);
    assert.equal(oldPromptsHidden({ setupActive: false, celebrating: true, tourOpen: false }), true);
    assert.equal(oldPromptsHidden({ setupActive: false, celebrating: false, tourOpen: true }), true);
    assert.equal(oldPromptsHidden({ setupActive: false, celebrating: false, tourOpen: false }), false);
  });
});

describe("quick tour", () => {
  it("has five coach marks on the real UI", () => {
    assert.deepEqual(
      TOUR_STEPS.map((step) => step.target),
      ["menu", "add-card", "leaderboard", "collection", "messages"],
    );
    assert.equal(TOUR_STEPS[0].body, "Your menu: profile, achievements, settings.");
    assert.equal(TOUR_STEPS[1].body, "Add a card in seconds. We match it to real sold prices.");
    assert.equal(TOUR_STEPS[2].body, "Climb the weekly board.");
    assert.equal(TOUR_STEPS[3].body, "Your cards and their value.");
    assert.equal(TOUR_STEPS[4].body, "DM other collectors.");
  });

  it("is stored per user in localStorage", () => {
    assert.equal(tourKey("u1"), "slabhold.tour.seen.u1");
  });

  it("starts once, right after setup", () => {
    assert.equal(tourAutoStarts({ seen: false, setupJustFinished: true }), true);
    assert.equal(tourAutoStarts({ seen: true, setupJustFinished: true }), false);
    assert.equal(tourAutoStarts({ seen: false, setupJustFinished: false }), false);
  });

  it("skips a step whose element is not on screen", () => {
    const shown = [true, false, true, false, true];
    assert.equal(tourStepFrom(0, shown, 1), 0);
    assert.equal(tourStepFrom(1, shown, 1), 2);
    assert.equal(tourStepFrom(3, shown, 1), 4);
    assert.equal(tourStepFrom(5, shown, 1), null);
    assert.equal(tourStepFrom(3, shown, -1), 2);
    assert.equal(tourStepFrom(1, shown, -1), 0);
    assert.equal(tourStepFrom(0, [false, false, false, false, false], 1), null);
  });
});

describe("setup suggestions", () => {
  const person = (userId: string, username: string, isTest = false) => ({ userId, username, isTest });

  it("leaves out test accounts, non-suggested official accounts and you", () => {
    const list = [
      person("a", "wax_room"),
      person("b", "qa_tester"),
      person("c", "slabholdupdates"),
      person("d", "grokbotreview"),
      person("e", "flagged", true),
      person("me", "me_myself"),
      person("f", "test_user"),
      person("g", "hobby_pal"),
    ];
    assert.deepEqual(
      setupSuggestions(list, "me").map((entry) => entry.username),
      ["wax_room", "hobby_pal"],
    );
  });

  it("keeps the Slabhold app account and puts it first", () => {
    const list = [person("a", "wax_room"), person("s", "SlabholdApp"), person("g", "hobby_pal")];
    assert.deepEqual(
      setupSuggestions(list, "me").map((entry) => entry.username),
      ["SlabholdApp", "wax_room", "hobby_pal"],
    );
  });
});
