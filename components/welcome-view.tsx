"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { useSocial } from "@/components/social-provider";

type Step = "welcome" | "signup" | "login";

/**
 * First screen for a signed-out visitor.
 * signUp / signIn go through SocialProvider. With NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY set, those calls use Supabase Auth.
 */
export function WelcomeView() {
  const router = useRouter();
  const { mode, signIn, signUp, status } = useSocial();
  const [step, setStep] = useState<Step>("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(next: Step) {
    setStep(next);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const result =
      step === "login"
        ? await signIn(email, password)
        : await signUp({ email, password, username, displayName });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.notice) {
      setNotice(result.notice);
      return;
    }
    router.replace("/");
  }

  async function useDemo() {
    setBusy(true);
    setError(null);
    const result = await signIn("maya@cardflip.app", "demo1234");
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace("/");
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,92,255,0.16),_transparent_50%)]" />
      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pt-[max(2.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {step === "welcome" ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-2">
              <Logo />
              <span className="text-[17px] font-bold tracking-tight">Slabhold</span>
            </div>
            <div className="flex flex-1 flex-col justify-end pb-10">
              <h1 className="text-[2rem] font-bold leading-[1.15] tracking-tight">
                Your cards.
                <br />
                Your timeline.
              </h1>
              <p className="mt-3 max-w-sm text-[15px] leading-6 text-zinc-500">
                Sign up to post pulls, follow collectors, and keep your book in one place.
              </p>
            </div>
            <div className="space-y-3">
              <button type="button" onClick={() => open("signup")} className={primaryButton}>
                Sign up
              </button>
              <button type="button" onClick={() => open("login")} className={secondaryButton}>
                Log in
              </button>
              {status ? (
                <p className="pt-1 text-center text-xs leading-5 text-rose-600 dark:text-rose-400">
                  {status}
                </p>
              ) : mode === "local" ? (
                <p className="pt-1 text-center text-xs leading-5 text-zinc-500">
                  Accounts stay in this browser until Supabase is connected.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col">
            <button
              type="button"
              onClick={() => open("welcome")}
              className="inline-flex w-fit items-center gap-1 rounded-full py-1 text-sm font-medium text-zinc-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <h1 className="mt-6 text-[1.75rem] font-bold tracking-tight">
              {step === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 text-[15px] text-zinc-500">
              {step === "signup"
                ? "Use an email, a display name, and a username."
                : "Log in with the email and password you signed up with."}
            </p>

            <div className="mt-6 space-y-3">
              {step === "signup" ? (
                <>
                  <Field
                    label="Display name"
                    value={displayName}
                    onChange={setDisplayName}
                    placeholder="Maya Chen"
                    autoComplete="name"
                  />
                  <Field
                    label="Username"
                    value={username}
                    onChange={setUsername}
                    placeholder="waxroom"
                    autoComplete="username"
                    hint="3–20 letters, numbers, or underscores."
                  />
                </>
              ) : null}
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@email.com"
                autoComplete="email"
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="At least 6 characters"
                autoComplete={step === "signup" ? "new-password" : "current-password"}
                minLength={6}
              />
            </div>

            {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
            {notice ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{notice}</p> : null}
            {status && !error ? (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{status}</p>
            ) : null}

            <div className="mt-auto space-y-3 pt-8">
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "Please wait…" : step === "signup" ? "Sign up" : "Log in"}
              </button>
              <button
                type="button"
                onClick={() => open(step === "signup" ? "login" : "signup")}
                className="w-full py-2 text-sm font-medium text-zinc-500"
              >
                {step === "signup" ? "Already have an account? Log in" : "New here? Sign up"}
              </button>
              {step === "login" && mode === "local" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void useDemo()}
                  className="w-full py-1 text-xs text-zinc-500 underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Try the demo collector Maya
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const primaryButton =
  "w-full rounded-full bg-zinc-900 py-3.5 text-[15px] font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950";

const secondaryButton =
  "w-full rounded-full border border-zinc-300 py-3.5 text-[15px] font-semibold dark:border-white/15";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  hint,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-zinc-500">{label}</span>
      <input
        required
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-zinc-200 bg-white px-3.5 py-3 text-base outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-white/5 dark:focus:border-white/30"
      />
      {hint ? <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}
