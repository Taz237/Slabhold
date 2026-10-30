import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Captcha } from "../../components/captcha";
import { remoteSignIn, remoteSignUp } from "../social/remote";
import {
  CAPTCHA_LOAD_FAILED,
  CAPTCHA_RETRY,
  captchaOnActivity,
  captchaOnFail,
  captchaOnInteractive,
  captchaOnSilence,
  captchaOnToken,
  captchaWatchIdle,
  releaseCaptcha,
  submitBlocked,
  turnstileSiteKey,
} from "./captcha";
import {
  PASSWORD_RESET_FAILED,
  PASSWORD_RESET_UNAVAILABLE,
  passwordResetEmailOptions,
  passwordResetSendError,
} from "./password-reset";
import { EMAIL_NOT_CONFIRMED } from "./signup-fields";

const SITE_KEY = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function withoutSiteKey<T>(run: () => T): T {
  const previous = process.env[SITE_KEY];
  delete process.env[SITE_KEY];
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env[SITE_KEY];
    else process.env[SITE_KEY] = previous;
  }
}

const signupInput = {
  email: "ada@example.com",
  password: "secret1",
  username: "Wax_Room",
  displayName: "Ada",
  captchaToken: "turnstile-token",
};

function signUpClient(error: { message: string; code?: string } | null = null) {
  let credentials: {
    options?: { captchaToken?: string; data?: { username: string; display_name: string } };
  } | null = null;
  const supabase = {
    from() {
      const api = {
        select() {
          return api;
        },
        ilike() {
          return api;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
      };
      return api;
    },
    auth: {
      async signUp(input: typeof credentials) {
        credentials = input;
        return { data: { session: null, user: null }, error };
      },
      async getSession() {
        return { data: { session: null } };
      },
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    credentials: () => credentials,
  };
}

function signInClient(error: { message: string; code?: string } | null) {
  let credentials: { options?: { captchaToken?: string } } | null = null;
  const supabase = {
    auth: {
      async signInWithPassword(input: typeof credentials) {
        credentials = input;
        return { data: { user: null, session: null }, error };
      },
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    credentials: () => credentials,
  };
}

describe("captcha submit gate", () => {
  it("disables submit until there is a token", () => {
    assert.equal(submitBlocked(false, null, "site-key"), true);
    assert.equal(submitBlocked(false, "", "site-key"), true);
    assert.equal(submitBlocked(false, "turnstile-token", "site-key"), false);
    assert.equal(submitBlocked(true, "turnstile-token", "site-key"), true);

    const auth = read("components/auth-form.tsx");
    const forgot = read("components/forgot-password-form.tsx");
    assert.match(auth, /disabled=\{submitBlocked\(busy, captchaToken\)\}/);
    assert.match(forgot, /disabled=\{submitBlocked\(busy, captchaToken\)\}/);
    assert.ok(auth.indexOf("<Captcha") < auth.indexOf('type="submit"'));
    assert.ok(forgot.indexOf("<Captcha") < forgot.indexOf('type="submit"'));
  });

  it("does not block submit or render a widget when the site key is missing", () => {
    withoutSiteKey(() => {
      assert.equal(turnstileSiteKey(), "");
      assert.equal(submitBlocked(false, null), false);
      const html = renderToStaticMarkup(
        createElement(Captcha, {
          onToken() {},
          onExpire() {},
          onFail() {},
          onActivity() {},
          onInteractive() {},
        }),
      );
      assert.equal(html, "");
    });

    const captcha = read("components/captcha.tsx");
    assert.match(captcha, /if \(!siteKey\) return null/);
    assert.match(captcha, /theme: "light"/);
    assert.match(captcha, /size: "flexible"/);
    assert.match(captcha, /onSuccess=\{onToken\}/);
    assert.match(captcha, /onExpire\(\)/);
    assert.match(captcha, /onWidgetLoad=\{\(\) => \{\s*onExpire\(\);\s*onActivity\(\);\s*\}\}/);
    assert.match(captcha, /onBeforeInteractive=\{\(\) => \{\s*onExpire\(\);\s*onInteractive\(true\);\s*\}\}/);
    assert.match(captcha, /onAfterInteractive=\{\(\) => \{\s*onInteractive\(false\);\s*\}\}/);
    assert.match(captcha, /onError=\{\(\) => \{\s*onExpire\(\);\s*onFail\(\);\s*\}\}/);
    assert.match(captcha, /onTimeout=\{\(\) => \{\s*onExpire\(\);\s*\}\}/);
    assert.doesNotMatch(captcha, /onTimeout=\{[^}]*onFail/);
    assert.match(captcha, /onUnsupported=\{onFail\}/);
    assert.match(captcha, /scriptOptions=\{\{ onError: onFail \}\}/);
    assert.match(captcha, /return \(\) => \{\s*onExpireRef\.current\(\);\s*\};/);
  });
});

describe("captcha token on supabase auth", () => {
  it("passes the token to signUp, signInWithPassword, and resetPasswordForEmail", async () => {
    const signUp = signUpClient();
    await remoteSignUp(signUp.supabase, signupInput);
    assert.equal(signUp.credentials()?.options?.captchaToken, "turnstile-token");
    assert.deepEqual(signUp.credentials()?.options?.data, {
      username: "wax_room",
      display_name: "Ada",
    });

    const signIn = signInClient(null);
    assert.deepEqual(await remoteSignIn(signIn.supabase, "ada@example.com", "secret1", "turnstile-token"), {});
    assert.deepEqual(signIn.credentials(), {
      email: "ada@example.com",
      password: "secret1",
      options: { captchaToken: "turnstile-token" },
    });

    assert.deepEqual(passwordResetEmailOptions("https://slabhold.app", "turnstile-token"), {
      redirectTo: "https://slabhold.app/auth/callback?next=/reset-password",
      captchaToken: "turnstile-token",
    });
    assert.equal(passwordResetEmailOptions("https://slabhold.app", null).captchaToken, undefined);

    const auth = read("components/auth-form.tsx");
    const forgot = read("components/forgot-password-form.tsx");
    const provider = read("components/social-provider.tsx");
    assert.match(auth, /signIn\(email, password, captchaToken \?\? undefined\)/);
    assert.match(
      auth,
      /signUp\(\{ email, password, username, displayName, next, captchaToken: captchaToken \?\? undefined \}\)/,
    );
    assert.match(provider, /remoteSignIn\(client, email, password, captchaToken\)/);
    assert.match(
      forgot,
      /resetPasswordForEmail\(\s*email\.trim\(\),\s*passwordResetEmailOptions\(window\.location\.origin, captchaToken\),\s*\)/,
    );
  });

  it("shows the captcha retry message and leaves other errors alone", async () => {
    const captcha = signInClient({
      code: "captcha_failed",
      message: "captcha verification process failed",
    });
    assert.equal(
      (await remoteSignIn(captcha.supabase, "ada@example.com", "secret1", "used-token")).error,
      CAPTCHA_RETRY,
    );
    assert.equal(CAPTCHA_RETRY, "Please complete the check and try again.");

    const other = signInClient({ message: "Invalid login credentials" });
    const invalid = await remoteSignIn(other.supabase, "ada@example.com", "secret1", "turnstile-token");
    assert.equal(invalid.error, "Invalid login credentials");
    assert.equal(invalid.unconfirmed, undefined);

    const unconfirmed = signInClient({
      message: "Email not confirmed",
      code: "email_not_confirmed",
    });
    const waiting = await remoteSignIn(unconfirmed.supabase, "ada@example.com", "secret1", "turnstile-token");
    assert.equal(waiting.error, EMAIL_NOT_CONFIRMED);
    assert.equal(waiting.unconfirmed, true);
    assert.equal(waiting.error?.includes("Email not confirmed"), false);

    const signUp = signUpClient({
      code: "captcha_failed",
      message: "captcha protection: request disallowed",
    });
    assert.equal((await remoteSignUp(signUp.supabase, signupInput)).error, CAPTCHA_RETRY);

    assert.equal(
      passwordResetSendError({ code: "captcha_failed", message: "captcha verification process failed" }),
      CAPTCHA_RETRY,
    );
    assert.equal(
      passwordResetSendError({ message: "No user found for that email", status: 400 }),
      null,
    );
    assert.equal(
      passwordResetSendError({ message: "Error sending recovery email", status: 500 }),
      PASSWORD_RESET_UNAVAILABLE,
    );
    assert.equal(
      passwordResetSendError({ message: "Unable to validate email address", status: 400 }),
      PASSWORD_RESET_FAILED,
    );
  });
});

describe("captcha reset", () => {
  it("resets the widget after an error so the next try gets a fresh token", () => {
    const order: string[] = [];
    releaseCaptcha(
      {
        reset() {
          order.push("reset");
        },
      },
      () => {
        order.push("clear");
      },
    );
    assert.deepEqual(order, ["clear", "reset"]);

    const auth = read("components/auth-form.tsx");
    const forgot = read("components/forgot-password-form.tsx");
    const authError = auth.slice(auth.indexOf("if (result.error)"), auth.indexOf("if (mode === \"signup\")"));
    assert.match(authError, /releaseCaptcha\(captchaRef\.current, \(\) => setCaptchaToken\(null\)\)/);
    assert.equal(auth.match(/releaseCaptcha\(/g)?.length, 3);
    assert.match(auth, /releaseCaptcha\(resendCaptchaRef\.current, \(\) => setResendToken\(null\)\)/);
    const authSuccess = auth.slice(auth.indexOf('if (mode === "signup") trackEvent'));
    assert.ok(authSuccess.indexOf("releaseCaptcha(") < authSuccess.indexOf("if (result.notice)"));

    assert.match(
      forgot,
      /function showError\(message: string\) \{\s*setError\(message\);\s*releaseCaptcha\(captchaRef\.current, \(\) => setCaptchaToken\(null\)\);\s*\}/,
    );
    assert.match(forgot, /if \(!supabase\) \{\s*showError\(PASSWORD_RESET_FAILED\);/);
    assert.match(forgot, /if \(message\) \{\s*showError\(message\);/);
    assert.match(forgot, /catch \{\s*showError\(PASSWORD_RESET_UNAVAILABLE\);/);
    assert.match(forgot, /setSent\(true\);\s*releaseCaptcha\(captchaRef\.current, \(\) => setCaptchaToken\(null\)\);/);
    assert.equal(forgot.match(/releaseCaptcha\(/g)?.length, 2);
  });
});

describe("captcha load failure", () => {
  it("drops a stale token, blocks a submit with none, and explains a failed load", () => {
    assert.equal(
      CAPTCHA_LOAD_FAILED,
      "We couldn't load the security check. Turn off ad blockers for this site or try another browser, then reload.",
    );
    const idle = captchaWatchIdle();
    assert.equal(captchaOnSilence(idle).failed, true);

    const live = captchaOnActivity(idle);
    assert.equal(live.armed, false);
    assert.equal(captchaOnSilence(live).failed, false);

    const waiting = captchaOnInteractive(idle, true);
    assert.equal(waiting.interactive, true);
    assert.equal(waiting.failed, false);
    assert.equal(waiting.armed, false);
    assert.equal(captchaOnSilence(waiting), waiting);
    assert.equal(captchaOnSilence(captchaOnActivity(waiting)).failed, false);

    const solved = captchaOnInteractive(waiting, false);
    assert.equal(solved.interactive, false);
    assert.equal(solved.failed, false);
    assert.equal(solved.armed, true);
    assert.equal(captchaOnSilence(solved).failed, true);
    assert.equal(captchaOnToken().failed, false);
    assert.equal(captchaOnFail().failed, true);
    assert.equal(captchaOnFail().interactive, false);

    const captcha = read("components/captcha.tsx");
    assert.match(captcha, /onFail: \(\) => void/);
    assert.match(captcha, /onActivity: \(\) => void/);
    assert.match(captcha, /onInteractive: \(waiting: boolean\) => void/);
    assert.match(captcha, /15_000/);
    assert.match(captcha, /if \(!enabled \|\| token \|\| !watch\.armed\) return/);
    assert.match(captcha, /setWatch\(\(current\) => captchaOnSilence\(current\)\);/);

    for (const path of ["components/auth-form.tsx", "components/forgot-password-form.tsx"]) {
      const source = read(path);
      assert.match(source, /async function submit\(e: React\.FormEvent\) \{\s*if \(submitBlocked\(busy, captchaToken\)\) return;/);
      assert.match(source, /key=\{pathname\}/);
      assert.match(source, /useCaptchaWatch\(/);
      assert.match(source, /onActivity=\{captchaWatch\.onActivity\}/);
      assert.match(source, /onInteractive=\{captchaWatch\.onInteractive\}/);
      assert.match(
        source,
        /onToken=\{\(token\) => \{\s*setCaptchaToken\(token\);\s*captchaWatch\.onSolved\(\);\s*\}\}/,
      );
      assert.match(source, /onFail=\{\(\) => \{\s*setCaptchaToken\(null\);\s*captchaWatch\.onFail\(\);\s*\}\}/);
      assert.match(source, /captchaWatch\.failed \? \(/);
      assert.match(source, /\{CAPTCHA_LOAD_FAILED\}/);
      assert.doesNotMatch(source, /CAPTCHA_INTERACTIVE/);
      assert.doesNotMatch(source, /Tap the box above/);
    }

    const privacy = read("app/(app)/privacy/page.tsx");
    assert.match(
      privacy,
      /We use Cloudflare Turnstile on sign-up, log-in and password reset forms to block bots\.\s+Cloudflare processes your IP address and browser signals for this check\./,
    );
  });
});
