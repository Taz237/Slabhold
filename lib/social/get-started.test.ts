import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  checklistDismissKey,
  checklistState,
  defaultHomeTab,
  isNewUser,
} from "./get-started";

const open = {
  cardCount: 0,
  followingCount: 0,
  postCount: 0,
  dismissed: false,
  ready: true,
};

describe("isNewUser", () => {
  it("is true only with no follows and no cards", () => {
    assert.equal(isNewUser({ followingCount: 0, cardCount: 0 }), true);
    assert.equal(isNewUser({ followingCount: 1, cardCount: 0 }), false);
    assert.equal(isNewUser({ followingCount: 0, cardCount: 1 }), false);
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
});

describe("home wiring", () => {
  it("uses the helpers, the add-card flow, collectors, and the composer", () => {
    const root = process.cwd();
    const feed = readFileSync(join(root, "components/feed-view.tsx"), "utf8");
    const card = readFileSync(join(root, "components/get-started.tsx"), "utf8");
    assert.match(feed, /defaultHomeTab\(/);
    assert.match(feed, /checklistState\(/);
    assert.match(feed, /id="collectors-to-follow"/);
    assert.match(feed, /checklistDismissKey\(userId\)|useGetStartedDismissed/);
    assert.match(card, /Add your first card/);
    assert.match(card, /Follow 3 collectors/);
    assert.match(card, /Make your first post/);
    assert.match(card, /href="\/cards\/new"/);
    assert.match(card, /localStorage/);
    assert.match(card, /aria-label="Dismiss"/);
  });
});
