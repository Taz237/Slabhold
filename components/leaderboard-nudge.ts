"use client";

import { useEffect, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { isLeaderboardEligible, leaderboardMinimums, type LeaderboardMinimums } from "@/lib/leaderboard/eligibility";
import {
  leaderboardPromptDismissKey,
  leaderboardPromptVisible,
  readLeaderboardOptIn,
  type LeaderboardOptInDb,
} from "@/lib/leaderboard/opt-in";
import { subscribeLeaderboardOptIn } from "@/lib/leaderboard/opt-in-sync";

/*
 * The dot on Collection's trophy. Kept apart from the switch
 * (components/leaderboard-opt-in.tsx), which only draws after a tap and
 * loads in its own chunk.
 */

type LeaderboardNudgeInput = {
  valuedCards: number;
  value: number;
  publicCollection: boolean;
  ready: boolean;
  minimums?: LeaderboardMinimums;
  accountCreatedAt?: string | null;
};

/**
 * True when the collector's public cards clear the board's minimums, the
 * switch is still off, and they have not waved it away. `dismiss` remembers
 * that on this device.
 */
export function useLeaderboardNudge({
  valuedCards,
  value,
  publicCollection,
  ready,
  minimums = leaderboardMinimums(),
  accountCreatedAt,
}: LeaderboardNudgeInput): { visible: boolean; dismiss: () => void } {
  const { user } = useSocial();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    // Turning the switch on from the same screen hides this prompt.
    return subscribeLeaderboardOptIn(id, (optedIn) => {
      if (optedIn) setVisible(false);
    });
  }, [user?.id]);

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

  function dismiss() {
    const id = user?.id;
    if (id) {
      try {
        window.localStorage.setItem(leaderboardPromptDismissKey(id), "1");
      } catch {
        // The prompt is optional when storage is blocked.
      }
    }
    setVisible(false);
  }

  return { visible: visible && Boolean(user), dismiss };
}

