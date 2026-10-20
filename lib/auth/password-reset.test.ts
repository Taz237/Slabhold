import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isAuthPage } from "./guest-paths";
import {
  PASSWORD_RESET_EXPIRED,
  PASSWORD_RESET_FAILED,
  PASSWORD_RESET_RATE_LIMITED,
  PASSWORD_RESET_SENT,
  authConfirmFailurePath,
  passwordResetRedirect,
  passwordResetSendError,
} from "./password-reset";
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
    assert.equal(PASSWORD_RESET_EXPIRED, "That link expired. Send a new one.");
    assert.equal(
      PASSWORD_RESET_RATE_LIMITED,
      "Too many tries. Wait a minute and try again.",
    );
  });

  it("sends a failed recovery link to the request form and keeps signup on log in", () => {
    assert.equal(
      authConfirmFailurePath({
        pathname: "/auth/callback",
        next: "/reset-password",
        type: null,
      }),
      "/forgot-password?expired=1",
    );
    assert.equal(
      authConfirmFailurePath({
        pathname: "/auth/callback",
        next: null,
        type: null,
      }),
      "/forgot-password?expired=1",
    );
    assert.equal(
      authConfirmFailurePath({
        pathname: "/auth/confirm",
        next: "/",
        type: "recovery",
      }),
      "/forgot-password?expired=1",
    );
    assert.equal(
      authConfirmFailurePath({
        pathname: "/auth/confirm",
        next: "/posts/abc",
        type: "signup",
      }),
      "/login?next=%2Fposts%2Fabc",
    );
  });

  it("shows a rate limit or a generic failure without echoing the provider", () => {
    const hidden = "No user found for that email";
    const failed = passwordResetSendError({ message: hidden, status: 400 });
    assert.equal(failed, PASSWORD_RESET_FAILED);
    assert.equal(failed?.includes("user found"), false);
    assert.equal(
      passwordResetSendError({ message: "Email rate limit exceeded", status: 429 }),
      PASSWORD_RESET_RATE_LIMITED,
    );
    assert.equal(
      passwordResetSendError({ code: "over_email_send_rate_limit", message: hidden }),
      PASSWORD_RESET_RATE_LIMITED,
    );
    assert.equal(
      passwordResetSendError({
        message: "For security purposes, you can only request this after 60 seconds.",
      }),
      PASSWORD_RESET_RATE_LIMITED,
    );
    assert.equal(passwordResetSendError(null), null);
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
    const confirm = readFileSync(join(root, "lib/auth/confirm-request.ts"), "utf8");
    assert.match(login, /Forgot password\?/);
    assert.match(login, /href="\/forgot-password"/);
    assert.match(forgot, /resetPasswordForEmail/);
    assert.match(forgot, /passwordResetRedirect\(window\.location\.origin\)/);
    assert.match(forgot, /PASSWORD_RESET_SENT/);
    assert.match(forgot, /PASSWORD_RESET_EXPIRED/);
    assert.match(forgot, /PASSWORD_RESET_FAILED/);
    assert.match(forgot, /passwordResetSendError\(resetError\)/);
    assert.match(forgot, /get\("expired"\) === "1"/);
    assert.match(forgot, /setSent\(true\)/);
    assert.doesNotMatch(forgot, /error\.message/);
    assert.doesNotMatch(forgot, /resetError\.message/);
    assert.match(reset, /updateUser\(\{ password \}\)/);
    assert.match(reset, /router\.push\("\/"\)/);
    assert.match(callback, /handleAuthConfirm/);
    assert.match(confirm, /authConfirmFailurePath/);
    assert.match(confirm, /searchParams\.get\("error"\)/);
    assert.match(confirm, /searchParams\.get\("error_code"\)/);
  });
});
