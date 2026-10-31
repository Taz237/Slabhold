import type { Metadata } from "next";
import { ValueBoard } from "@/components/value-board";
import { LEADERBOARD_NOTE, leaderboardMinimums } from "@/lib/leaderboard/eligibility";
import { getValueBoard } from "@/lib/leaderboard/value-load";
import { getAuthUserCreatedAt } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Value",
  description: LEADERBOARD_NOTE,
};

export default async function ValueLeaderboardPage() {
  const minimums = leaderboardMinimums();
  const [model, accountCreatedAt] = await Promise.all([getValueBoard(), getAuthUserCreatedAt()]);
  return <ValueBoard model={model} minimums={minimums} accountCreatedAt={accountCreatedAt} />;
}
