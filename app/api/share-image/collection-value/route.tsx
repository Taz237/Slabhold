import { PRIVATE_OG_CACHE_CONTROL, renderCollectionValueOg } from "@/components/og-frame";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { collectionValueShareModel, shareRange } from "@/lib/share/collection-value";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": PRIVATE_OG_CACHE_CONTROL } });
}

/**
 * The signed-in collector's own value chart as a 1080×1350 PNG. A collection
 * with no public cards is private: 404, never a picture.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId();
  const supabase = userId ? await createSupabaseServer() : null;
  if (!userId || !supabase) return notFound();

  const [profile, publicCards, snapshots] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", userId).maybeSingle<{ username: string }>(),
    supabase.from("public_cards").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("collection_snapshots")
      .select("snapshot_date, value")
      .eq("user_id", userId)
      .order("snapshot_date", { ascending: true }),
  ]);
  if (profile.error || !profile.data?.username) return notFound();
  if (publicCards.error || !publicCards.count) return notFound();
  if (snapshots.error) return notFound();

  const model = collectionValueShareModel({
    username: profile.data.username,
    rows: (snapshots.data ?? []).map((row) => ({
      snapshot_date: String(row.snapshot_date),
      value: Number(row.value) || 0,
    })),
    range: shareRange(new URL(request.url).searchParams.get("range")),
    today: snapshotDateInNewYork(),
  });
  if (!model) return notFound();
  return renderCollectionValueOg(model);
}
