import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isGuestHome, paintBeforeSession, shouldSkipSocialSnapshot } from "./shell-paint";

describe("guest landing paint", () => {
  it("treats signed-out home as the landing page before a session exists", () => {
    assert.equal(isGuestHome("/", false), true);
    assert.equal(isGuestHome("/home", false), true);
    assert.equal(isGuestHome("/home/", false), true);
    assert.equal(isGuestHome("/search", false), false);
    assert.equal(isGuestHome("/", true), false);
    assert.equal(
      shouldSkipSocialSnapshot({ pathname: "/", sessionKnown: false, sessionUserId: null }),
      false,
    );
    assert.equal(
      shouldSkipSocialSnapshot({ pathname: "/", sessionKnown: true, sessionUserId: null }),
      true,
    );
    assert.equal(
      shouldSkipSocialSnapshot({
        pathname: "/",
        sessionKnown: true,
        sessionUserId: "user-1",
      }),
      false,
    );
    assert.equal(
      shouldSkipSocialSnapshot({ pathname: "/search", sessionKnown: true, sessionUserId: null }),
      false,
    );
  });

  it("renders the landing page from the shell without waiting on the snapshot", () => {
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(shell, /sessionKnown && isGuestHome\(pathname, signedIn\)/);
    assert.match(shell, /<LandingPage \/>/);
    assert.match(shell, /background-color:#09090b/);
    assert.match(provider, /shouldSkipSocialSnapshot\(/);
    assert.doesNotMatch(
      shell.slice(shell.indexOf("if (guestHome)"), shell.indexOf("if (!ready)")),
      /min-h-dvh bg-\[var\(--background\)\]/,
    );
    assert.match(
      shell.slice(shell.indexOf("if (!ready)"), shell.indexOf("if (!user && pathname")),
      /showJoin=\{sessionKnown && !signedIn && shouldShowJoinBar/,
    );
  });

  it("paints neither the landing page nor the join bar before the session is known", () => {
    const home = paintBeforeSession("/");
    assert.equal(home.showLanding, false);
    assert.equal(home.showJoinBar, false);
    assert.equal(home.showNav, false);
    assert.equal(home.showChildren, false);
    assert.equal(paintBeforeSession("/home").showChildren, false);
    assert.equal(paintBeforeSession("/collection").showChildren, false);
    assert.equal(paintBeforeSession("/collection").showJoinBar, false);

    const profile = paintBeforeSession("/u/x");
    assert.equal(profile.showJoinBar, false);
    assert.equal(profile.showLanding, false);
    assert.equal(profile.showNav, false);
    assert.equal(profile.showChildren, true);

    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    const pending = shell.slice(shell.indexOf("if (!sessionKnown)"), shell.indexOf("const guestHome"));
    assert.match(pending, /paintBeforeSession\(pathname\)/);
    assert.match(pending, /background-color:#09090b/);
    assert.match(pending, /bg-\[var\(--background\)\]/);
    assert.match(pending, /#09090b/);
    assert.doesNotMatch(pending, /<LandingPage/);
    assert.doesNotMatch(pending, /<JoinBar/);
    assert.doesNotMatch(pending, /Log in|Sign up/);
    assert.ok(shell.indexOf("if (!sessionKnown)") < shell.indexOf("const guestHome"));
  });
});
