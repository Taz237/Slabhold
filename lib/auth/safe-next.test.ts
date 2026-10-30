import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  afterAuthPath,
  authLogoHref,
  emailConfirmRedirect,
  landingLoginHref,
  landingSignupHref,
  pathWithQuery,
  safeNext,
  signupPath,
} from "./safe-next";

describe("safeNext", () => {
  it("accepts an internal path and a path with a query", () => {
    assert.equal(safeNext("/cards/abc"), "/cards/abc");
    assert.equal(safeNext("/u/x?tab=1"), "/u/x?tab=1");
  });

  it("rejects open redirects, schemes, and empty values", () => {
    assert.equal(safeNext("//evil.com"), "/");
    assert.equal(safeNext("https://evil.com"), "/");
    assert.equal(safeNext("cards/abc"), "/");
    assert.equal(safeNext("/\\evil.com"), "/");
    assert.equal(safeNext("/%2F%2Fevil.com"), "/");
    assert.equal(safeNext("javascript:alert(1)"), "/");
    assert.equal(safeNext(""), "/");
  });

  it("rejects control characters, encoded backslashes, and over-long values", () => {
    assert.equal(safeNext("/ok\nid"), "/");
    assert.equal(safeNext("/%5Cevil.com"), "/");
    assert.equal(safeNext(`/${"a".repeat(512)}`), "/");
  });

  it("allows a url inside the query string", () => {
    assert.equal(safeNext("/search?q=http://x"), "/search?q=http://x");
    assert.equal(safeNext("/http://evil.com"), "/");
  });

  it("keeps a safe next through the landing page and drops a bad one", () => {
    assert.equal(landingSignupHref("/collection"), "/signup?next=%2Fcollection");
    assert.equal(landingLoginHref("/collection"), "/login?next=%2Fcollection");
    assert.equal(landingSignupHref("/"), "/signup");
    assert.equal(landingLoginHref("/"), "/login");
    assert.equal(landingSignupHref(safeNext("https://evil.com")), "/signup");
    assert.equal(landingSignupHref(safeNext("//evil.com")), "/signup");
    assert.equal(authLogoHref("/u/x"), "/?next=%2Fu%2Fx");
    assert.equal(authLogoHref("/"), "/");
    assert.equal(
      signupPath(pathWithQuery("/search", "q=wemby")),
      "/signup?next=%2Fsearch%3Fq%3Dwemby",
    );
    assert.equal(safeNext(pathWithQuery("/search", "q=%2F%2Fevil.com")), "/");

    const root = process.cwd();
    const landing = readFileSync(join(root, "components/landing-page.tsx"), "utf8");
    const auth = readFileSync(join(root, "components/auth-form.tsx"), "utf8");
    const shell = readFileSync(join(root, "components/app-shell.tsx"), "utf8");
    const joinBar = readFileSync(join(root, "components/join-bar.tsx"), "utf8");
    assert.match(landing, /safeNext\(useSearchParams\(\)\.get\("next"\)\)/);
    assert.match(landing, /landingSignupHref\(next\)/);
    assert.match(landing, /landingLoginHref\(next\)/);
    assert.match(landing, /<Suspense/);
    assert.match(auth, /authLogoHref\(next\)/);
    assert.match(shell, /pathWithQuery\(pathname, search\)/);
    assert.match(shell, /loginPath\(path\)/);
    assert.doesNotMatch(shell, /signupPath\(path\)/);
    assert.match(joinBar, /pathWithQuery\(pathname, search\)/);
  });
});

describe("email confirm next", () => {
  it("passes a safe next through the confirm redirect", () => {
    assert.equal(
      emailConfirmRedirect("https://slabhold.app", "/posts/abc"),
      "https://slabhold.app/auth/confirm?next=%2Fposts%2Fabc",
    );
    assert.equal(
      emailConfirmRedirect("https://slabhold.app", "https://evil.com"),
      "https://slabhold.app/auth/confirm?next=%2F",
    );
    assert.equal(afterAuthPath("/login"), "/");
  });

  it("reads next with safeNext in login, signup, and the auth routes", () => {
    const root = process.cwd();
    const auth = readFileSync(join(root, "components/auth-form.tsx"), "utf8");
    const remote = readFileSync(join(root, "lib/social/remote.ts"), "utf8");
    const confirm = readFileSync(join(root, "lib/auth/confirm-request.ts"), "utf8");
    assert.match(auth, /safeNext\(params\.get\("next"\)\)/);
    assert.match(
      auth,
      /signUp\(\{ email, password, username, displayName, next, captchaToken: captchaToken \?\? undefined \}\)/,
    );
    assert.match(remote, /emailConfirmRedirect\(window\.location\.origin, input\.next\)/);
    assert.doesNotMatch(remote, /publicOrigin/);
    assert.match(confirm, /safeNext\(url\.searchParams\.get\("next"\)\)/);
    assert.match(readFileSync(join(root, "app/auth/callback/route.ts"), "utf8"), /handleAuthConfirm/);
    assert.match(readFileSync(join(root, "app/auth/confirm/route.ts"), "utf8"), /handleAuthConfirm/);
    assert.match(signupPath("/posts/abc"), /^\/signup\?next=%2Fposts%2Fabc$/);
  });
});

describe("logout and plain auth links", () => {
  it("sends log out to / and keeps the signup gate from stealing it", () => {
    const root = process.cwd();
    const more = readFileSync(join(root, "components/side-menu.tsx"), "utf8");
    const shell = readFileSync(join(root, "components/app-shell.tsx"), "utf8");
    assert.match(more, /markLogoutHome\(\)/);
    assert.match(more, /router\.replace\("\/"\)/);
    assert.match(shell, /if \(logoutHomePending\(\)\)/);
    assert.match(shell, /router\.replace\("\/"\)/);
  });

  it("adds the current path to plain login and signup links", () => {
    const root = process.cwd();
    for (const file of [
      "components/profile-view.tsx",
      // The top bar's Log in link (the side menu draws it through GuestAccount).
      "components/guest-account.tsx",
      "components/feed-view.tsx",
      "components/notifications-view.tsx",
      "components/messages-view.tsx",
      "components/privacy-lists.tsx",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      assert.doesNotMatch(source, /href="\/login"/);
      assert.doesNotMatch(source, /href="\/signup"/);
      assert.match(source, /loginPath\(pathname\)/);
    }
    assert.match(
      readFileSync(join(root, "components/profile-view.tsx"), "utf8"),
      /signupPath\(pathname\)/,
    );
  });
});
