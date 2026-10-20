"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Captcha, useCaptchaWatch, type CaptchaHandle } from "@/components/captcha";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import { CAPTCHA_INTERACTIVE, CAPTCHA_LOAD_FAILED, releaseCaptcha, submitBlocked, turnstileSiteKey } from "@/lib/auth/captcha";
import { afterAuthPath, authLogoHref, loginPath, safeNext, signupPath } from "@/lib/auth/safe-next";
import { readStoredUtm } from "@/lib/utm";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, user, mode: accountMode, signIn, signUp } = useSocial();
  const pathname = usePathname();
  const next = safeNext(params.get("next"));
  const destination = afterAuthPath(next);
  const signedIn = Boolean(user);
  const captchaRef = useRef<CaptchaHandle>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaWatch = useCaptchaWatch(ready && !signedIn && turnstileSiteKey().length > 0, captchaToken);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "signup") return;
    trackEvent("signup_started");
  }, [mode]);

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
      releaseCaptcha(captchaRef.current, () => setCaptchaToken(null));
      return;
    }
    if (mode === "signup") trackEvent("signup_completed", readStoredUtm());
    releaseCaptcha(captchaRef.current, () => setCaptchaToken(null));
    if (result.notice) {
      setMessage(result.notice);
      return;
    }
    router.push(destination);
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

  const otherHref = mode === "login" ? signupPath(next) : loginPath(next);

  return (
    <div className="mx-auto max-w-md">
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
            <Field label="Username" value={username} onChange={setUsername} placeholder="waxroom" />
          </>
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@email.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" />
        {mode === "login" ? (
          <Link href="/forgot-password" className="block text-right text-sm font-medium text-zinc-500">
            Forgot password?
          </Link>
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
        ) : captchaWatch.interactive ? (
          <p className="text-sm text-zinc-500">{CAPTCHA_INTERACTIVE}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitBlocked(busy, captchaToken)}
          className="w-full rounded-full bg-[#7C3AED] py-3 text-sm font-semibold text-white disabled:opacity-60"
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
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-zinc-500">{label}</span>
      <input
        required
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/5"
      />
    </label>
  );
}
