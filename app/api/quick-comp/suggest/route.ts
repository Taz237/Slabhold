import { serverPlayerSuggestDeps } from "@/lib/quick-comp/player-server";
import { respondPlayerSuggest } from "@/lib/quick-comp/player-respond";

/** Player names as you type, plus phrases from saved sold titles: ?q=darius */
export async function GET(request: Request) {
  return respondPlayerSuggest(request, serverPlayerSuggestDeps);
}
