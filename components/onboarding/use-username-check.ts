"use client";

import { useEffect, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { normalizeUsername } from "@/lib/social/usernames";
import { ilikeExact } from "@/lib/social/username-taken";
import { checkUsername, USERNAME_CHECK_DELAY, type UsernameCheck, type UsernameLookup } from "@/lib/onboarding/username-check";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

/** The same profiles lookup sign-up runs before creating the account. */
async function remoteTaken(username: string): Promise<boolean> {
  const supabase = await loadSupabaseBrowser();
  if (!supabase) throw new Error("no client");
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", ilikeExact(username))
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Local accounts: the same list local sign-up checks. */
async function localTaken(username: string): Promise<boolean> {
  // On-device accounts only; hosted screens never load local-db.
  const { loadOrCreateLocalDb } = await import("@/lib/social/local-db");
  const db = await loadOrCreateLocalDb();
  return db.users.some((user) => normalizeUsername(user.username) === username);
}

type Result = { key: string; check: UsernameCheck };

/**
 * Debounced "available ✓" check. Returns "checking" for any name that
 * hasn't come back yet, so a stale answer never shows for a new name.
 */
export function useUsernameCheck(raw: string, enabled: boolean): UsernameCheck | { status: "checking" } {
  const { mode } = useSocial();
  const key = normalizeUsername(raw);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!enabled || !key) return;
    const lookup: UsernameLookup = mode === "supabase" ? remoteTaken : localTaken;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkUsername(key, lookup).then((check) => {
        if (!cancelled) setResult({ key, check });
      });
    }, USERNAME_CHECK_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, key, mode]);

  if (!key) return { status: "idle" };
  if (result?.key !== key) return { status: "checking" };
  return result.check;
}
