import { renderOg } from "@/components/og-frame";
import { pct } from "@/lib/format";
import { rankLeaderboard } from "@/lib/leaderboard/math";
import { getPublicLeaderboard } from "@/lib/leaderboard/load";
import { leaderboardBoardShareImage } from "@/lib/leaderboard/share";

export const alt = "Collection leaderboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Image() {
  let rows: { username: string; percentLabel: string }[] = [];
  try {
    const board = await getPublicLeaderboard();
    rows = rankLeaderboard(board.day.rows, "gainers")
      .slice(0, 3)
      .map((row) => ({ username: row.username, percentLabel: pct(row.percent) }));
  } catch {
    rows = [];
  }
  return renderOg(leaderboardBoardShareImage(rows));
}
