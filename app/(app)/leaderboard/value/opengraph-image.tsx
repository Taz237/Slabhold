import { renderLeaderboardOg } from "@/components/og-frame";
import { getPublicValueBoard } from "@/lib/leaderboard/value-load";
import { valueBoardShareModel } from "@/lib/leaderboard/value-share";

export const alt = "Value leaderboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Image() {
  let board: Parameters<typeof valueBoardShareModel>[0] = { start: "", end: "", brackets: [] };
  try {
    board = await getPublicValueBoard();
  } catch {
    board = { start: "", end: "", brackets: [] };
  }
  return renderLeaderboardOg(valueBoardShareModel(board));
}
