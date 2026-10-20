"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Captcha, type CaptchaHandle } from "@/components/captcha";
import { Logo } from "@/components/logo";
import { CAPTCHA_LOAD_FAILED, releaseCaptcha, submitBlocked, turnstileSiteKey } from "@/lib/auth/captcha";
import {
  PASSWORD_RESET_EXPIRED,
  PASSWORD_RESET_FAILED,
  PASSWORD_RESET_SENT,
  passwordResetEmailOptions,
  passwordResetSendError,
} from "@/lib/auth/password-reset";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const pathname = usePathname();
  const expired = useSearchParams().get("expired") === "1";
  const captchaRef = useRef<CaptchaHandle>(null);
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaTokenState] = useState<string | null>(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const captchaTokenRef = useRef<string | null>(null);
  function setCaptchaToken(token: string | null) {
    captchaTokenRef.current = token;
    setCaptchaTokenState(token);
  }
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sent || captchaToken || !turnstileSiteKey()) return;
    const timer = window.setTimeout(() => {
      if (captchaTokenRef.current) return;
      setCaptchaFailed(true);
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [sent, captchaToken]);

  function showError(message: string) {
    setError(message);
    releaseCaptcha(captchaRef.current, () => setCaptchaToken(null));
  }

  async function submit(e: React.FormEvent) {
    if (submitBlocked(busy, captchaToken)) return;
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowser();
      if (!supabase) {
        showError(PASSWORD_RESET_FAILED);
        return;
      }
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        passwordResetEmailOptions(window.location.origin, captchaToken),
      );
      const message = passwordResetSendError(resetError);
      if (message) {
        showError(message);
        return;
      }
      setSent(true);
      releaseCaptcha(captchaRef.current, () => setCaptchaToken(null));
    } catch {
      showError(PASSWORD_RESET_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Logo />
        <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Forgot password</h1>
      {expired && !sent ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{PASSWORD_RESET_EXPIRED}</p>
      ) : null}
      {sent ? (
        <>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{PASSWORD_RESET_SENT}</p>
          <Link href="/login" className="mt-5 block text-sm font-medium text-zinc-500">
            Back to log in
          </Link>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e);
          }}
          className="mt-5 space-y-3"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-500">Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@email.com"
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/5"
            />
          </label>
          {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
          <Captcha
            key={pathname}
            ref={captchaRef}
            onToken={(token) => {
              setCaptchaToken(token);
              setCaptchaFailed(false);
            }}
            onExpire={() => setCaptchaToken(null)}
            onFail={() => {
              setCaptchaToken(null);
              setCaptchaFailed(true);
            }}
          />
          {captchaFailed ? <p className="text-sm text-rose-600 dark:text-rose-400">{CAPTCHA_LOAD_FAILED}</p> : null}
          <button
            type="submit"
            disabled={submitBlocked(busy, captchaToken)}
            className="w-full rounded-full bg-[#7C3AED] py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Send reset link
          </button>
          <Link href="/login" className="block py-2 text-center text-sm font-medium text-zinc-500">
            Back to log in
          </Link>
        </form>
      )}
    </div>
  );
}
