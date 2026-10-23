import type { Metadata } from "next";
import { LeaderboardView } from "@/components/leaderboard-view";
import { LEADERBOARD_NOTE } from "@/lib/leaderboard/eligibility";
import { getLeaderboard } from "@/lib/leaderboard/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: LEADERBOARD_NOTE,
};

export default async function LeaderboardPage() {
  const model = await getLeaderboard();
  return <LeaderboardView model={model} />;
}
