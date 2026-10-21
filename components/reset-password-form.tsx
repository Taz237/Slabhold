"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/logo";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setError("Password reset is unavailable right now.");
      return;
    }
    setBusy(true);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setBusy(false);
      setError("Open the reset link from your email.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setUpdated(true);
  }

  if (updated) {
    return (
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your new password is saved. Continue to Slabhold, or log in with it.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-5 h-11 w-full rounded-full bg-[#7C3AED] text-sm font-semibold text-white"
        >
          Continue
        </button>
        <Link
          href="/login"
          className="mt-3 block text-center text-sm font-medium text-zinc-600 underline dark:text-zinc-300"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Logo />
        <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-zinc-500">Then we will take you home.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-500">New password</span>
          <span className="flex items-center gap-2">
            <input
              required
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              placeholder="At least 6 characters"
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label="Show password"
              onClick={() => setShowPassword((current) => !current)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[#7C3AED] py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          Save password
        </button>
      </form>
    </div>
  );
}
