import type { Metadata } from "next";
import { ValueBoard } from "@/components/value-board";
import { LEADERBOARD_NOTE, leaderboardMinimums } from "@/lib/leaderboard/eligibility";
import { getValueBoard } from "@/lib/leaderboard/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Value",
  description: LEADERBOARD_NOTE,
};

export default async function ValueLeaderboardPage() {
  const minimums = leaderboardMinimums();
  const model = await getValueBoard();
  return <ValueBoard model={model} minimums={minimums} />;
}
