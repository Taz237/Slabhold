import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { CAPTCHA_RETRY } from "./captcha";
import { loginPath } from "./safe-next";
import { normalizeUsername, usernameError } from "../social/local-db";
import {
  AUTH_FORM_SCROLL,
  PASSWORD_HINT,
  RESEND_COOLDOWN_SECONDS,
  RESEND_FAILED,
  RESEND_RATE_LIMIT,
  TURNSTILE_CONTINUE,
  USERNAME_HINT,
  emailFieldError,
  passwordFieldError,
  resendCooldownSeconds,
  showTurnstileContinue,
  CONFIRM_RESEND_LINK,
  CONFIRM_RESEND_SENT,
  EMAIL_NOT_CONFIRMED,
  signupInboxCopy,
  signupNow,
  signupResendFeedback,
  loginResendFeedback,
  isEmailNotConfirmed,
  usernameFieldError,
} from "./signup-fields";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("signup field rules", () => {
  it("uses the server username, password, and email checks", () => {
    assert.equal(usernameFieldError("  Wax_Room "), usernameError(normalizeUsername("  Wax_Room ")));
    assert.equal(usernameFieldError("ab"), usernameError("ab"));
    assert.equal(
      usernameFieldError("bad name"),
      "Usernames are 3–20 characters: letters, numbers, underscores.",
    );
    assert.equal(usernameFieldError("ok_name"), null);
    assert.equal(passwordFieldError("12345"), "Use at least 6 characters.");
    assert.equal(passwordFieldError("12345 "), null);
    assert.equal(passwordFieldError("123456"), null);
    assert.equal(emailFieldError("not-an-email"), "Enter a valid email.");
    assert.equal(emailFieldError("  A@B.com "), null);

    const local = read("lib/social/local-db.ts");
    const remote = read("lib/social/remote.ts");
    assert.match(local, /if \(!email\.includes\("@"\)\) return \{ db, error: "Enter a valid email\." \};/);
    assert.match(local, /if \(input\.password\.length < 6\) return \{ db, error: "Use at least 6 characters\." \};/);
    assert.match(remote, /if \(input\.password\.length < 6\) return \{ error: "Use at least 6 characters\." \};/);
    assert.match(read("lib/auth/signup-fields.ts"), /usernameError\(normalizeUsername\(value\)\)/);
    assert.equal(USERNAME_HINT, "Letters, numbers, and underscores. 3–20 characters.");
    assert.equal(PASSWORD_HINT, "At least 6 characters.");
  });

  it("asks for the Turnstile check only while a site key has no token", () => {
    assert.equal(TURNSTILE_CONTINUE, "Finish the check above to continue");
    assert.equal(showTurnstileContinue("site-key", null), true);
    assert.equal(showTurnstileContinue("site-key", ""), true);
    assert.equal(showTurnstileContinue("site-key", "token"), false);
    assert.equal(showTurnstileContinue("", null), false);
    assert.equal(showTurnstileContinue("  ", null), false);
  });
});

describe("signup confirmation resend", () => {
  it("names the inbox and waits 60 seconds between sends", () => {
    assert.equal(
      signupInboxCopy("ada@example.com"),
      "Check your inbox at ada@example.com to confirm your account. It usually arrives within a minute. Check spam too.",
    );
    assert.equal(RESEND_COOLDOWN_SECONDS, 60);
    const sentAt = 1_000;
    assert.equal(resendCooldownSeconds(sentAt, sentAt), 60);
    assert.equal(resendCooldownSeconds(sentAt, sentAt + 59_000), 1);
    assert.equal(resendCooldownSeconds(sentAt, sentAt + 60_000), 0);
    assert.equal(resendCooldownSeconds(0, sentAt), 0);
    const before = Date.now();
    const clock = signupNow();
    assert.ok(clock >= before && clock <= Date.now());
  });

  it("uses a friendly rate-limit message and hides the provider text", () => {
    assert.equal(signupResendFeedback(null), null);
    assert.deepEqual(signupResendFeedback({ status: 429, message: "over rate limit" }), {
      message: RESEND_RATE_LIMIT,
      rateLimited: true,
    });
    assert.deepEqual(
      signupResendFeedback({
        code: "over_email_send_rate_limit",
        message: "For security purposes, you can only request this after 60 seconds.",
      }),
      { message: RESEND_RATE_LIMIT, rateLimited: true },
    );
    assert.equal(
      signupResendFeedback({ message: "too many requests" })?.message,
      "Too many emails. Wait a minute and try again.",
    );
    assert.deepEqual(signupResendFeedback({ message: "Email address not authorized" }), {
      message: RESEND_FAILED,
      rateLimited: false,
    });
    assert.deepEqual(
      signupResendFeedback({
        code: "captcha_failed",
        message: "captcha verification process failed",
      }),
      { message: CAPTCHA_RETRY, rateLimited: false },
    );
    assert.equal(RESEND_FAILED.includes("not authorized"), false);
  });

  it("keeps login resend neutral when the address is missing or already confirmed", () => {
    assert.equal(CONFIRM_RESEND_SENT, "If that email needs confirmation, we sent another link.");
    assert.equal(CONFIRM_RESEND_LINK, "Didn't get your confirmation email? Resend it");
    assert.equal(
      EMAIL_NOT_CONFIRMED,
      "Confirm your email before logging in. You can resend it below.",
    );
    assert.equal(loginResendFeedback(null), null);
    assert.equal(
      loginResendFeedback({ code: "user_not_found", message: "User not found" }),
      null,
    );
    assert.equal(loginResendFeedback({ message: "Email address already confirmed" }), null);
    assert.equal(isEmailNotConfirmed({ code: "email_not_confirmed", message: "Email not confirmed" }), true);
    assert.equal(isEmailNotConfirmed({ message: "Email not confirmed" }), true);
    assert.equal(isEmailNotConfirmed({ message: "Invalid login credentials" }), false);
    assert.deepEqual(loginResendFeedback({ status: 429, message: "over rate limit" }), {
      message: RESEND_RATE_LIMIT,
      rateLimited: true,
    });
    assert.equal(
      loginResendFeedback({ message: "Error sending confirmation email", status: 500 })?.message,
      RESEND_FAILED,
    );
    assert.equal(CONFIRM_RESEND_SENT.includes("not found"), false);
    assert.equal(EMAIL_NOT_CONFIRMED.includes("Email not confirmed"), false);
  });
});

describe("signup form wiring", () => {
  it("sets field hints, blur checks, resend, and scroll room", () => {
    const auth = read("components/auth-form.tsx");
    assert.match(auth, /autoCapitalize="none"/);
    assert.match(auth, /autoCorrect="off"/);
    assert.match(auth, /spellCheck=\{false\}/);
    assert.match(auth, /autoComplete="username"/);
    assert.match(auth, /type="email"/);
    assert.match(auth, /autoComplete="email"/);
    assert.match(auth, /autoComplete=\{mode === "login" \? "current-password" : "new-password"\}/);
    assert.match(auth, /hint=\{USERNAME_HINT\}/);
    assert.match(auth, /hint=\{mode === "signup" \? PASSWORD_HINT : undefined\}/);
    assert.match(auth, /onBlur=\{\(\) => touch\("username"\)\}/);
    assert.match(auth, /onBlur=\{mode === "signup" \? \(\) => touch\("email"\) : undefined\}/);
    assert.match(auth, /onBlur=\{mode === "signup" \? \(\) => touch\("password"\) : undefined\}/);
    assert.match(auth, /usernameFieldError\(username\)/);
    assert.match(auth, /emailFieldError\(email\)/);
    assert.match(auth, /passwordFieldError\(password\)/);
    assert.match(auth, /\{TURNSTILE_CONTINUE\}/);
    assert.match(auth, /showTurnstileContinue\(turnstileSiteKey\(\), captchaToken\)/);
    assert.match(
      auth,
      /const targetEmail = \(confirmEmail \?\? email\)\.trim\(\)/,
    );
    assert.match(
      auth,
      /supabase\.auth\.resend\(\{\s*type: "signup",\s*email: targetEmail,\s*options: \{\s*captchaToken: resendToken \?\? undefined,\s*emailRedirectTo: emailConfirmRedirect\(window\.location\.origin, next\),\s*\},\s*\}\)/,
    );
    assert.match(auth, /showTurnstileContinue\(turnstileSiteKey\(\), resendToken\)/);
    assert.match(auth, /disabled=\{submitBlocked\(resendBusy \|\| resendSeconds > 0, resendToken\)\}/);
    assert.match(auth, /releaseCaptcha\(resendCaptchaRef\.current, \(\) => setResendToken\(null\)\)/);
    assert.match(auth, /signupInboxCopy\(confirmEmail\)/);
    assert.match(auth, /Resend email/);
    assert.match(auth, /resendCooldownSeconds\(resendAt, now\)/);
    assert.match(auth, /signupResendFeedback\(sendError\)/);
    assert.match(auth, /loginResendFeedback\(sendError\)/);
    assert.match(auth, /CONFIRM_RESEND_LINK/);
    assert.match(auth, /CONFIRM_RESEND_SENT/);
    assert.match(auth, /openConfirmationResend/);
    assert.match(auth, /if \(result\.unconfirmed\)/);
    assert.match(auth, /setResendOpen\(true\)/);
    assert.match(auth, /resendCooldownSeconds\(resendAt, signupNow\(\)\) > 0/);
    assert.doesNotMatch(auth, /sendError\.message/);
    assert.match(auth, /if \(result\.notice\) \{\s*if \(mode === "signup"\)/);
    assert.match(auth, /router\.push\(destination\)/);
    assert.match(auth, /\$\{AUTH_FORM_SCROLL\}/);
    assert.equal(AUTH_FORM_SCROLL, "pb-[45svh] min-[640px]:pb-0");
    assert.doesNotMatch(AUTH_FORM_SCROLL, /h-dvh|h-screen|overflow-hidden|max-h-/);
    assert.doesNotMatch(auth, /h-dvh|h-screen|overflow-hidden|setInterval/);

    const shell = read("components/app-shell.tsx");
    const layout = shell.slice(
      shell.indexOf("function AuthLayout"),
      shell.indexOf("function shellShowsPageWhileLoading"),
    );
    assert.match(layout, /min-h-dvh/);
    assert.doesNotMatch(layout, /(?<![\w-])h-dvh|(?<![\w-])h-screen|overflow-hidden/);
  });

  it("sends a protected deep link to log in with an encoded next", () => {
    assert.equal(loginPath("/mail-day"), "/login?next=%2Fmail-day");
    assert.equal(loginPath("/collection"), "/login?next=%2Fcollection");
    const shell = read("components/app-shell.tsx");
    const page = read("app/mail-day/page.tsx");
    assert.match(shell, /router\.replace\(loginPath\(path\)\)/);
    assert.doesNotMatch(shell, /signupPath\(path\)/);
    assert.match(page, /redirect\(loginPath\("\/mail-day"\)\)/);
    assert.doesNotMatch(page, /\/signup\?next=\/mail-day/);
  });
});
