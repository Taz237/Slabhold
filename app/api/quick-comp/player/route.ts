import { serverPlayerFeedDeps } from "@/lib/quick-comp/player-server";
import { respondPlayerFeed } from "@/lib/quick-comp/player-respond";

export const maxDuration = 15;

/** One player's recent sold sales, any card: ?q=Darius Acuff Jr. */
export async function GET(request: Request) {
  return respondPlayerFeed(request, serverPlayerFeedDeps);
}
