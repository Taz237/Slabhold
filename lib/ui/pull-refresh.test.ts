import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  PULL_ARM_PX,
  PULL_HOLD_PX,
  PULL_MAX_PX,
  crossedTrigger,
  pullProgress,
  rubberBand,
  PULL_THRESHOLD_PX,
  activeTabAction,
  isCurrentTabScreen,
  keepsBrowserTabGesture,
  onPageRefresh,
  pullPhase,
  requestPageRefresh,
  shouldClaimPull,
  shouldStartPull,
} from "./pull-refresh";

describe("pull to refresh", () => {
  it("triggers only for a downward touch at scrollTop 0 past the threshold", () => {
    assert.equal(PULL_THRESHOLD_PX, 70);
    const base = { touch: true, scrollTop: 0, deltaX: 0, deltaY: 80, refreshing: false };
    assert.equal(pullPhase(base), "refresh");
    assert.equal(pullPhase({ ...base, deltaY: 70 }), "refresh");
    assert.equal(pullPhase({ ...base, deltaY: 69 }), "pulling");
    assert.equal(pullPhase({ ...base, deltaY: 12 }), "pulling");
    assert.equal(pullPhase({ ...base, scrollTop: 1 }), "idle");
    assert.equal(pullPhase({ ...base, scrollTop: 40 }), "idle");
    assert.equal(pullPhase({ ...base, deltaY: -30 }), "idle");
    assert.equal(pullPhase({ ...base, deltaX: 90, deltaY: 40 }), "idle");
    assert.equal(pullPhase({ ...base, refreshing: true }), "idle");
    assert.equal(pullPhase({ ...base, touch: false }), "idle");
  });

  it("claims the gesture only while pulling so a normal scroll is not cancelled", () => {
    assert.equal(shouldClaimPull("idle"), false);
    assert.equal(shouldClaimPull("pulling"), true);
    assert.equal(shouldClaimPull("refresh"), true);
  });

  it("waits until the finger moves down more than 8px before starting the pull", () => {
    assert.equal(PULL_ARM_PX, 8);
    assert.equal(shouldStartPull("pulling", 0), false);
    assert.equal(shouldStartPull("pulling", 8), false);
    assert.equal(shouldStartPull("pulling", 8.1), true);
    assert.equal(shouldStartPull("pulling", 12), true);
    assert.equal(shouldStartPull("refresh", 80), true);
    assert.equal(shouldStartPull("idle", 40), false);
    assert.equal(shouldStartPull("idle", 4), false);
  });

  it("leaves modified tab clicks to the browser", () => {
    const plain = { metaKey: false, ctrlKey: false, shiftKey: false };
    assert.equal(keepsBrowserTabGesture(plain), false);
    assert.equal(keepsBrowserTabGesture({ ...plain, metaKey: true }), true);
    assert.equal(keepsBrowserTabGesture({ ...plain, ctrlKey: true }), true);
    assert.equal(keepsBrowserTabGesture({ ...plain, shiftKey: true }), true);
  });

  it("scrolls an active tab to the top, and refreshes when it is already there", () => {
    assert.equal(activeTabAction({ onThisScreen: false, scrollTop: 0 }), "navigate");
    assert.equal(activeTabAction({ onThisScreen: false, scrollTop: 80 }), "navigate");
    assert.equal(activeTabAction({ onThisScreen: true, scrollTop: 24 }), "scroll-top");
    assert.equal(activeTabAction({ onThisScreen: true, scrollTop: 0 }), "refresh");
  });

  it("treats only the tab's own screen as already active", () => {
    assert.equal(isCurrentTabScreen("/", "/", null), true);
    assert.equal(isCurrentTabScreen("/search", "/", null), false);
    assert.equal(isCurrentTabScreen("/collection", "/collection", null), true);
    assert.equal(isCurrentTabScreen("/cards/abc", "/collection", null), false);
    assert.equal(isCurrentTabScreen("/messages", "/messages", null), true);
    assert.equal(isCurrentTabScreen("/messages/maya", "/messages", null), false);
    assert.equal(isCurrentTabScreen("/profile", "/profile", "maya"), true);
    assert.equal(isCurrentTabScreen("/u/maya", "/profile", "maya"), true);
    assert.equal(isCurrentTabScreen("/u/Maya", "/profile", "maya"), true);
    assert.equal(isCurrentTabScreen("/u/maya/followers", "/profile", "maya"), false);
    assert.equal(isCurrentTabScreen("/profile", "/profile", null), true);
  });

  it("runs the mounted refresh and reports when nothing is listening", () => {
    assert.equal(requestPageRefresh(), false);
    let calls = 0;
    const stop = onPageRefresh(() => {
      calls += 1;
    });
    assert.equal(requestPageRefresh(), true);
    assert.equal(calls, 1);
    stop();
    assert.equal(requestPageRefresh(), false);
    assert.equal(calls, 1);
  });
});

describe("pull to refresh feel", () => {
  it("follows the finger at first, then resists, and never passes the cap", () => {
    assert.equal(rubberBand(0), 0);
    assert.equal(rubberBand(-20), 0);
    assert.ok(rubberBand(10) > 9 && rubberBand(10) <= 10);
    const atTrigger = rubberBand(PULL_THRESHOLD_PX);
    assert.ok(atTrigger > PULL_HOLD_PX - 10 && atTrigger < PULL_THRESHOLD_PX, String(atTrigger));
    assert.ok(rubberBand(200) - rubberBand(150) < rubberBand(50) - rubberBand(0));
    assert.ok(rubberBand(5000) <= PULL_MAX_PX);
    assert.ok(PULL_HOLD_PX < PULL_MAX_PX);
  });

  it("turns the mark with the pull and clicks once at the trigger", () => {
    assert.equal(pullProgress(0), 0);
    assert.equal(pullProgress(35), 0.5);
    assert.equal(pullProgress(500), 1);
    assert.equal(crossedTrigger(60, 72), true);
    assert.equal(crossedTrigger(72, 90), false);
    assert.equal(crossedTrigger(90, 60), false);
  });
});

describe("pull to refresh wiring", () => {
  it("refreshes from the shared wrapper and does not leave a dead label", () => {
    const root = process.cwd();
    const wrapper = readFileSync(join(root, "components/pull-to-refresh.tsx"), "utf8");
    const profile = readFileSync(join(root, "components/profile-view.tsx"), "utf8");
    const shell = readFileSync(join(root, "components/app-shell.tsx"), "utf8");
    assert.match(wrapper, /router\.refresh\(/);
    assert.match(wrapper, /PULL_THRESHOLD_PX/);
    assert.match(wrapper, /shouldStartPull/);
    assert.match(wrapper, /\[role='listbox'\]/);
    assert.match(wrapper, /pointer:\s*coarse/);
    const move = wrapper.slice(
      wrapper.indexOf("function onTouchMove"),
      wrapper.indexOf("function onTouchEnd"),
    );
    const arm = move.indexOf("shouldStartPull");
    const prevent = move.indexOf("preventDefault");
    assert.ok(arm >= 0 && prevent > arm);
    const mentions = readFileSync(join(root, "components/mention-textarea.tsx"), "utf8");
    assert.match(mentions, /role="listbox"/);
    const tabHandler = shell.slice(
      shell.indexOf("const onTabClick"),
      shell.indexOf("event.preventDefault()"),
    );
    assert.match(tabHandler, /keepsBrowserTabGesture/);
    assert.match(tabHandler, /metaKey/);
    assert.match(tabHandler, /ctrlKey/);
    assert.match(tabHandler, /shiftKey/);
    assert.doesNotMatch(wrapper, /max-width:\s*767/);
    assert.doesNotMatch(wrapper, /Pull to refresh/);
    assert.doesNotMatch(wrapper, /pointerType/);
    assert.doesNotMatch(profile, /Pull to refresh/);
    assert.match(shell, /activeTabAction/);
    assert.match(shell, /requestPageRefresh/);
    for (const file of [
      "components/feed-view.tsx",
      "components/dashboard.tsx",
      "components/search-view.tsx",
      "components/notifications-view.tsx",
      "components/messages-view.tsx",
      "components/profile-view.tsx",
    ]) {
      assert.match(readFileSync(join(root, file), "utf8"), /PullToRefresh/, file);
    }
  });
});
