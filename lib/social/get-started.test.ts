import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  checklistBlocksAddToHomeTip,
  checklistDismissKey,
  checklistNewUserKey,
  checklistState,
  defaultHomeTab,
  followStepLabel,
  isNewUser,
  isRecentAccount,
  newUserOnFullSnapshot,
  profileStepDone,
  storedNewUserFlag,
} from "./get-started";

const now = Date.parse("2026-10-20T15:00:00.000Z");
const createdAt = "2026-10-18T15:00:00.000Z";

const open = {
  cardCount: 0,
  followingCount: 0,
  profileDone: false,
  dismissed: false,
  ready: true,
  createdAt,
  wasNewUser: true as boolean | null,
  now,
};

describe("isNewUser", () => {
  it("is true only with no follows and no cards", () => {
    assert.equal(isNewUser({ followingCount: 0, cardCount: 0 }), true);
    assert.equal(isNewUser({ followingCount: 1, cardCount: 0 }), false);
    assert.equal(isNewUser({ followingCount: 0, cardCount: 1 }), false);
  });

  it("waits for a full snapshot before a post-only page can look new", () => {
    assert.equal(
      newUserOnFullSnapshot({ fullSnapshot: false, followingCount: 0, cardCount: 0 }),
      null,
    );
    assert.equal(
      newUserOnFullSnapshot({ fullSnapshot: true, followingCount: 0, cardCount: 0 }),
      true,
    );
    assert.equal(
      newUserOnFullSnapshot({ fullSnapshot: true, followingCount: 4, cardCount: 2 }),
      false,
    );
  });
});

describe("isRecentAccount", () => {
  it("is true for the last 7 days, including the boundary", () => {
    assert.equal(isRecentAccount(new Date(now).toISOString(), now), true);
    assert.equal(isRecentAccount(new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), now), true);
    assert.equal(
      isRecentAccount(new Date(now - 7 * 24 * 60 * 60 * 1000 - 1).toISOString(), now),
      false,
    );
    assert.equal(isRecentAccount("not-a-date", now), false);
  });
});

describe("defaultHomeTab", () => {
  it("opens For You until they follow 3 collectors", () => {
    assert.equal(defaultHomeTab({ followingCount: 0, cardCount: 0 }), "foryou");
    assert.equal(defaultHomeTab({ followingCount: 1, cardCount: 0 }), "foryou");
    assert.equal(defaultHomeTab({ followingCount: 2, cardCount: 4 }), "foryou");
  });

  it("opens Following once they follow 3 collectors", () => {
    assert.equal(defaultHomeTab({ followingCount: 3, cardCount: 0 }), "following");
    assert.equal(defaultHomeTab({ followingCount: 4, cardCount: 1 }), "following");
  });

  it("stays on For You when they have cards but follow nobody", () => {
    assert.equal(defaultHomeTab({ followingCount: 0, cardCount: 3 }), "foryou");
  });
});

describe("followStepLabel", () => {
  it("shows how many of the 3 follows are done", () => {
    assert.equal(followStepLabel(0), "Follow 3 collectors (0 of 3)");
    assert.equal(followStepLabel(1), "Follow 3 collectors (1 of 3)");
    assert.equal(followStepLabel(2), "Follow 3 collectors (2 of 3)");
    assert.equal(followStepLabel(3), "Follow 3 collectors (3 of 3)");
    assert.equal(followStepLabel(8), "Follow 3 collectors (3 of 3)");
  });
});

describe("profileStepDone", () => {
  it("is done with a photo or a bio, and not with blanks", () => {
    assert.equal(profileStepDone({ avatarDataUrl: null, bio: "" }), false);
    assert.equal(profileStepDone({ avatarDataUrl: "   ", bio: "  " }), false);
    assert.equal(profileStepDone({ avatarDataUrl: null, bio: null }), false);
    assert.equal(profileStepDone({ avatarDataUrl: "https://cdn.example/me.jpg", bio: "" }), true);
    assert.equal(profileStepDone({ avatarDataUrl: null, bio: "Rookies and refractors." }), true);
  });
});

describe("checklistState", () => {
  it("shows three open steps for a new account", () => {
    const state = checklistState(open);
    assert.equal(state.visible, true);
    assert.equal(state.complete, false);
    assert.deepEqual(
      state.steps.map((step) => [step.id, step.done]),
      [
        ["follow", false],
        ["card", false],
        ["profile", false],
      ],
    );
  });

  it("checks steps from real counts and hides itself when all three are done", () => {
    const partial = checklistState({ ...open, cardCount: 1, followingCount: 2, profileDone: false });
    assert.equal(partial.visible, true);
    assert.deepEqual(
      partial.steps.map((step) => step.done),
      [false, true, false],
    );

    const followed = checklistState({ ...open, cardCount: 1, followingCount: 3, profileDone: true });
    assert.equal(followed.complete, true);
    assert.equal(followed.visible, false);
  });

  it("ticks the profile step from a photo or a bio alone", () => {
    const photo = checklistState({ ...open, profileDone: true });
    assert.equal(photo.visible, true);
    assert.deepEqual(
      photo.steps.map((step) => step.done),
      [false, false, true],
    );
  });

  it("hides when dismissed, while counts are loading, or when signed out", () => {
    assert.equal(checklistState({ ...open, dismissed: true }).visible, false);
    assert.equal(checklistState({ ...open, ready: false }).visible, false);
    assert.equal(checklistState({ ...open, createdAt: null, wasNewUser: null }).visible, false);
    assert.equal(checklistDismissKey("user-1"), "slabhold.get-started.dismissed.user-1");
    assert.equal(checklistDismissKey("user-2"), "slabhold.get-started.dismissed.user-2");
  });

  it("stays up for a new account while they finish the steps", () => {
    const working = checklistState({
      ...open,
      cardCount: 1,
      followingCount: 1,
      profileDone: false,
      wasNewUser: true,
    });
    assert.equal(working.visible, true);
    assert.deepEqual(
      working.steps.map((step) => step.done),
      [false, true, false],
    );
  });

  it("hides from accounts older than 7 days and from people who were not new", () => {
    const older = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(checklistState({ ...open, createdAt: older }).visible, false);
    assert.equal(
      checklistState({
        ...open,
        createdAt: older,
        cardCount: 4,
        followingCount: 1,
        profileDone: true,
      }).visible,
      false,
    );
    assert.equal(checklistState({ ...open, wasNewUser: false }).visible, false);
    assert.equal(checklistState({ ...open, wasNewUser: null }).visible, false);
    assert.equal(checklistNewUserKey("user-1"), "slabhold.get-started.new.user-1");
    assert.equal(storedNewUserFlag("1"), true);
    assert.equal(storedNewUserFlag("0"), false);
    assert.equal(storedNewUserFlag(null), null);
  });
});

describe("checklistBlocksAddToHomeTip", () => {
  it("holds the tip while Get started is open or might still appear", () => {
    const openState = checklistState(open);
    assert.equal(
      checklistBlocksAddToHomeTip({
        visible: openState.visible,
        complete: openState.complete,
        dismissed: false,
        wasNewUser: true,
        createdAt,
        now,
      }),
      true,
    );
    assert.equal(
      checklistBlocksAddToHomeTip({
        visible: false,
        complete: false,
        dismissed: false,
        wasNewUser: null,
        createdAt,
        now,
      }),
      true,
    );
  });

  it("shows the tip after dismiss, after the steps, or when they are not eligible", () => {
    const done = checklistState({ ...open, cardCount: 1, followingCount: 3, profileDone: true });
    assert.equal(
      checklistBlocksAddToHomeTip({
        visible: done.visible,
        complete: done.complete,
        dismissed: false,
        wasNewUser: true,
        createdAt,
        now,
      }),
      false,
    );
    assert.equal(
      checklistBlocksAddToHomeTip({
        visible: false,
        complete: false,
        dismissed: true,
        wasNewUser: true,
        createdAt,
        now,
      }),
      false,
    );
    assert.equal(
      checklistBlocksAddToHomeTip({
        visible: false,
        complete: false,
        dismissed: false,
        wasNewUser: false,
        createdAt,
        now,
      }),
      false,
    );
    const older = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      checklistBlocksAddToHomeTip({
        visible: false,
        complete: false,
        dismissed: false,
        wasNewUser: null,
        createdAt: older,
        now,
      }),
      false,
    );
  });
});

describe("home wiring", () => {
  it("uses the helpers, the add-card flow, collectors, and edit profile", () => {
    const root = process.cwd();
    const feed = readFileSync(join(root, "components/feed-view.tsx"), "utf8");
    const card = readFileSync(join(root, "components/get-started.tsx"), "utf8");
    const profile = readFileSync(join(root, "components/profile-view.tsx"), "utf8");
    const tip = readFileSync(join(root, "components/add-to-home-tip.tsx"), "utf8");
    assert.match(feed, /defaultHomeTab\(/);
    assert.match(feed, /usePagedTimeline\(/);
    assert.match(feed, /checklistState\(/);
    assert.match(feed, /newUserOnFullSnapshot\(\{/);
    assert.match(feed, /fullSnapshot: countsReady && \(mode !== "supabase" \|\| hasFullSnapshot\)/);
    assert.match(feed, /useRememberNewUser\(/);
    assert.match(feed, /profileStepDone\(/);
    assert.match(feed, /createdAt: user\?\.createdAt/);
    assert.doesNotMatch(feed, /useOwnPostCount/);
    assert.doesNotMatch(feed, /posts\.filter\(\(post\) => post\.authorId/);
    assert.match(feed, /id="collectors-to-follow"/);
    assert.match(feed, /checklistDismissKey\(userId\)|useGetStartedDismissed/);
    assert.match(feed, /user && started\.visible/);
    assert.match(feed, /checklistBlocksAddToHomeTip\(/);
    assert.match(feed, /showAddToHome && user \? <AddToHomeTip userId=\{user\.id\} \/> : null/);
    assert.match(card, /checklistNewUserKey\(userId\)/);
    assert.match(card, /localStorage\.setItem\(key, wasNewOnLoad \? "1" : "0"\)/);
    assert.match(card, /Add your first card/);
    assert.match(card, /followStepLabel\(followingCount\)/);
    assert.match(card, /Add a photo or bio/);
    assert.doesNotMatch(card, /Make your first post/);
    assert.doesNotMatch(card, /Pokémon|Pokemon|TCG/i);
    assert.match(feed, /followingCount=\{following\}/);
    assert.match(card, /"\/cards\/new"/);
    assert.match(card, /"\/profile\?edit=1"/);
    assert.match(card, /localStorage/);
    assert.match(card, /aria-label="Dismiss Get started"/);
    assert.match(card, /sr-only">\{done \? "done" : "not done"\}/);
    assert.match(card, /localStorage\.getItem\(checklistDismissKey\(userId\)\)/);
    assert.match(card, /catch \{/);
    assert.match(card, /min-h-11/);
    assert.match(profile, /searchParams\.get\("edit"\) === "1"/);
    assert.match(profile, /setEditing\(true\)/);
    assert.match(tip, /addToHomeDismissKey\(userId\)/);
    assert.match(tip, /navigatorStandalone: nav\.standalone === true/);
    assert.match(tip, /display-mode: standalone/);
    assert.match(tip, /Tap Share \(it may be under ⋯\), then Add to Home Screen/);
    assert.match(tip, /catch \{/);
    assert.match(tip, /return false/);
    assert.doesNotMatch(tip, /Pokémon|Pokemon|TCG/i);
  });
});
