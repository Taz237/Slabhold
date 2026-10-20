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
  CAPTCHA_RETRY,
  releaseCaptcha,
  submitBlocked,
  turnstileSiteKey,
} from "./captcha";
import { PASSWORD_RESET_FAILED, passwordResetEmailOptions, passwordResetSendError } from "./password-reset";

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
        createElement(Captcha, { onToken() {}, onExpire() {} }),
      );
      assert.equal(html, "");
    });

    const captcha = read("components/captcha.tsx");
    assert.match(captcha, /if \(!siteKey\) return null/);
    assert.match(captcha, /theme: "dark"/);
    assert.match(captcha, /size: "flexible"/);
    assert.match(captcha, /onSuccess=\{onToken\}/);
    assert.match(captcha, /onExpire\(\)/);
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

    assert.deepEqual(passwordResetEmailOptions("https://slabhold.vercel.app", "turnstile-token"), {
      redirectTo: "https://slabhold.vercel.app/auth/callback?next=/reset-password",
      captchaToken: "turnstile-token",
    });
    assert.equal(passwordResetEmailOptions("https://slabhold.vercel.app", null).captchaToken, undefined);

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
    assert.equal(
      (await remoteSignIn(other.supabase, "ada@example.com", "secret1", "turnstile-token")).error,
      "Invalid login credentials",
    );

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
    assert.equal(auth.match(/releaseCaptcha\(/g)?.length, 1);

    assert.match(
      forgot,
      /function showError\(message: string\) \{\s*setError\(message\);\s*releaseCaptcha\(captchaRef\.current, \(\) => setCaptchaToken\(null\)\);\s*\}/,
    );
    assert.match(forgot, /if \(!supabase\) \{\s*showError\(PASSWORD_RESET_FAILED\);/);
    assert.match(forgot, /if \(message\) \{\s*showError\(message\);/);
    assert.match(forgot, /catch \{\s*showError\(PASSWORD_RESET_FAILED\);/);
    assert.match(forgot, /setSent\(true\)/);
    assert.equal(forgot.match(/releaseCaptcha\(/g)?.length, 1);
  });
});
