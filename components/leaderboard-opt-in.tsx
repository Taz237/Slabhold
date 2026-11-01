"use client";

import { useEffect, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import {
  isLeaderboardEligible,
  leaderboardMinimums,
  type LeaderboardMinimums,
} from "@/lib/leaderboard/eligibility";
import {
  LEADERBOARD_OPT_IN_HELP,
  LEADERBOARD_OPT_IN_LABEL,
  leaderboardPromptDismissKey,
  leaderboardPromptVisible,
  readLeaderboardOptIn,
  type LeaderboardOptInDb,
} from "@/lib/leaderboard/opt-in";
import { setLeaderboardOptIn } from "@/lib/leaderboard/revalidate";
import { leaderboardRequirementsLine } from "@/lib/leaderboard/requirements";

const LOAD_SETTING_ERROR = "Couldn't load that setting.";

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
        <label htmlFor="show-on-leaderboards" className="text-sm font-bold">
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

export function LeaderboardOptInSwitch({
  minimums = leaderboardMinimums(),
}: {
  minimums?: LeaderboardMinimums;
} = {}) {
  const { user } = useSocial();
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    let cancel = false;
    void loadSupabaseBrowser().then(async (supabase) => {
      if (cancel) return;
      if (!supabase) {
        setError(LOAD_SETTING_ERROR);
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

  async function toggle(next: boolean) {
    if (!user?.id) return;
    setBusy(true);
    setError(null);
    const result = await setLeaderboardOptIn(next);
    setBusy(false);
    setChecked(result.optedIn);
    setError(result.error ?? null);
  }

  if (!user) return null;

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

export function LeaderboardPrompt({
  valuedCards,
  value,
  publicCollection,
  ready,
  minimums = leaderboardMinimums(),
  accountCreatedAt,
}: {
  valuedCards: number;
  value: number;
  publicCollection: boolean;
  ready: boolean;
  minimums?: LeaderboardMinimums;
  accountCreatedAt?: string | null;
}) {
  const { user } = useSocial();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const account = user;
    if (!account || !ready) return;
    const id = account.id;
    let cancel = false;
    void loadSupabaseBrowser().then(async (supabase) => {
      if (!supabase || cancel) return;
      const result = await readLeaderboardOptIn(supabase as unknown as LeaderboardOptInDb, id);
      if (cancel || result.error) return;
      let dismissed = false;
      try {
        dismissed = window.localStorage.getItem(leaderboardPromptDismissKey(id)) === "1";
      } catch {
        dismissed = false;
      }
      const eligible = isLeaderboardEligible({
        optedIn: true,
        publicCollection,
        valuedCards,
        value,
        username: account.username,
        isTest: account.isTest === true,
        accountCreatedAt: accountCreatedAt === undefined ? account.createdAt : accountCreatedAt,
        minCards: minimums.minCards,
        minValue: minimums.minValue,
        minAccountDays: minimums.minAccountDays,
      });
      setVisible(
        leaderboardPromptVisible({
          eligible,
          optedIn: result.optedIn,
          dismissed,
        }),
      );
    }).catch(() => {
      // supabase-js failed to load: the prompt stays hidden.
    });
    return () => {
      cancel = true;
    };
  }, [accountCreatedAt, minimums, publicCollection, ready, user, valuedCards, value]);

  if (!visible || !user) return null;
  const account = user;

  function dismiss() {
    try {
      window.localStorage.setItem(leaderboardPromptDismissKey(account.id), "1");
    } catch {
      // The prompt is optional when storage is blocked.
    }
    setVisible(false);
  }

  async function optIn() {
    setBusy(true);
    const result = await setLeaderboardOptIn(true);
    setBusy(false);
    if (!result.error) dismiss();
  }

  return (
    <section
      aria-label="Leaderboard opt-in"
      className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <p className="text-sm leading-5">
        Your public cards cleared the leaderboard minimums. {LEADERBOARD_OPT_IN_LABEL} stays off
        until you turn it on. Turning it off later takes you off the board.
      </p>
      <p className="mt-2 text-sm text-zinc-500">{leaderboardRequirementsLine(minimums)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void optIn()}
          className="min-h-11 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950"
        >
          {LEADERBOARD_OPT_IN_LABEL}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-white/15"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
