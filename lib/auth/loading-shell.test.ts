import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadingShellFor } from "./guest-paths";
import { hasSessionCookie, SESSION_HINT_SCRIPT } from "./session-hint";

describe("shell before the social snapshot lands", () => {
  it("shows public pages in the plain shell instead of a blank screen", () => {
    for (const path of [
      "/moving-today",
      "/moving-today?dir=up",
      "/u/sam",
      "/u/sam/cards/abc",
      "/posts/abc",
      "/search",
      "/leaderboard",
    ]) {
      assert.equal(loadingShellFor(path), "shell", path);
    }
  });

  it("lets Home draw its own landing page", () => {
    assert.equal(loadingShellFor("/"), "bare");
  });

  it("keeps account, auth and invite pages blank until the session is known", () => {
    for (const path of ["/collection", "/messages", "/cards/abc", "/settings/privacy"]) {
      assert.equal(loadingShellFor(path), "blank", path);
    }
    for (const path of ["/login", "/signup", "/i/sam"]) {
      assert.equal(loadingShellFor(path), "blank", path);
    }
  });

  it("keeps unknown URLs in the plain shell", () => {
    assert.equal(loadingShellFor("/nope/nope"), "plain");
  });
});

describe("session hint", () => {
  it("spots a Supabase auth cookie, whole or chunked", () => {
    assert.equal(hasSessionCookie("sb-abc123-auth-token=base64-xyz"), true);
    assert.equal(hasSessionCookie("a=1; sb-abc123-auth-token.0=base64-xyz; b=2"), true);
  });

  it("ignores other cookies and the sign-in code verifier", () => {
    assert.equal(hasSessionCookie(""), false);
    assert.equal(hasSessionCookie("utm=x; theme=dark"), false);
    assert.equal(hasSessionCookie("sb-abc123-auth-token-code-verifier=xyz"), false);
    assert.equal(hasSessionCookie("not-sb-abc-auth-token=xyz"), false);
  });

  it("ships a script that only tags <html>", () => {
    assert.match(SESSION_HINT_SCRIPT, /document\.cookie/);
    assert.match(SESSION_HINT_SCRIPT, /dataset\.session/);
    assert.equal(SESSION_HINT_SCRIPT.includes("fetch"), false);
  });
});
