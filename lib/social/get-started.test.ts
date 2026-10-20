import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  checklistDismissKey,
  checklistNewUserKey,
  checklistState,
  defaultHomeTab,
  isNewUser,
  isRecentAccount,
  storedNewUserFlag,
} from "./get-started";

const now = Date.parse("2026-10-20T15:00:00.000Z");
const createdAt = "2026-10-18T15:00:00.000Z";

const open = {
  cardCount: 0,
  followingCount: 0,
  postCount: 0,
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
  it("opens For You for a brand-new account", () => {
    assert.equal(defaultHomeTab({ followingCount: 0, cardCount: 0 }), "foryou");
  });

  it("opens Following once they follow someone", () => {
    assert.equal(defaultHomeTab({ followingCount: 2, cardCount: 0 }), "following");
    assert.equal(defaultHomeTab({ followingCount: 1, cardCount: 4 }), "following");
  });

  it("stays on For You when they have cards but follow nobody", () => {
    assert.equal(defaultHomeTab({ followingCount: 0, cardCount: 3 }), "foryou");
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
        ["card", false],
        ["follow", false],
        ["post", false],
      ],
    );
  });

  it("checks steps from real counts and hides itself when all three are done", () => {
    const partial = checklistState({ ...open, cardCount: 1, followingCount: 2, postCount: 0 });
    assert.equal(partial.visible, true);
    assert.deepEqual(
      partial.steps.map((step) => step.done),
      [true, false, false],
    );

    const followed = checklistState({ ...open, cardCount: 1, followingCount: 3, postCount: 1 });
    assert.equal(followed.complete, true);
    assert.equal(followed.visible, false);
  });

  it("hides when dismissed or while the counts are still loading", () => {
    assert.equal(checklistState({ ...open, dismissed: true }).visible, false);
    assert.equal(checklistState({ ...open, ready: false }).visible, false);
    assert.equal(checklistDismissKey("user-1"), "slabhold.get-started.dismissed.user-1");
  });

  it("stays up for a new account while they finish the steps", () => {
    const working = checklistState({
      ...open,
      cardCount: 1,
      followingCount: 1,
      postCount: 0,
      wasNewUser: true,
    });
    assert.equal(working.visible, true);
    assert.deepEqual(
      working.steps.map((step) => step.done),
      [true, false, false],
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
        postCount: 2,
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

describe("home wiring", () => {
  it("uses the helpers, the add-card flow, collectors, and the composer", () => {
    const root = process.cwd();
    const feed = readFileSync(join(root, "components/feed-view.tsx"), "utf8");
    const card = readFileSync(join(root, "components/get-started.tsx"), "utf8");
    assert.match(feed, /defaultHomeTab\(/);
    assert.match(feed, /checklistState\(/);
    assert.match(feed, /isNewUser\(\{/);
    assert.match(feed, /useRememberNewUser\(/);
    assert.match(feed, /createdAt: user\?\.createdAt/);
    assert.match(feed, /from\("posts"\)/);
    assert.match(feed, /select\("id", \{ count: "exact", head: true \}\)/);
    assert.match(feed, /\.eq\("user_id", userId\)/);
    assert.doesNotMatch(feed, /posts\.filter\(\(post\) => post\.authorId/);
    assert.match(feed, /id="collectors-to-follow"/);
    assert.match(feed, /checklistDismissKey\(userId\)|useGetStartedDismissed/);
    assert.match(card, /checklistNewUserKey\(userId\)/);
    assert.match(card, /localStorage\.setItem\(key, wasNewOnLoad \? "1" : "0"\)/);
    assert.match(card, /Add your first card/);
    assert.match(card, /Follow 3 collectors/);
    assert.match(card, /Make your first post/);
    assert.match(card, /href="\/cards\/new"/);
    assert.match(card, /localStorage/);
    assert.match(card, /aria-label="Dismiss"/);
  });
});
