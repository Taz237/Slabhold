"use client";

import { useEffect, useRef, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { leaderboardMinimums, type LeaderboardMinimums } from "@/lib/leaderboard/eligibility";
import {
  LEADERBOARD_OPT_IN_HELP,
  LEADERBOARD_OPT_IN_LABEL,
  readLeaderboardOptIn,
  type LeaderboardOptInDb,
} from "@/lib/leaderboard/opt-in";
import { publishLeaderboardOptIn, subscribeLeaderboardOptIn } from "@/lib/leaderboard/opt-in-sync";
import { setLeaderboardOptIn } from "@/lib/leaderboard/revalidate";
import { leaderboardRequirementsLine } from "@/lib/leaderboard/requirements";

const LOAD_SETTING_ERROR = "Couldn't load that setting.";
const SAVE_SETTING_ERROR = "Couldn't save that setting.";

export function LeaderboardOptInControl({
  checked,
  disabled,
  onToggle,
  minimums = leaderboardMinimums(),
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  minimums?: LeaderboardMinimums;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor="show-on-leaderboards" className="text-sm font-semibold">
          {LEADERBOARD_OPT_IN_LABEL}
        </label>
        <p id="leaderboard-opt-in-help" className="mt-1 text-sm text-zinc-500">
          {LEADERBOARD_OPT_IN_HELP}
        </p>
        <p className="mt-1 text-sm text-zinc-500">{leaderboardRequirementsLine(minimums)}</p>
      </div>
      <label htmlFor="show-on-leaderboards" className="relative mt-0.5 inline-flex shrink-0">
        <input
          id="show-on-leaderboards"
          type="checkbox"
          role="switch"
          aria-checked={checked}
          aria-describedby="leaderboard-opt-in-help"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-zinc-300 peer-checked:bg-violet-600 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-600 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--background)] dark:bg-white/20" />
        <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
        <span className="absolute -top-2.5 left-0 h-11 w-11" />
      </label>
    </div>
  );
}

export type LeaderboardToggleDeps = {
  /** Re-entry guard. A ref, so a second tap in the same frame sees it at once. */
  busyRef: { current: boolean };
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setChecked: (checked: boolean) => void;
  /** What the switch showed before this tap. Kept when the save fails. */
  previous: boolean;
  save?: (optedIn: boolean) => Promise<{ optedIn: boolean; error?: string }>;
  /** After a save that worked, with the saved value. */
  onSaved?: (optedIn: boolean) => void;
};

/** One save per tap: busy from the first moment, the old state kept on failure, cleared on every way out. */
export async function toggleLeaderboardOptIn(next: boolean, deps: LeaderboardToggleDeps): Promise<void> {
  if (deps.busyRef.current) return;
  deps.busyRef.current = true;
  deps.setBusy(true);
  deps.setError(null);
  try {
    const result = await (deps.save ?? setLeaderboardOptIn)(next);
    if (result.error) {
      deps.setChecked(deps.previous);
      deps.setError(result.error);
      return;
    }
    deps.setChecked(result.optedIn);
    deps.onSaved?.(result.optedIn);
  } catch {
    deps.setChecked(deps.previous);
    deps.setError(SAVE_SETTING_ERROR);
  } finally {
    deps.busyRef.current = false;
    deps.setBusy(false);
  }
}

export function LeaderboardOptInSwitch({
  minimums = leaderboardMinimums(),
}: {
  minimums?: LeaderboardMinimums;
} = {}) {
  const { user } = useSocial();
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    // A save from the prompt on the same screen moves this switch too.
    return subscribeLeaderboardOptIn(id, setChecked);
  }, [user?.id]);

  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    let cancel = false;
    void loadSupabaseBrowser().then(async (supabase) => {
      if (cancel) return;
      if (!supabase) {
        // Only without Supabase config (local accounts), where the switch draws nothing.
        setReady(true);
        return;
      }
      const result = await readLeaderboardOptIn(supabase as unknown as LeaderboardOptInDb, id);
      if (cancel) return;
      setChecked(result.optedIn);
      setError(result.error ?? null);
      setReady(true);
    }).catch(() => {
      // supabase-js failed to load: settle with an error instead of a disabled switch.
      if (cancel) return;
      setError(LOAD_SETTING_ERROR);
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  if (!user) return null;
  // Local accounts have no board to join.
  if (!getSupabaseConfig().configured) return null;
  const userId = user.id;

  function toggle(next: boolean) {
    return toggleLeaderboardOptIn(next, {
      busyRef,
      setBusy,
      setError,
      setChecked,
      previous: checked,
      onSaved: (optedIn) => publishLeaderboardOptIn({ userId, optedIn }),
    });
  }

  return (
    <div className="mt-3">
      <LeaderboardOptInControl
        checked={checked}
        disabled={!ready || busy}
        minimums={minimums}
        onToggle={(next) => void toggle(next)}
      />
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
