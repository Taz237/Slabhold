import { getAuthUserId } from "@/lib/supabase/server";
import { listWantSummaries } from "@/lib/wants/summary";

export const runtime = "nodejs";

/** The signed-in user's want list with values and deal flags. Never calls Trawl. */
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return Response.json({ error: "You need to be signed in." }, { status: 401 });
  }

  try {
    const wants = await listWantSummaries(userId);
    return Response.json({ wants });
  } catch (err) {
    console.warn(
      "[wants]",
      err instanceof Error ? err.message : "list failed",
    );
    return Response.json({ error: "Couldn't load your want list." }, { status: 500 });
  }
}
