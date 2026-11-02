import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BRAND_ACCOUNT_IDS } from "@/lib/leaderboard/brand-accounts";
import { checklistState, followStepLabel, isNewUser, newUserOnFullSnapshot } from "./get-started";
import { getStartedHintScript, seededChecklist } from "./home-seed";
import { OFFICIAL_UPDATES_USER_ID } from "./official-updates";
import {
  currentFirstRunStep,
  effectiveFollowCount,
  FIRST_RUN_EVENTS,
  firstRunEligible,
  firstRunEventKey,
  firstRunEventsFor,
  firstRunPeople,
  firstRunState,
  firstRunSteps,
  seededFirstRun,
  trackFirstRunOnce,
} from "./first-run";

const BRAND_ID = BRAND_ACCOUNT_IDS[0];
const VIEWER = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-11-02T12:00:00.000Z");
const fresh = new Date(now - 60_000).toISOString();
const old = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

describe("the auto-follow bug on today's helpers", () => {
  // Every real new profile follows the updates account at signup
  // (20261022210000_follow_official_updates.sql). QA accounts skip it.
  it("a real signup whose only follow is the updates account is not 'new' today", () => {
    const rawFollowing = [OFFICIAL_UPDATES_USER_ID].length;
    assert.equal(isNewUser({ followingCount: rawFollowing, cardCount: 0 }), false);
    assert.equal(newUserOnFullSnapshot({ fullSnapshot: true, followingCount: rawFollowing, cardCount: 0 }), false);
    // load-home-seed's newNow, from follows.length, is false too, so the key is stored as "0".
    assert.equal(followStepLabel(rawFollowing), "Follow 3 collectors (1 of 3)");
    // With "0" stored, checklistState never shows Get started.
    const state = checklistState({
      cardCount: 0,
      followingCount: rawFollowing,
      profileDone: false,
      dismissed: false,
      ready: true,
      createdAt: fresh,
      wasNewUser: false,
      now,
    });
    assert.equal(state.visible, false);
  });

  it("the effective count fixes it: that signup is new, and the label starts at 0", () => {
    const chosen = effectiveFollowCount([OFFICIAL_UPDATES_USER_ID]);
    assert.equal(chosen, 0);
    assert.equal(isNewUser({ followingCount: chosen, cardCount: 0 }), true);
    assert.equal(followStepLabel(chosen), "Follow 3 collectors (0 of 3)");
  });
});

describe("effectiveFollowCount", () => {
  it("counts official-only and brand-only follows as 0", () => {
    assert.equal(effectiveFollowCount([OFFICIAL_UPDATES_USER_ID]), 0);
    assert.equal(effectiveFollowCount([BRAND_ID]), 0);
    assert.equal(effectiveFollowCount([BRAND_ID.toUpperCase(), ` ${OFFICIAL_UPDATES_USER_ID} `]), 0);
    assert.equal(effectiveFollowCount([]), 0);
  });

  it("counts each chosen collector once", () => {
    assert.equal(effectiveFollowCount(["a", "b", "a", OFFICIAL_UPDATES_USER_ID, BRAND_ID, ""]), 2);
  });
});

describe("firstRunEligible", () => {
  const base = { ready: true, dismissed: false, cardCount: 0, effectiveFollows: 0, profileDone: false };

  it("an old 0/0 account is eligible, though the 7-day checklist is not", () => {
    const checklist = checklistState({
      cardCount: 0,
      followingCount: 0,
      profileDone: false,
      dismissed: false,
      ready: true,
      createdAt: old,
      wasNewUser: false,
      now,
    });
    assert.equal(checklist.visible, false);
    assert.equal(firstRunEligible({ ...base, checklistVisible: checklist.visible }), true);
    assert.equal(firstRunState(checklist, { eligible: true }).visible, true);
  });

  it("dismissed is never eligible", () => {
    assert.equal(firstRunEligible({ ...base, dismissed: true }), false);
    assert.equal(firstRunEligible({ ...base, dismissed: true, checklistVisible: true }), false);
  });

  it("all done is never eligible", () => {
    assert.equal(
      firstRunEligible({ ...base, cardCount: 2, effectiveFollows: 3, profileDone: true, checklistVisible: true }),
      false,
    );
  });

  it("waits for counts, and leaves a collector with cards or follows to the checklist", () => {
    assert.equal(firstRunEligible({ ...base, ready: false }), false);
    assert.equal(firstRunEligible({ ...base, cardCount: 1 }), false);
    assert.equal(firstRunEligible({ ...base, effectiveFollows: 1 }), false);
    assert.equal(firstRunEligible({ ...base, effectiveFollows: 1, checklistVisible: true }), true);
  });

  it("derives steps from counts: a card, 3 chosen follows, a photo or bio", () => {
    assert.deepEqual(
      firstRunSteps({ cardCount: 1, effectiveFollows: 2, profileDone: true }).map((step) => [step.id, step.done]),
      [
        ["follow", false],
        ["card", true],
        ["profile", true],
      ],
    );
    assert.equal(currentFirstRunStep(firstRunSteps({ cardCount: 0, effectiveFollows: 0, profileDone: false })), "card");
    assert.equal(currentFirstRunStep(firstRunSteps({ cardCount: 1, effectiveFollows: 0, profileDone: false })), "follow");
    assert.equal(currentFirstRunStep(firstRunSteps({ cardCount: 1, effectiveFollows: 3, profileDone: false })), "profile");
    assert.equal(currentFirstRunStep(firstRunSteps({ cardCount: 1, effectiveFollows: 3, profileDone: true })), null);
  });

  it("holds a finished card only while it was on screen this visit", () => {
    const done = checklistState({
      cardCount: 1,
      followingCount: 3,
      profileDone: true,
      dismissed: false,
      ready: true,
      createdAt: fresh,
      wasNewUser: true,
      now,
    });
    assert.equal(done.complete, true);
    assert.equal(firstRunState(done, { eligible: false }).visible, false);
    assert.equal(firstRunState(done, { eligible: false, hold: true }).visible, true);
  });

  it("an old account that follows its first collector keeps the card for the rest of the visit", () => {
    const checklist = checklistState({
      cardCount: 0,
      followingCount: 1,
      profileDone: false,
      dismissed: false,
      ready: true,
      createdAt: old,
      wasNewUser: false,
      now,
    });
    const eligible = firstRunEligible({ ready: true, dismissed: false, cardCount: 0, effectiveFollows: 1, profileDone: false });
    assert.equal(eligible, false);
    assert.equal(firstRunState(checklist, { eligible, hold: true }).visible, true);
    assert.equal(firstRunState(checklist, { eligible, hold: false }).visible, false);
  });
});

describe("first paint", () => {
  const viewer = {
    id: VIEWER,
    email: "",
    username: "fixture_new",
    displayName: "New collector",
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7C3AED",
    createdAt: old,
  };

  it("the server draws first run for an old 0/0 account, while seededChecklist stays as it was", () => {
    const getStarted = seededChecklist({ viewer, followingCount: 0, cardCount: 0, now });
    assert.equal(getStarted.visible, false);
    assert.equal(seededFirstRun(getStarted, true).visible, true);
    assert.equal(seededFirstRun(getStarted, false).visible, false);
    assert.equal(seededFirstRun(getStarted, undefined).visible, false);
  });

  it("the hint script is byte-identical without the third param", () => {
    const expected = `try{var s=localStorage,n=s.getItem("slabhold.get-started.new.${VIEWER}");if(s.getItem("slabhold.get-started.dismissed.${VIEWER}")==="1"||n==="0"||(n!=="1"&&false))document.documentElement.dataset.getStartedHidden=""}catch(e){}`;
    assert.equal(getStartedHintScript(VIEWER, true), expected);
    assert.equal(getStartedHintScript(VIEWER, true, false), expected);
    assert.equal(getStartedHintScript(VIEWER, false), expected.replace("&&false", "&&true"));
  });

  it("with zeroNow, a stored 'not new' does not hide it; a dismiss does", () => {
    const run = (store: Record<string, string>) => {
      const dataset: Record<string, string> = {};
      new Function("localStorage", "document", getStartedHintScript(VIEWER, true, true))(
        { getItem: (key: string) => store[key] ?? null },
        { documentElement: { dataset } },
      );
      return "getStartedHidden" in dataset;
    };
    assert.equal(run({}), false);
    assert.equal(run({ [`slabhold.get-started.new.${VIEWER}`]: "0" }), false);
    assert.equal(run({ [`slabhold.get-started.dismissed.${VIEWER}`]: "1" }), true);
  });
});

describe("firstRunPeople", () => {
  const person = (id: string, username: string, extra: { isTest?: boolean } = {}) => ({ id, username, ...extra });

  it("keeps 3 real collectors and leaves out the viewer, blocked, muted, test, official and brand accounts", () => {
    const ranked = [
      person(BRAND_ID, "slabhold"),
      person(OFFICIAL_UPDATES_USER_ID, "slabholdupdates"),
      person("v", "me"),
      person("t1", "qa_runner"),
      person("t2", "realname", { isTest: true }),
      person("g", "grokbotreview"),
      person("b", "blockedone"),
      person("m", "mutedone"),
      person("c1", "rookiepc"),
      person("c1", "rookiepc"),
      person("c2", "slabsunday"),
      person("c3", "vintagewax"),
      person("c4", "extra"),
    ];
    const kept = firstRunPeople(ranked, { viewerId: "v", blockedIds: ["b"], mutedIds: ["m"] });
    assert.deepEqual(kept.map((p) => p.id), ["c1", "c2", "c3"]);
  });

  it("returns fewer when fewer exist, so the card falls back to the rail", () => {
    assert.equal(firstRunPeople([person("c1", "rookiepc")], { viewerId: "v" }).length, 1);
  });
});

describe("first-run analytics", () => {
  const steps = (card: boolean, follow: boolean, profile: boolean) =>
    firstRunSteps({ cardCount: card ? 1 : 0, effectiveFollows: follow ? 3 : 0, profileDone: profile });

  it("every event name matches the analytics pattern", () => {
    for (const name of Object.values(FIRST_RUN_EVENTS)) assert.match(name, /^[a-z][a-z0-9_]{0,40}$/);
    assert.equal(firstRunEventKey(FIRST_RUN_EVENTS.shown, VIEWER), `slabhold.first-run.first_run_shown.${VIEWER}`);
  });

  it("fires a step only when it flips while mounted, never on a load where it was already done", () => {
    assert.deepEqual(firstRunEventsFor(null, steps(true, false, false)), []);
    assert.deepEqual(firstRunEventsFor(steps(true, false, false), steps(true, false, false)), []);
    assert.deepEqual(firstRunEventsFor(steps(false, false, false), steps(true, false, false)), ["first_run_card_done"]);
    assert.deepEqual(firstRunEventsFor(steps(true, false, true), steps(true, true, true)), [
      "first_run_follow_done",
      "first_run_completed",
    ]);
  });

  it("dedupes per user per device", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    const sent: string[] = [];
    const send = (name: string) => void sent.push(name);
    assert.equal(trackFirstRunOnce(FIRST_RUN_EVENTS.shown, "dedupe-a", { storage, send }), true);
    assert.equal(trackFirstRunOnce(FIRST_RUN_EVENTS.shown, "dedupe-a", { storage, send }), false);
    assert.equal(trackFirstRunOnce(FIRST_RUN_EVENTS.shown, "dedupe-b", { storage, send }), true);
    assert.deepEqual(sent, ["first_run_shown", "first_run_shown"]);
    // A later visit on the same device: the stored key holds.
    const sentAgain: string[] = [];
    store.set(firstRunEventKey(FIRST_RUN_EVENTS.dismissed, "dedupe-c"), "1");
    assert.equal(trackFirstRunOnce(FIRST_RUN_EVENTS.dismissed, "dedupe-c", { storage, send: (n) => void sentAgain.push(n) }), false);
    assert.deepEqual(sentAgain, []);
  });

  it("still sends once when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const sent: string[] = [];
    trackFirstRunOnce(FIRST_RUN_EVENTS.completed, "dedupe-d", { storage, send: (n) => void sent.push(n) });
    trackFirstRunOnce(FIRST_RUN_EVENTS.completed, "dedupe-d", { storage, send: (n) => void sent.push(n) });
    assert.deepEqual(sent, ["first_run_completed"]);
  });

  it("nothing fires for an ineligible user: the card that fires them is not mounted", () => {
    assert.equal(
      firstRunEligible({ ready: true, dismissed: false, cardCount: 4, effectiveFollows: 5, profileDone: false }),
      false,
    );
    const feed = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    const card = readFileSync(join(process.cwd(), "components/get-started.tsx"), "utf8");
    // Events live only in the card, and the card mounts only when visible.
    assert.doesNotMatch(feed, /trackFirstRunOnce|trackEvent/);
    assert.match(card, /trackFirstRunOnce/);
    assert.match(feed, /user && started\.visible && !onboardingBusy \? \(/);
  });
});
