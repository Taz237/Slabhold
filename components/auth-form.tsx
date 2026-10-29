"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Eye, EyeOff, MailCheck } from "lucide-react";
import { Captcha, useCaptchaWatch, type CaptchaHandle } from "@/components/captcha";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";
import { useUsernameCheck } from "@/components/onboarding/use-username-check";
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
  RESEND_FAILED,
  TURNSTILE_CONTINUE,
  USERNAME_HINT,
  emailFieldError,
  loginResendFeedback,
  passwordFieldError,
  resendCooldownSeconds,
  showTurnstileContinue,
  signupNow,
  signupResendFeedback,
  usernameFieldError,
} from "@/lib/auth/signup-fields";
import {
  DISPLAY_NAME_MAX,
  SIGNUP_STEPS,
  displayNameFor,
  nextSignupStep,
  openMailTarget,
  passwordStrength,
  previousSignupStep,
  signupProgress,
  signupStepBlocked,
  stepForSignupError,
  type SignupStep,
} from "@/lib/onboarding/signup-flow";
import { TAKEN_USERNAME } from "@/lib/social/username-taken";
import { readStoredUtm } from "@/lib/utm";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type SignupField = "username" | "email" | "password";

const STEP_FIELD: Record<SignupStep, SignupField | null> = {
  email: "email",
  password: "password",
  username: "username",
  name: null,
};

const STEP_COPY: Record<SignupStep, { title: string; lead: string }> = {
  email: { title: "What's your email?", lead: "You'll confirm it in a minute. We never share it." },
  password: { title: "Make a password", lead: "At least 6 characters. Longer is safer." },
  username: { title: "Pick a username", lead: "This is your @handle on Slabhold." },
  name: { title: "What should we call you?", lead: "Your display name. You can change it any time." },
};

const STEP_IN = "motion-safe:animate-[add-step-in_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
const STEP_BACK = "motion-safe:animate-[add-step-back_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";

const primaryButton =
  "flex h-14 w-full items-center justify-center rounded-full bg-violet-600 text-[17px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(124,58,237,0.8)] transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none";
const secondaryButton =
  "flex h-14 w-full items-center justify-center rounded-full border border-zinc-300 text-[16px] font-semibold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:border-white/15";
const quietLink =
  "flex min-h-11 w-full items-center justify-center text-center text-[15px] font-medium text-zinc-500 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none";
const errorText = "text-sm text-rose-600 dark:text-rose-400";

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
  const [nameEdited, setNameEdited] = useState(false);
  const [step, setStep] = useState<SignupStep>("email");
  const [direction, setDirection] = useState<1 | -1>(1);
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
  const usernameRule = usernameFieldError(username);
  const usernameCheck = useUsernameCheck(
    username,
    mode === "signup" && (usernameRule === null || usernameRule === TAKEN_USERNAME),
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
      // Send them back to the field that needs fixing.
      const fix = mode === "login" ? null : stepForSignupError(result.error);
      if (fix) {
        setDirection(-1);
        setStep(fix);
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
      } else {
        setResendNotice("Sent. Check your inbox again.");
      }
    } catch {
      setResendError(RESEND_FAILED);
    } finally {
      setResendBusy(false);
      releaseCaptcha(resendCaptchaRef.current, () => setResendToken(null));
    }
  }

  /** Wrong email: back to the first step with everything else kept. */
  function changeEmail() {
    setConfirmEmail(null);
    setResendError(null);
    setResendNotice(null);
    setResendToken(null);
    setError(null);
    setDirection(-1);
    setStep("email");
  }

  function goBack() {
    const previous = previousSignupStep(step);
    if (previous === "exit") {
      router.push(authLogoHref(next));
      return;
    }
    setError(null);
    setDirection(-1);
    setStep(previous);
  }

  function advance() {
    const field = STEP_FIELD[step];
    if (field) touch(field);
    const usernameState = usernameCheck.status;
    if (signupStepBlocked(step, { email, password, username, displayName }, usernameState)) return;
    const following = nextSignupStep(step);
    if (following === "submit") return;
    if (following === "name") setDisplayName(displayNameFor({ current: displayName, username, edited: nameEdited }));
    setError(null);
    setDirection(1);
    setStep(following);
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
    const mail = openMailTarget(confirmEmail, typeof navigator === "undefined" ? "" : navigator.userAgent);
    return (
      <div className={`mx-auto max-w-md ${AUTH_FORM_SCROLL}`}>
        <AuthTopBar homeHref={authLogoHref(next)} backHref={authLogoHref(next)} backLabel="Back to Slabhold" />
        <div className="mt-8 flex flex-col items-center text-center motion-safe:animate-[add-fade_300ms_ease-out_both]">
          <span className="relative grid h-20 w-20 place-items-center rounded-[1.6rem] bg-gradient-to-b from-[#7C3AED] to-[#5B21B6] text-white shadow-[0_18px_50px_-12px_rgba(124,58,237,0.9)]">
            <MailCheck aria-hidden className="h-9 w-9" strokeWidth={1.8} />
          </span>
          <h1 className="mt-6 text-[28px] font-extrabold leading-tight tracking-tight">Check your email</h1>
          <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">We sent a confirmation link to</p>
          <p className="mt-1 max-w-full truncate rounded-full bg-violet-600/10 px-3 py-1 font-mono text-[14px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-[#A78BFA]">
            {confirmEmail}
          </p>
          <p className="mt-3 text-sm leading-5 text-zinc-500">
            Tap the link to finish. It usually lands within a minute. Check spam too.
          </p>
        </div>
        <div className="mt-7 space-y-3">
          <a
            href={mail.href}
            target={mail.external ? "_blank" : undefined}
            rel={mail.external ? "noopener noreferrer" : undefined}
            className={primaryButton}
          >
            {mail.label}
          </a>
          {resendError ? <p className={`${errorText} text-center`}>{resendError}</p> : null}
          {resendNotice ? <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">{resendNotice}</p> : null}
          <Captcha
            key={`${pathname}-confirm`}
            ref={resendCaptchaRef}
            quiet
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
            <p className={errorText}>{CAPTCHA_LOAD_FAILED}</p>
          ) : null}
          {showTurnstileContinue(turnstileSiteKey(), resendToken) && resendCaptchaWatch.interactive ? (
            <p className="text-center text-sm text-zinc-500">{TURNSTILE_CONTINUE}</p>
          ) : null}
          <button
            type="button"
            disabled={submitBlocked(resendBusy || resendSeconds > 0, resendToken)}
            onClick={() => void resendConfirmation()}
            className={secondaryButton}
          >
            {resendSeconds > 0 ? `Resend email in ${resendSeconds}s` : "Resend email"}
          </button>
          <button type="button" onClick={changeEmail} className={quietLink}>
            Wrong email? Change it
          </button>
          <Link href={loginPath(next)} className={quietLink}>
            Confirmed? Log in
          </Link>
        </div>
      </div>
    );
  }

  if (resendOpen) {
    return (
      <div className={`mx-auto max-w-md ${AUTH_FORM_SCROLL}`}>
        <AuthTopBar homeHref={authLogoHref(next)} backHref={authLogoHref(next)} backLabel="Back to Slabhold" />
        <h1 className="mt-8 text-[28px] font-extrabold leading-tight tracking-tight">Resend confirmation</h1>
        <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">{CONFIRM_RESEND_HINT}</p>
        {error ? <p className={`mt-3 ${errorText}`}>{error}</p> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void resendConfirmation();
          }}
          className="mt-6 space-y-3"
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
          {resendError ? <p className={errorText}>{resendError}</p> : null}
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
            <p className={errorText}>{CAPTCHA_LOAD_FAILED}</p>
          ) : null}
          {showTurnstileContinue(turnstileSiteKey(), resendToken) ? (
            <p className="text-center text-sm text-zinc-500">{TURNSTILE_CONTINUE}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitBlocked(resendBusy || resendSeconds > 0, resendToken)}
            className={primaryButton}
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
            className={quietLink}
          >
            Back to log in
          </button>
        </form>
      </div>
    );
  }

  const otherHref = mode === "login" ? signupPath(next) : loginPath(next);
  const captcha = (
    <Captcha
      key={pathname}
      ref={captchaRef}
      quiet={mode === "signup"}
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
  );
  const captchaNotes = (
    <>
      {captchaWatch.failed ? (
        <p className={errorText}>{CAPTCHA_LOAD_FAILED}</p>
      ) : null}
      {showTurnstileContinue(turnstileSiteKey(), captchaToken) ? (
        <p className="text-center text-sm text-zinc-500">
          {mode === "login" || captchaWatch.interactive ? TURNSTILE_CONTINUE : "Running a quick security check…"}
        </p>
      ) : null}
    </>
  );
  const passwordField = (
    <PasswordField
      value={password}
      onChange={setPassword}
      onBlur={mode === "signup" ? () => touch("password") : undefined}
      autoComplete={mode === "login" ? "current-password" : "new-password"}
      error={signupIssue("password")}
      hint={mode === "signup" ? passwordStrength(password).label : undefined}
      strength={mode === "signup" ? passwordStrength(password).level : undefined}
    />
  );

  if (mode === "login") {
    return (
      <div className={`mx-auto max-w-md ${AUTH_FORM_SCROLL}`}>
        <AuthTopBar homeHref={authLogoHref(next)} backHref={authLogoHref(next)} backLabel="Back to Slabhold" />
        <h1 className="mt-8 text-[28px] font-extrabold leading-tight tracking-tight">Welcome back</h1>
        <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
          Log in to your collection, your feed and your DMs.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e);
          }}
          className="mt-6 space-y-3"
        >
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@email.com"
          />
          {passwordField}
          <div className="space-y-1">
            <Link
              href="/forgot-password"
              className="hit-44 ml-auto block w-fit text-right text-sm font-medium text-zinc-500"
            >
              Forgot password?
            </Link>
          </div>
          {error ? <p className={errorText}>{error}</p> : null}
          {message ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p> : null}
          {captcha}
          {captchaNotes}
          <button
            type="submit"
            disabled={submitBlocked(busy, captchaToken)}
            className={`${primaryButton} scroll-mb-[40vh]`}
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
          <button
            type="button"
            onClick={openConfirmationResend}
            className="block min-h-11 w-full py-2 text-center text-sm font-medium text-violet-700 dark:text-violet-300"
          >
            {CONFIRM_RESEND_LINK}
          </button>
          <Link href={otherHref} className={quietLink}>
            New here? Create an account
          </Link>
        </form>

        {accountMode === "local" && (
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

  const copy = STEP_COPY[step];
  const stepNumber = SIGNUP_STEPS.indexOf(step) + 1;
  const blocked = signupStepBlocked(step, { email, password, username, displayName }, usernameCheck.status);
  const finalStep = step === "name";

  return (
    <div className={`mx-auto max-w-md ${AUTH_FORM_SCROLL}`}>
      <AuthTopBar
        homeHref={authLogoHref(next)}
        onBack={goBack}
        backLabel={step === "email" ? "Back to Slabhold" : "Back"}
        trailing={
          <span className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            {stepNumber} of {SIGNUP_STEPS.length}
          </span>
        }
      />
      <div
        role="progressbar"
        aria-label="Sign-up progress"
        aria-valuemin={1}
        aria-valuemax={SIGNUP_STEPS.length}
        aria-valuenow={stepNumber}
        aria-valuetext={`Step ${stepNumber} of ${SIGNUP_STEPS.length}`}
        className="mt-2 h-1 w-full rounded-full bg-zinc-200 dark:bg-white/10"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${signupProgress(step) * 100}%` }}
        />
      </div>

      <div key={step} className={`mt-8 ${direction === 1 ? STEP_IN : STEP_BACK}`}>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">{copy.lead}</p>
        <form
          id="signup-step"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (finalStep) {
              if (!blocked) void submit(e);
              return;
            }
            advance();
          }}
          className="mt-6 space-y-3"
        >
          {step === "email" ? (
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              focusOnMount
              value={email}
              onChange={setEmail}
              onBlur={mode === "signup" ? () => touch("email") : undefined}
              placeholder="you@email.com"
              error={signupIssue("email")}
            />
          ) : null}
          {step === "password" ? (
            <>
              {/* Lets password managers save the new password against the email. */}
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                readOnly
                tabIndex={-1}
                aria-hidden
                className="sr-only"
              />
              {passwordField}
            </>
          ) : null}
          {step === "username" ? (
            <UsernameField
              value={username}
              onChange={setUsername}
              onBlur={() => touch("username")}
              hint={USERNAME_HINT}
              error={signupIssue("username")}
              check={usernameCheck}
              onSuggest={(name) => setUsername(name)}
            />
          ) : null}
          {step === "name" ? (
            <Field
              label="Display name"
              value={displayName}
              autoComplete="name"
              enterKeyHint="go"
              focusOnMount
              maxLength={DISPLAY_NAME_MAX}
              required={false}
              onChange={(value) => {
                setNameEdited(true);
                setDisplayName(value);
              }}
              placeholder={username || "Your name"}
              hint={`Shown on your profile and posts, next to @${username}.`}
            />
          ) : null}
          {error ? <p className={errorText}>{error}</p> : null}
          {finalStep ? null : (
            <button type="submit" disabled={busy} className={primaryButton}>
              Continue
            </button>
          )}
        </form>
      </div>

      <div className="mt-3 space-y-3">
        {captcha}
        {finalStep ? (
          <>
            {captchaNotes}
            <button
              type="submit"
              form="signup-step"
              disabled={submitBlocked(busy, captchaToken)}
              className={`${primaryButton} scroll-mb-[40vh]`}
            >
              {busy ? "Creating your account…" : "Create account"}
            </button>
            <p className="text-center text-xs leading-5 text-zinc-500">
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
          </>
        ) : null}
        {step === "email" ? (
          <Link href={otherHref} className={quietLink}>
            Have an account? Log in
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function AuthTopBar({
  homeHref,
  backHref,
  onBack,
  backLabel,
  trailing,
}: {
  homeHref: string;
  backHref?: string;
  onBack?: () => void;
  backLabel: string;
  trailing?: ReactNode;
}) {
  const backClass =
    "-ml-2.5 grid h-11 w-11 place-items-center rounded-full text-zinc-700 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:text-zinc-200 dark:hover:bg-white/10";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="justify-self-start">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label={backLabel} className={backClass}>
            <ArrowLeft aria-hidden className="h-6 w-6" />
          </button>
        ) : (
          <Link href={backHref ?? homeHref} aria-label={backLabel} className={backClass}>
            <ArrowLeft aria-hidden className="h-6 w-6" />
          </Link>
        )}
      </div>
      <Link href={homeHref} aria-label="Slabhold home" className="grid h-11 w-11 place-items-center">
        <Logo className="h-8 w-8" />
      </Link>
      <div className="justify-self-end">{trailing}</div>
    </div>
  );
}

const inputClass =
  "h-14 w-full rounded-2xl border border-zinc-300 bg-white px-4 text-[17px] outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 aria-[invalid=true]:border-rose-500 motion-reduce:transition-none dark:border-white/12 dark:bg-white/[0.04] dark:placeholder:text-zinc-500";

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
  inputMode,
  enterKeyHint,
  focusOnMount,
  maxLength,
  required = true,
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
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  focusOnMount?: boolean;
  maxLength?: number;
  required?: boolean;
  hint?: string;
  error?: string | null;
}) {
  const ref = useFocusOnMount(focusOnMount);
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        ref={ref}
        required={required}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        inputMode={inputMode}
        enterKeyHint={enterKeyHint}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      {error ? (
        <span className={`mt-1.5 block ${errorText}`}>{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-sm text-zinc-500">{hint}</span>
      ) : null}
    </label>
  );
}

/** Focus the field when its step appears, so the keyboard stays up between steps. */
function useFocusOnMount(enabled = false) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus({ preventScroll: true });
  }, [enabled]);
  return ref;
}

const STRENGTH_BARS: Record<string, number> = { empty: 0, short: 1, okay: 2, good: 3, strong: 4 };

function PasswordField({
  value,
  onChange,
  onBlur,
  autoComplete,
  error,
  hint,
  strength,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoComplete: string;
  error: string | null;
  hint?: string;
  strength?: string;
}) {
  const [shown, setShown] = useState(false);
  const ref = useFocusOnMount(autoComplete === "new-password");
  const id = useId();
  const bars = strength ? STRENGTH_BARS[strength] ?? 0 : 0;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Password
      </label>
      <span className="relative block">
        <input
          ref={ref}
          id={id}
          required
          type={shown ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={autoComplete === "new-password" ? "next" : "go"}
          placeholder="At least 6 characters"
          aria-invalid={error ? true : undefined}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-14`}
        />
        <button
          type="button"
          onClick={() => setShown((current) => !current)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute top-1/2 right-1.5 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:hover:bg-white/10"
        >
          {shown ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
        </button>
      </span>
      {strength ? (
        <span aria-hidden className="mt-2.5 grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((bar) => (
            <span
              key={bar}
              className={`h-1 rounded-full transition-colors duration-200 motion-reduce:transition-none ${
                bar <= bars ? (bars <= 1 ? "bg-rose-500" : "bg-violet-500") : "bg-zinc-200 dark:bg-white/10"
              }`}
            />
          ))}
        </span>
      ) : null}
      {error ? (
        <span className={`mt-1.5 block ${errorText}`}>{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-sm text-zinc-500" aria-live="polite">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function UsernameField({
  value,
  onChange,
  onBlur,
  hint,
  error,
  check,
  onSuggest,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  hint: string;
  error: string | null;
  check: ReturnType<typeof useUsernameCheck>;
  onSuggest: (name: string) => void;
}) {
  const ref = useFocusOnMount(true);
  const taken = check.status === "taken";
  let status: ReactNode = <span className="text-zinc-500">{hint}</span>;
  const rule = usernameFieldError(value);
  if (error) status = <span className={errorText}>{error}</span>;
  else if (rule && rule !== TAKEN_USERNAME) status = <span className="text-zinc-500">{hint}</span>;
  else if (check.status === "checking") status = <span className="text-zinc-500">Checking…</span>;
  else if (check.status === "available")
    status = (
      <span className="inline-flex items-center gap-1 font-medium text-[#7C3AED] dark:text-[#A78BFA]">
        @{check.value} is available
        <Check aria-hidden className="h-4 w-4" strokeWidth={3} />
      </span>
    );
  else if (taken)
    status = (
      <span className="flex flex-wrap items-center gap-x-2">
        <span className={errorText}>{check.message}</span>
        {check.suggestion ? (
          <button
            type="button"
            onClick={() => onSuggest(check.suggestion!)}
            className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
          >
            Try @{check.suggestion}
          </button>
        ) : null}
      </span>
    );

  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400">Username</span>
        <span className="relative block">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[17px] text-zinc-400"
          >
            @
          </span>
          <input
            ref={ref}
            required
            value={value}
            placeholder="waxroom"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            maxLength={20}
            aria-invalid={error || taken ? true : undefined}
            aria-describedby="username-status"
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </span>
      </label>
      <p id="username-status" aria-live="polite" className="mt-1.5 min-h-5 text-sm">
        {status}
      </p>
    </div>
  );
}
