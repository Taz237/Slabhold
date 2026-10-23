import { ogContentType, ogSize, renderLeaderboardOg } from "@/components/og-frame";
import { getLeaderboardSnapshot } from "@/lib/leaderboard/load";
import { LEADERBOARD_TITLE } from "@/lib/leaderboard/rules";
import { leaderboardShareModel } from "@/lib/leaderboard/share";
import { emptySnapshot } from "@/lib/leaderboard/snapshot";

export const alt = LEADERBOARD_TITLE;
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  let snapshot = emptySnapshot(new Date());
  try {
    snapshot = await getLeaderboardSnapshot();
  } catch {
    snapshot = emptySnapshot(new Date());
  }
  return renderLeaderboardOg(leaderboardShareModel(snapshot));
}
