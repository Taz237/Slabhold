import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { edgeSwipeAllowed, isRootScreen, navKind } from "./nav-motion";

describe("your own profile is the Profile tab", () => {
  it("counts /u/<own> as a root, nothing deeper and nobody else's", () => {
    assert.equal(isRootScreen("/u/Maya", "maya"), true);
    assert.equal(isRootScreen("/u/maya/", "Maya"), true);
    assert.equal(isRootScreen("/u/maya?tab=cards", "maya"), true);
    assert.equal(isRootScreen("/u/j%C3%BCrgen", "Jürgen"), true);
    assert.equal(isRootScreen("/u/jürgen", "Jürgen"), true);
    assert.equal(isRootScreen("/u/maya/followers", "maya"), false);
    assert.equal(isRootScreen("/u/maya/cards/1", "maya"), false);
    assert.equal(isRootScreen("/u/sam", "maya"), false);
    assert.equal(isRootScreen("/u/maya"), false);
    assert.equal(isRootScreen("/u/maya", null), false);
    assert.equal(isRootScreen("/u/%E0%A4%A", "maya"), false);
  });

  it("fades to your own profile and slides to someone else's", () => {
    assert.equal(navKind({ from: "/", to: "/u/maya", direction: "push", ownUsername: "Maya" }), "fade");
    assert.equal(navKind({ from: "/", to: "/u/sam", direction: "push", ownUsername: "maya" }), "forward");
    assert.equal(navKind({ from: "/u/maya", to: "/collection", direction: "back", ownUsername: "maya" }), "fade");
    assert.equal(navKind({ from: "/u/maya", to: "/u/maya/followers", direction: "push", ownUsername: "maya" }), "forward");
    // Still loading: today's behavior.
    assert.equal(navKind({ from: "/", to: "/u/maya", direction: "push", ownUsername: null }), "forward");
    assert.equal(navKind({ from: "/", to: "/u/maya", direction: "push" }), "forward");
  });

  it("has no edge back swipe on your own profile", () => {
    const base = { standalone: true, canGoBack: true, startX: 5 };
    assert.equal(edgeSwipeAllowed({ ...base, pathname: "/u/maya", ownUsername: "maya" }), false);
    assert.equal(edgeSwipeAllowed({ ...base, pathname: "/u/sam", ownUsername: "maya" }), true);
    assert.equal(edgeSwipeAllowed({ ...base, pathname: "/u/maya/followers", ownUsername: "maya" }), true);
    assert.equal(edgeSwipeAllowed({ ...base, pathname: "/u/maya" }), true);
  });

  it("gets the signed-in username from the app shell", () => {
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    assert.match(shell, /<NavMotion ownUsername=\{user\?\.username \?\? null\} \/>/);
    const motion = readFileSync(join(process.cwd(), "components/nav-motion.tsx"), "utf8");
    assert.match(motion, /export function NavMotion\(\{ ownUsername = null \}/);
    assert.equal((motion.match(/ownUsername: ownRef\.current/g) ?? []).length, 3);
  });
});
