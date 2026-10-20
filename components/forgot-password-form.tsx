"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import {
  PASSWORD_RESET_EXPIRED,
  PASSWORD_RESET_FAILED,
  PASSWORD_RESET_SENT,
  passwordResetRedirect,
  passwordResetSendError,
} from "@/lib/auth/password-reset";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const expired = useSearchParams().get("expired") === "1";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowser();
      if (!supabase) {
        setError(PASSWORD_RESET_FAILED);
        return;
      }
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirect(window.location.origin),
      });
      const message = passwordResetSendError(resetError);
      if (message) {
        setError(message);
        return;
      }
      setSent(true);
    } catch {
      setError(PASSWORD_RESET_FAILED);
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
        <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
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
          <button
            type="submit"
            disabled={busy}
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
