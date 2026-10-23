import { renderOg } from "@/components/og-frame";
import { getPublicValueBoard } from "@/lib/leaderboard/value-load";
import { leaderboardBoardShareImage } from "@/lib/leaderboard/value-share";

export const alt = "Value leaderboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Image() {
  let rows: { username: string; percentLabel: string }[] = [];
  try {
    const board = await getPublicValueBoard();
    rows = board.brackets
      .flatMap((bracket) => bracket.rows)
      .slice(0, 3)
      .map((row) => ({ username: row.username, percentLabel: row.percentLabel }));
  } catch {
    rows = [];
  }
  return renderOg(leaderboardBoardShareImage(rows));
}
