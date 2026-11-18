import { PRIVATE_OG_CACHE_CONTROL, renderLeaderboardRankOg } from "@/components/og-frame";
import { getLeaderboardSnapshot } from "@/lib/leaderboard/load";
import { parseLeaderboardQuery } from "@/lib/leaderboard/rules";
import { leaderboardRankShareModel } from "@/lib/leaderboard/share";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": PRIVATE_OG_CACHE_CONTROL } });
}

/**
 * The signed-in collector's own place on one board as a 1080×1350 PNG. It
 * reads the boards the page already caches, and nothing else. Signed out,
 * an unknown board, or not ranked: 404, never a picture.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) return notFound();
  const params = new URL(request.url).searchParams;
  const board = params.get("board") ?? "";
  const parsed = parseLeaderboardQuery(params.get("week") ?? undefined, board);
  if (parsed.boardId !== board) return notFound();
  let model;
  try {
    model = leaderboardRankShareModel(await getLeaderboardSnapshot(), userId, parsed.boardId, parsed.week);
  } catch {
    return notFound();
  }
  if (!model) return notFound();
  return renderLeaderboardRankOg(model);
}
