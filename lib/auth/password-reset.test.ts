import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isAuthPage } from "./guest-paths";
import { PASSWORD_RESET_SENT, passwordResetRedirect } from "./password-reset";
import { safeNext } from "./safe-next";

describe("password reset", () => {
  it("builds the auth callback redirect and a single public message", () => {
    assert.equal(
      passwordResetRedirect("https://slabhold.vercel.app"),
      "https://slabhold.vercel.app/auth/callback?next=/reset-password",
    );
    assert.equal(
      passwordResetRedirect("https://slabhold.vercel.app/"),
      "https://slabhold.vercel.app/auth/callback?next=/reset-password",
    );
    assert.equal(safeNext("/reset-password"), "/reset-password");
    assert.equal(
      PASSWORD_RESET_SENT,
      "If that email has an account, we sent a reset link.",
    );
  });

  it("lets signed-out visitors open forgot and reset password", () => {
    assert.equal(isAuthPage("/forgot-password"), true);
    assert.equal(isAuthPage("/reset-password"), true);
    assert.equal(isAuthPage("/login"), true);
  });

  it("wires the login link, resetPasswordForEmail, and the new-password page", () => {
    const root = process.cwd();
    const login = readFileSync(join(root, "components/auth-form.tsx"), "utf8");
    const forgot = readFileSync(join(root, "components/forgot-password-form.tsx"), "utf8");
    const reset = readFileSync(join(root, "components/reset-password-form.tsx"), "utf8");
    const callback = readFileSync(join(root, "app/auth/callback/route.ts"), "utf8");
    assert.match(login, /Forgot password\?/);
    assert.match(login, /href="\/forgot-password"/);
    assert.match(forgot, /resetPasswordForEmail/);
    assert.match(forgot, /passwordResetRedirect\(window\.location\.origin\)/);
    assert.match(forgot, /PASSWORD_RESET_SENT/);
    assert.match(forgot, /setSent\(true\)/);
    assert.doesNotMatch(forgot, /error\.message/);
    assert.match(reset, /updateUser\(\{ password \}\)/);
    assert.match(reset, /router\.push\("\/"\)/);
    assert.match(callback, /handleAuthConfirm/);
  });
});
