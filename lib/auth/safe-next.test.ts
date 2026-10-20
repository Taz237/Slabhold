import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  afterAuthPath,
  emailConfirmRedirect,
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
});

describe("email confirm next", () => {
  it("passes a safe next through the confirm redirect", () => {
    assert.equal(
      emailConfirmRedirect("https://slabhold.vercel.app", "/posts/abc"),
      "https://slabhold.vercel.app/auth/confirm?next=%2Fposts%2Fabc",
    );
    assert.equal(
      emailConfirmRedirect("https://slabhold.vercel.app", "https://evil.com"),
      "https://slabhold.vercel.app/auth/confirm?next=%2F",
    );
    assert.equal(afterAuthPath("/login"), "/");
  });

  it("reads next with safeNext in login, signup, and the auth routes", () => {
    const root = process.cwd();
    const auth = readFileSync(join(root, "components/auth-form.tsx"), "utf8");
    const remote = readFileSync(join(root, "lib/social/remote.ts"), "utf8");
    const confirm = readFileSync(join(root, "lib/auth/confirm-request.ts"), "utf8");
    assert.match(auth, /safeNext\(params\.get\("next"\)\)/);
    assert.match(auth, /signUp\(\{ email, password, username, displayName, next \}\)/);
    assert.match(remote, /emailConfirmRedirect\(/);
    assert.match(confirm, /safeNext\(url\.searchParams\.get\("next"\)\)/);
    assert.match(readFileSync(join(root, "app/auth/callback/route.ts"), "utf8"), /handleAuthConfirm/);
    assert.match(readFileSync(join(root, "app/auth/confirm/route.ts"), "utf8"), /handleAuthConfirm/);
    assert.match(signupPath("/posts/abc"), /^\/signup\?next=%2Fposts%2Fabc$/);
  });
});
