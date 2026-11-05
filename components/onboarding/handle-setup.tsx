"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useUsernameCheck } from "@/components/onboarding/use-username-check";
import { useSocial } from "@/components/social-provider";
import { USERNAME_HINT, usernameFieldError } from "@/lib/auth/signup-fields";
import { DISPLAY_NAME_MAX } from "@/lib/onboarding/signup-flow";
import { normalizeUsername } from "@/lib/social/usernames";
import { TAKEN_USERNAME } from "@/lib/social/username-taken";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

// Same look as the sign-up form. Kept here, not imported from auth-form, so
// the login screen's code isn't split into an extra shared chunk.
const primaryButton =
  "mt-3 flex h-14 w-full items-center justify-center rounded-full bg-violet-600 text-[17px] font-semibold text-white transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none";
const inputClass =
  "h-14 w-full rounded-2xl border border-zinc-300 bg-white px-4 text-[17px] outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 aria-[invalid=true]:border-rose-500 motion-reduce:transition-none dark:border-white/12 dark:bg-white/[0.04] dark:placeholder:text-zinc-500";
const labelClass = "mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400";
const errorText = "text-rose-600 dark:text-rose-400";
const skeleton = "animate-pulse rounded-2xl bg-zinc-200/70 motion-reduce:animate-none dark:bg-white/5";

/**
 * Apple and Google sign-ups skip the email form's handle and name steps, so
 * they get them here before first-run setup. Saving writes the handle to
 * user_metadata, so this only shows once.
 */
export function HandleSetup({ next, suggestedName }: { next: string; suggestedName: string }) {
  const router = useRouter();
  const { ready, user, updateProfile } = useSocial();
  const [seeded, setSeeded] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the handle we made from the email, and the name Apple or Google sent.
  if (user && seeded !== user.id) {
    setSeeded(user.id);
    setUsername(user.username);
    setDisplayName(suggestedName || user.displayName);
  }

  const name = normalizeUsername(username);
  const rule = usernameFieldError(username);
  const changed = Boolean(user) && name !== user?.username;
  const check = useUsernameCheck(username, changed && (rule === null || rule === TAKEN_USERNAME));
  const blocked = busy || !user || rule !== null || (changed && check.status !== "available");

  let status: ReactNode = <span className="text-zinc-500">{USERNAME_HINT}</span>;
  if (rule && rule !== TAKEN_USERNAME && name.length >= 3) status = <span className={errorText}>{rule}</span>;
  else if (!changed && !rule) status = <span className="text-zinc-500">Yours now. Keep it or type a new one.</span>;
  else if (check.status === "checking") status = <span className="text-zinc-500">Checking…</span>;
  else if (check.status === "available")
    status = <span className="font-medium text-[#7C3AED] dark:text-[#A78BFA]">@{check.value} is available</span>;
  else if (check.status === "taken")
    status = (
      <span className="flex flex-wrap items-center gap-x-2">
        <span className={errorText}>{check.message}</span>
        {check.suggestion ? (
          <button
            type="button"
            onClick={() => setUsername(check.suggestion!)}
            className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
          >
            Try @{check.suggestion}
          </button>
        ) : null}
      </span>
    );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user || blocked) return;
    setBusy(true);
    setError(null);
    const finalName = displayName.trim() || name;
    if (changed || finalName !== user.displayName) {
      const result = await updateProfile({
        username: name,
        displayName: finalName,
        bio: user.bio,
        avatarDataUrl: user.avatarDataUrl,
        coverDataUrl: user.coverDataUrl,
      });
      if (result.error) {
        setError(result.error);
        setBusy(false);
        return;
      }
    }
    // Marks the handle as picked, so the next sign-in goes straight in.
    const supabase = await loadSupabaseBrowser().catch(() => null);
    await supabase?.auth.updateUser({ data: { username: name, display_name: finalName } }).catch(() => null);
    router.replace(next);
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-md pt-10" aria-busy="true" aria-label="Loading">
        <div className={`h-8 w-2/3 ${skeleton}`} />
        <div className={`mt-3 h-5 w-full ${skeleton}`} />
        <div className={`mt-8 h-14 w-full ${skeleton}`} />
        <div className={`mt-8 h-14 w-full ${skeleton}`} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-10">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Pick your handle</h1>
      <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
        This is your @handle on Slabhold. Keep the one we made or choose your own.
      </p>
      <form onSubmit={(event) => void save(event)} noValidate className="mt-6 space-y-3">
        <div>
          <label className="block">
            <span className={labelClass}>Username</span>
            <span className="relative block">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[17px] text-zinc-400">
                @
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                maxLength={20}
                aria-invalid={check.status === "taken" || (rule !== null && rule !== TAKEN_USERNAME) ? true : undefined}
                aria-describedby="handle-status"
                className={`${inputClass} pl-9`}
              />
            </span>
          </label>
          <p id="handle-status" aria-live="polite" className="mt-1.5 min-h-5 text-sm">
            {status}
          </p>
        </div>
        <label className="block">
          <span className={labelClass}>Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            enterKeyHint="go"
            maxLength={DISPLAY_NAME_MAX}
            placeholder={name || "Your name"}
            className={inputClass}
          />
          <span className="mt-1.5 block text-sm text-zinc-500">
            Shown on your profile and posts, next to @{name || "you"}.
          </span>
        </label>
        {error ? (
          <p role="alert" className={`text-sm ${errorText}`}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={blocked} className={primaryButton}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
