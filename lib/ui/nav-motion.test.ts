import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDGE_COMMIT_RATIO,
  EDGE_START_PX,
  RESTORE_TIMEOUT_MS,
  canGoBack,
  edgeBackdrop,
  edgeReleaseGoesBack,
  edgeSwipeAllowed,
  edgeSwipeClaims,
  isRootScreen,
  navKind,
  popEntry,
  pushEntry,
  routeStep,
  restoreStep,
  startStack,
} from "./nav-motion";

describe("route motion", () => {
  it("treats tab roots as roots and everything deeper as pushed", () => {
    for (const path of ["/", "/leaderboard", "/collection", "/messages", "/notifications", "/search", "/profile"]) {
      assert.equal(isRootScreen(path), true, path);
    }
    assert.equal(isRootScreen("/messages/"), true);
    assert.equal(isRootScreen("/?menu=open"), true);
    for (const path of [
      "/posts/abc",
      "/u/maya",
      "/u/maya/cards/1",
      "/messages/maya",
      "/settings/privacy",
      "/cards/abc",
      "/compose",
    ]) {
      assert.equal(isRootScreen(path), false, path);
    }
  });

  it("slides pushed screens in, slides back out, and cross-fades tabs", () => {
    assert.equal(navKind({ from: "/", to: "/posts/1", direction: "push" }), "forward");
    assert.equal(navKind({ from: "/posts/1", to: "/u/maya", direction: "push" }), "forward");
    assert.equal(navKind({ from: "/posts/1", to: "/", direction: "back" }), "back");
    assert.equal(navKind({ from: "/u/maya", to: "/posts/1", direction: "back" }), "back");
    assert.equal(navKind({ from: "/", to: "/messages", direction: "push" }), "fade");
    assert.equal(navKind({ from: "/messages", to: "/", direction: "back" }), "fade");
    assert.equal(navKind({ from: "/posts/1", to: "/collection", direction: "push" }), "fade");
    assert.equal(navKind({ from: "/", to: "/posts/1", direction: "forward" }), "forward");
    assert.equal(navKind({ from: "/u/maya", to: "/u/maya?tab=cards", direction: "push" }), "none");
  });

  it("keeps an in-app back stack", () => {
    let stack = startStack("/");
    assert.equal(canGoBack(stack), false);
    stack = pushEntry(stack, "/posts/1");
    stack = pushEntry(stack, "/u/maya");
    assert.equal(canGoBack(stack), true);
    assert.equal(pushEntry(stack, "/u/maya"), stack);
    const back = popEntry(stack, "/posts/1");
    assert.equal(back.direction, "back");
    assert.equal(back.stack.index, 1);
    const forward = popEntry(back.stack, "/u/maya");
    assert.equal(forward.direction, "forward");
    assert.equal(forward.stack.index, 2);
    const branched = pushEntry(back.stack, "/messages/maya");
    assert.deepEqual(branched.entries, ["/", "/posts/1", "/messages/maya"]);
    const unknown = popEntry(stack, "/somewhere");
    assert.equal(unknown.direction, "back");
    assert.equal(canGoBack(unknown.stack), false);
  });
});

describe("route steps", () => {
  const stack = pushEntry(pushEntry(startStack("/"), "/posts/1"), "/u/maya");

  it("reads landing on the entry below as Back when nothing says push", () => {
    const back = routeStep(stack, "/posts/1", null);
    assert.equal(back.direction, "back");
    assert.equal(back.stack.index, 1);
    assert.equal(routeStep(back.stack, "/u/maya", null).direction, "forward");
    assert.equal(routeStep(stack, "/messages", null).direction, "push");
  });

  it("trusts a tapped link or the Navigation API", () => {
    const pushed = routeStep(stack, "/posts/1", "push");
    assert.equal(pushed.direction, "push");
    assert.deepEqual(pushed.stack.entries, ["/", "/posts/1", "/u/maya", "/posts/1"]);
    const traversed = routeStep(stack, "/somewhere-old", "traverse");
    assert.equal(traversed.direction, "back");
    assert.equal(canGoBack(traversed.stack), false);
    const replaced = routeStep(stack, "/u/maya?tab=cards", "replace");
    assert.equal(replaced.stack.index, 2);
    assert.equal(replaced.stack.entries[2], "/u/maya?tab=cards");
  });
});

describe("standalone edge swipe", () => {
  const base = { standalone: true, pathname: "/posts/1", canGoBack: true, startX: 8 };

  it("only starts at the left edge of a pushed screen in the home-screen app", () => {
    assert.equal(EDGE_START_PX, 20);
    assert.equal(edgeSwipeAllowed(base), true);
    assert.equal(edgeSwipeAllowed({ ...base, startX: 20 }), true);
    assert.equal(edgeSwipeAllowed({ ...base, startX: 21 }), false);
    assert.equal(edgeSwipeAllowed({ ...base, standalone: false }), false, "Safari has its own swipe");
    assert.equal(edgeSwipeAllowed({ ...base, pathname: "/" }), false, "root tabs keep the side menu");
    assert.equal(edgeSwipeAllowed({ ...base, pathname: "/messages" }), false);
    assert.equal(edgeSwipeAllowed({ ...base, canGoBack: false }), false);
  });

  it("claims a sideways drag and lets vertical scrolls and carousels go", () => {
    assert.equal(edgeSwipeClaims(4, 2), "wait");
    assert.equal(edgeSwipeClaims(14, 3), "claim");
    assert.equal(edgeSwipeClaims(6, 16), "release");
    assert.equal(edgeSwipeClaims(-14, 0), "release");
  });

  it("goes back past 35% or on a quick flick, otherwise snaps back", () => {
    assert.equal(EDGE_COMMIT_RATIO, 0.35);
    assert.equal(edgeReleaseGoesBack({ deltaX: 137, width: 390, velocity: 0 }), true);
    assert.equal(edgeReleaseGoesBack({ deltaX: 130, width: 390, velocity: 0 }), false);
    assert.equal(edgeReleaseGoesBack({ deltaX: 60, width: 390, velocity: 0.8 }), true);
    assert.equal(edgeReleaseGoesBack({ deltaX: 200, width: 390, velocity: -0.5 }), false);
    assert.equal(edgeReleaseGoesBack({ deltaX: 0, width: 390, velocity: 1 }), false);
  });

  it("brings the page behind from the left and lifts its dim as you drag", () => {
    assert.deepEqual(edgeBackdrop(0), { offsetRatio: -0.3, dim: 0.28 });
    const done = edgeBackdrop(1);
    assert.equal(Math.abs(done.offsetRatio), 0);
    assert.equal(done.dim, 0);
    assert.deepEqual(edgeBackdrop(2), edgeBackdrop(1));
  });
});

describe("scroll restore", () => {
  it("waits until the page is tall enough to land on the saved spot", () => {
    assert.equal(restoreStep({ target: 0, maxScroll: 0 }), "scroll");
    assert.equal(restoreStep({ target: 1200, maxScroll: 400 }), "wait");
    assert.equal(restoreStep({ target: 1200, maxScroll: 1200 }), "scroll");
    assert.ok(RESTORE_TIMEOUT_MS <= 2000);
  });
});
