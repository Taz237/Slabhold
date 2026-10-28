import type { Metadata } from "next";
import { AchievementsView } from "@/components/badges/achievements-view";
import { checkBadges } from "@/lib/badges/load";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Achievements",
  description: "Badges you earn by collecting, posting, and climbing the boards.",
};

export default async function AchievementsPage() {
  const userId = await getAuthUserId();
  const state = userId ? await checkBadges(userId) : null;
  return (
    <AchievementsView
      state={
        state
          ? {
              username: state.username,
              eligible: state.eligible,
              statuses: state.statuses,
              earned: state.earned.map(({ category, tier, earnedAt }) => ({ category, tier, earnedAt })),
              showBadges: state.showBadges,
              pinned: state.pinned,
              earnedCount: state.earnedCount,
              total: state.total,
            }
          : null
      }
    />
  );
}
