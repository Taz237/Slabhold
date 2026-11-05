"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, UsernameField } from "@/components/auth-form";
import { useUsernameCheck } from "@/components/onboarding/use-username-check";
import { useSocial } from "@/components/social-provider";
import { USERNAME_HINT, usernameFieldError } from "@/lib/auth/signup-fields";
import { DISPLAY_NAME_MAX } from "@/lib/onboarding/signup-flow";
import { normalizeUsername } from "@/lib/social/usernames";
import { TAKEN_USERNAME } from "@/lib/social/username-taken";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

const primaryButton =
  "flex h-14 w-full items-center justify-center rounded-full bg-violet-600 text-[17px] font-semibold text-white transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none";

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
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the handle we made from the email, and the name Apple or Google sent.
  if (user && seeded !== user.id) {
    setSeeded(user.id);
    setUsername(user.username);
    setDisplayName(suggestedName || user.displayName);
  }

  const current = user?.username ?? "";
  const name = normalizeUsername(username);
  const rule = usernameFieldError(username);
  const changed = name !== current;
  const check = useUsernameCheck(username, changed && (rule === null || rule === TAKEN_USERNAME));
  const shownCheck = changed ? check : ({ status: "available", value: name } as const);
  const blocked = busy || !user || rule !== null || (changed && check.status !== "available");

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
      <div className="mx-auto max-w-md pt-10" aria-busy="true">
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-zinc-200/70 motion-reduce:animate-none dark:bg-white/5" />
        <div className="mt-3 h-5 w-full animate-pulse rounded-lg bg-zinc-200/70 motion-reduce:animate-none dark:bg-white/5" />
        <div className="mt-8 h-14 w-full animate-pulse rounded-2xl bg-zinc-200/70 motion-reduce:animate-none dark:bg-white/5" />
        <div className="mt-6 h-14 w-full animate-pulse rounded-2xl bg-zinc-200/70 motion-reduce:animate-none dark:bg-white/5" />
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
        <UsernameField
          value={username}
          onChange={setUsername}
          onBlur={() => setTouched(true)}
          hint={USERNAME_HINT}
          error={touched && rule && rule !== TAKEN_USERNAME ? rule : null}
          check={shownCheck}
          onSuggest={setUsername}
        />
        <Field
          label="Display name"
          value={displayName}
          autoComplete="name"
          enterKeyHint="go"
          maxLength={DISPLAY_NAME_MAX}
          required={false}
          onChange={setDisplayName}
          placeholder={name || "Your name"}
          hint={`Shown on your profile and posts, next to @${name || "you"}.`}
        />
        {error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={blocked} className={`${primaryButton} mt-3`}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
