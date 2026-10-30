import type { Metadata } from "next";
import { after } from "next/server";
import { LeaderboardView } from "@/components/leaderboard-view";
import { recordClosedPodiums } from "@/lib/badges/load";
import { getLeaderboardPage } from "@/lib/leaderboard/load";
import { LEADERBOARD_DESCRIPTION, LEADERBOARD_TITLE } from "@/lib/leaderboard/rules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: LEADERBOARD_TITLE,
  description: LEADERBOARD_DESCRIPTION,
};

type SearchValue = string | string[] | undefined;

function one(value: SearchValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: SearchValue; board?: SearchValue }>;
}) {
  const params = await searchParams;
  const model = await getLeaderboardPage({ week: one(params.week), board: one(params.board) });
  // Podiums don't wait on a badge check after the week closes.
  after(() => recordClosedPodiums());
  return <LeaderboardView model={model} />;
}
