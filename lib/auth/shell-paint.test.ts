import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isGuestHome, shouldSkipSocialSnapshot } from "./shell-paint";

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
    assert.match(shell, /isGuestHome\(pathname, signedIn\)/);
    assert.match(shell, /<LandingPage \/>/);
    assert.match(shell, /background-color:#09090b/);
    assert.match(provider, /shouldSkipSocialSnapshot\(/);
    assert.doesNotMatch(
      shell.slice(shell.indexOf("if (guestHome)"), shell.indexOf("if (!ready)")),
      /min-h-dvh bg-\[var\(--background\)\]/,
    );
  });
});
