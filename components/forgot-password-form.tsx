"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { PASSWORD_RESET_SENT, passwordResetRedirect } from "@/lib/auth/password-reset";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      if (supabase) {
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: passwordResetRedirect(window.location.origin),
        });
      }
    } catch {
      // Missing accounts and failed sends share one message.
    }
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Logo />
        <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Forgot password</h1>
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
