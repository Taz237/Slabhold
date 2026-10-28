import { checkBadges, unseenReveal } from "@/lib/badges/load";
import { formatPin, profilePins } from "@/lib/badges/pins";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Check the signed-in user's badge progress and store new badges. Called
 * after a card add, a post, a follow, opening the side menu, and opening the app.
 * One user per call. Never calls Trawl.
 */
export async function POST() {
  const userId = await getAuthUserId();
  if (!userId) return Response.json({ error: "Sign in to earn badges." }, { status: 401 });
  const state = await checkBadges(userId);
  if (!state) return Response.json({ available: false }, { headers: { "cache-control": "no-store" } });
  return Response.json(
    {
      available: true,
      earnedCount: state.earnedCount,
      total: state.total,
      pinned: profilePins(state.pinned, state.earned).map(formatPin),
      showBadges: state.showBadges,
      reveal: unseenReveal(state),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
