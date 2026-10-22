"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Captcha, useCaptchaWatch, type CaptchaHandle } from "@/components/captcha";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import { CAPTCHA_LOAD_FAILED, releaseCaptcha, submitBlocked, turnstileSiteKey } from "@/lib/auth/captcha";
import {
  afterAuthPath,
  authLogoHref,
  emailConfirmRedirect,
  loginPath,
  safeNext,
  signupPath,
} from "@/lib/auth/safe-next";
import {
  AUTH_FORM_SCROLL,
  CONFIRM_RESEND_HINT,
  CONFIRM_RESEND_LINK,
  CONFIRM_RESEND_SENT,
  PASSWORD_HINT,
  RESEND_FAILED,
  TURNSTILE_CONTINUE,
  USERNAME_HINT,
  emailFieldError,
  loginResendFeedback,
  passwordFieldError,
  resendCooldownSeconds,
  showTurnstileContinue,
  signupNow,
  signupInboxCopy,
  signupResendFeedback,
  usernameFieldError,
} from "@/lib/auth/signup-fields";
import { readStoredUtm } from "@/lib/utm";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type SignupField = "username" | "email" | "password";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, user, mode: accountMode, signIn, signUp } = useSocial();
  const pathname = usePathname();
  const next = safeNext(params.get("next"));
  const destination = afterAuthPath(next);
  const signedIn = Boolean(user);
  const captchaRef = useRef<CaptchaHandle>(null);
  const resendCaptchaRef = useRef<CaptchaHandle>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<SignupField, boolean>>>({});
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendToken, setResendToken] = useState<string | null>(null);
  const captchaWatch = useCaptchaWatch(
    ready && !signedIn && !confirmEmail && !resendOpen && turnstileSiteKey().length > 0,
    captchaToken,
  );
  const resendCaptchaWatch = useCaptchaWatch(
    (Boolean(confirmEmail) || resendOpen) && turnstileSiteKey().length > 0,
    resendToken,
  );

  useEffect(() => {
    if (mode !== "signup") return;
    trackEvent("signup_started");
  }, [mode]);

  useEffect(() => {
    if (!confirmEmail && !resendOpen) return;
    if (resendCooldownSeconds(resendAt, signupNow()) <= 0) return;
    const timer = window.setTimeout(() => setNow(signupNow()), 1000);
    return () => window.clearTimeout(timer);
  }, [confirmEmail, resendOpen, resendAt, now]);

  function touch(field: SignupField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function signupIssue(field: SignupField): string | null {
    if (mode !== "signup" || !touched[field]) return null;
    if (field === "username") return usernameFieldError(username);
    if (field === "email") return emailFieldError(email);
    return passwordFieldError(password);
  }

  async function submit(e: React.FormEvent) {
    if (submitBlocked(busy, captchaToken)) return;
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const result =
      mode === "login"
        ? await signIn(email, password, captchaToken ?? undefined)
        : await signUp({ email, password, username, displayName, next, captchaToken: captchaToken ?? undefined });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      if (result.unconfirmed) {
        setResendOpen(true);
        setResendError(null);
        setResendNotice(null);
        setResendToken(null);
      }
      releaseCaptcha(captchaRef.current, () => setCaptchaToken(null));
      return;
    }
    if (mode === "signup") trackEvent("signup_completed", readStoredUtm());
    releaseCaptcha(captchaRef.current, () => setCaptchaToken(null));
    if (result.notice) {
      if (mode === "signup") {
        const sentAt = signupNow();
        setConfirmEmail(email.trim());
        setResendAt(sentAt);
        setNow(sentAt);
        setResendError(null);
      } else {
        setMessage(result.notice);
      }
      return;
    }
    router.push(destination);
  }

  function openConfirmationResend() {
    setResendOpen(true);
    setResendError(null);
    setResendNotice(null);
    setResendToken(null);
    setCaptchaToken(null);
  }

  async function resendConfirmation() {
    const targetEmail = (confirmEmail ?? email).trim();
    const invalidEmail = emailFieldError(targetEmail);
    const cooling = resendCooldownSeconds(resendAt, signupNow()) > 0;
    if (invalidEmail) {
      setResendError(invalidEmail);
      return;
    }
    if (submitBlocked(resendBusy || cooling, resendToken)) return;
    setResendBusy(true);
    setResendError(null);
    setResendNotice(null);
    try {
      const supabase = createSupabaseBrowser();
      if (!supabase) {
        setResendError(RESEND_FAILED);
        return;
      }
      const { error: sendError } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail,
        options: {
          captchaToken: resendToken ?? undefined,
          emailRedirectTo: emailConfirmRedirect(window.location.origin, next),
        },
      });
      const feedback =
        mode === "login" ? loginResendFeedback(sendError) : signupResendFeedback(sendError);
      if (feedback) {
        setResendError(feedback.message);
        if (feedback.rateLimited) {
          const sentAt = signupNow();
          setResendAt(sentAt);
          setNow(sentAt);
        }
        return;
      }
      const sentAt = signupNow();
      setResendAt(sentAt);
      setNow(sentAt);
      if (mode === "login") {
        setResendNotice(CONFIRM_RESEND_SENT);
        setError(null);
      }
    } catch {
      setResendError(RESEND_FAILED);
    } finally {
      setResendBusy(false);
      releaseCaptcha(resendCaptchaRef.current, () => setResendToken(null));
    }
  }

  async function loginDemo() {
    setBusy(true);
    setError(null);
    const result = await signIn("maya@cardflip.app", "demo1234");
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(destination);
  }

  if (!ready) {
    return <div className="mx-auto h-40 max-w-md animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />;
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-lg font-medium">You&apos;re in as @{user.username}</p>
        <Link href={destination} className="mt-3 inline-block text-sm text-violet-700 dark:text-violet-300">
          Continue
        </Link>
      </div>
    );
  }

  const resendSeconds =
    confirmEmail || resendOpen ? resendCooldownSeconds(resendAt, now) : 0;

  if (confirmEmail) {
    return (
      <div className={`mx-auto max-w-md ${AUTH_FORM_SCROLL}`}>
        <Link href={authLogoHref(next)} className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{signupInboxCopy(confirmEmail)}</p>
        {resendError ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{resendError}</p> : null}
        <Captcha
          key={`${pathname}-confirm`}
          ref={resendCaptchaRef}
          onToken={(token) => {
            setResendToken(token);
            resendCaptchaWatch.onSolved();
          }}
          onExpire={() => setResendToken(null)}
          onFail={() => {
            setResendToken(null);
            resendCaptchaWatch.onFail();
          }}
          onActivity={resendCaptchaWatch.onActivity}
          onInteractive={resendCaptchaWatch.onInteractive}
        />
        {resendCaptchaWatch.failed ? (
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{CAPTCHA_LOAD_FAILED}</p>
        ) : null}
        {showTurnstileContinue(turnstileSiteKey(), resendToken) ? (
          <p className="mt-3 text-center text-sm text-zinc-500">{TURNSTILE_CONTINUE}</p>
        ) : null}
        <button
          type="button"
          disabled={submitBlocked(resendBusy || resendSeconds > 0, resendToken)}
          onClick={() => void resendConfirmation()}
          className="mt-5 w-full rounded-full bg-[#7C3AED] py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          Resend email
        </button>
        {resendSeconds > 0 ? (
          <p className="mt-2 text-center text-sm text-zinc-500">You can resend in {resendSeconds}s.</p>
        ) : null}
        <Link href={loginPath(next)} className="mt-4 block py-2 text-center text-sm font-medium text-zinc-500">
          Log in
        </Link>
      </div>
    );
  }

  if (resendOpen) {
    return (
      <div className={`mx-auto max-w-md ${AUTH_FORM_SCROLL}`}>
        <Link href={authLogoHref(next)} className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Resend confirmation</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{CONFIRM_RESEND_HINT}</p>
        {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void resendConfirmation();
          }}
          className="mt-5 space-y-3"
        >
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@email.com"
          />
          {resendNotice ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{resendNotice}</p>
          ) : null}
          {resendError ? <p className="text-sm text-rose-600 dark:text-rose-400">{resendError}</p> : null}
          <Captcha
            key={`${pathname}-resend`}
            ref={resendCaptchaRef}
            onToken={(token) => {
              setResendToken(token);
              resendCaptchaWatch.onSolved();
            }}
            onExpire={() => setResendToken(null)}
            onFail={() => {
              setResendToken(null);
              resendCaptchaWatch.onFail();
            }}
            onActivity={resendCaptchaWatch.onActivity}
            onInteractive={resendCaptchaWatch.onInteractive}
          />
          {resendCaptchaWatch.failed ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{CAPTCHA_LOAD_FAILED}</p>
          ) : null}
          {showTurnstileContinue(turnstileSiteKey(), resendToken) ? (
            <p className="text-center text-sm text-zinc-500">{TURNSTILE_CONTINUE}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitBlocked(resendBusy || resendSeconds > 0, resendToken)}
            className="w-full rounded-full bg-[#7C3AED] py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Resend email
          </button>
          {resendSeconds > 0 ? (
            <p className="mt-2 text-center text-sm text-zinc-500">You can resend in {resendSeconds}s.</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setResendOpen(false);
              setResendError(null);
              setResendNotice(null);
              setResendToken(null);
              setError(null);
            }}
            className="block min-h-11 w-full py-2 text-center text-sm font-medium text-zinc-500"
          >
            Back to log in
          </button>
        </form>
      </div>
    );
  }

  const otherHref = mode === "login" ? signupPath(next) : loginPath(next);

  return (
    <div className={`mx-auto max-w-md ${AUTH_FORM_SCROLL}`}>
      <Link href={authLogoHref(next)} className="mb-8 flex items-center gap-2">
        <Logo />
        <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">
        {mode === "login" ? "Log in" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Follow collectors, post pulls, and keep your book.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e);
        }}
        className="mt-5 space-y-3"
      >
        {mode === "signup" && (
          <>
            <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Maya Chen" />
            <Field
              label="Username"
              value={username}
              onChange={setUsername}
              onBlur={() => touch("username")}
              placeholder="waxroom"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              hint={USERNAME_HINT}
              error={signupIssue("username")}
            />
          </>
        )}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          onBlur={mode === "signup" ? () => touch("email") : undefined}
          placeholder="you@email.com"
          error={signupIssue("email")}
        />
        <Field
          label="Password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={setPassword}
          onBlur={mode === "signup" ? () => touch("password") : undefined}
          placeholder="At least 6 characters"
          hint={mode === "signup" ? PASSWORD_HINT : undefined}
          error={signupIssue("password")}
        />
        {mode === "login" ? (
          <div className="space-y-1">
            <Link href="/forgot-password" className="hit-44 ml-auto block w-fit text-right text-sm font-medium text-zinc-500">
              Forgot password?
            </Link>
            <button
              type="button"
              onClick={openConfirmationResend}
              className="block min-h-11 w-full py-2 text-center text-sm font-medium text-violet-700 dark:text-violet-300"
            >
              {CONFIRM_RESEND_LINK}
            </button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        {message ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p> : null}
        <Captcha
          key={pathname}
          ref={captchaRef}
          onToken={(token) => {
            setCaptchaToken(token);
            captchaWatch.onSolved();
          }}
          onExpire={() => setCaptchaToken(null)}
          onFail={() => {
            setCaptchaToken(null);
            captchaWatch.onFail();
          }}
          onActivity={captchaWatch.onActivity}
          onInteractive={captchaWatch.onInteractive}
        />
        {captchaWatch.failed ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{CAPTCHA_LOAD_FAILED}</p>
        ) : null}
        {showTurnstileContinue(turnstileSiteKey(), captchaToken) ? (
          <p className="text-center text-sm text-zinc-500">{TURNSTILE_CONTINUE}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitBlocked(busy, captchaToken)}
          className="w-full scroll-mb-[40vh] rounded-full bg-[#7C3AED] py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
        {mode === "signup" ? (
          <p className="text-center text-xs text-zinc-500">
            By signing up you agree to the{" "}
            <Link href="/terms" className="font-bold underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-bold underline">
              Privacy
            </Link>
            .
          </p>
        ) : null}
        <Link href={otherHref} className="block py-2 text-center text-sm font-medium text-zinc-500">
          {mode === "login" ? "New here? Sign up" : "Have an account? Log in"}
        </Link>
      </form>

      {mode === "login" && accountMode === "local" && (
        <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-4 text-sm dark:border-white/15">
          <p className="font-medium">Try a demo collector</p>
          <p className="mt-1 text-zinc-500">maya@cardflip.app · demo1234</p>
          <p className="text-zinc-500">Also jordan@cardflip.app and sam@cardflip.app</p>
          <button
            type="button"
            onClick={() => void loginDemo()}
            className="mt-3 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-white/15"
          >
            Log in as Maya
          </button>
          <p className="mt-3 text-xs text-zinc-500">
            Accounts stay in this browser until Supabase keys are in .env.local.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  autoComplete,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  autoCorrect?: string;
  spellCheck?: boolean;
  hint?: string;
  error?: string | null;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-zinc-500">{label}</span>
      <input
        required
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        aria-invalid={error ? true : undefined}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/5"
      />
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">{error}</span> : null}
    </label>
  );
}
