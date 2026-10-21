import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isAuthPage } from "./guest-paths";
import {
  PASSWORD_RESET_EXPIRED,
  PASSWORD_RESET_FAILED,
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

  it("shows the sent message for a rate limit so an account cannot be confirmed", () => {
    const hidden = "No user found for that email";
    const failed = passwordResetSendError({ message: hidden, status: 400 });
    assert.equal(failed, PASSWORD_RESET_FAILED);
    assert.equal(failed?.includes("user found"), false);
    assert.equal(
      passwordResetSendError({ message: "Email rate limit exceeded", status: 429 }),
      null,
    );
    assert.equal(
      passwordResetSendError({ code: "over_email_send_rate_limit", message: hidden }),
      null,
    );
    assert.equal(
      passwordResetSendError({
        message: "For security purposes, you can only request this after 60 seconds.",
      }),
      null,
    );
    assert.equal(passwordResetSendError(null), null);
    const source = readFileSync(join(process.cwd(), "lib/auth/password-reset.ts"), "utf8");
    assert.equal(source.includes("Too many tries"), false);
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
    assert.match(forgot, /passwordResetEmailOptions\(window\.location\.origin, captchaToken\)/);
    assert.match(
      readFileSync(join(root, "lib/auth/password-reset.ts"), "utf8"),
      /redirectTo: passwordResetRedirect\(origin\)/,
    );
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
    assert.match(reset, /Password updated/);
    assert.match(reset, /setUpdated\(true\)/);
    assert.match(reset, /aria-pressed=\{showPassword\}/);
    assert.match(reset, /aria-label="Show password"/);
    assert.match(reset, /aria-pressed=\{showPassword\}/);
    assert.match(reset, /className="grid h-11 w-11 shrink-0 place-items-center rounded-xl/);
    assert.match(reset, /type=\{showPassword \? "text" : "password"\}/);
    assert.match(reset, /href="\/login"/);
    assert.match(callback, /handleAuthConfirm/);
    assert.match(confirm, /authConfirmFailurePath/);
    assert.match(confirm, /searchParams\.get\("error"\)/);
    assert.match(confirm, /searchParams\.get\("error_code"\)/);
  });
});
