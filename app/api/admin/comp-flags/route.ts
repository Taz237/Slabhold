import { readLatestSoldComps } from "@/lib/comps/cache";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import { buildQueryKey } from "@/lib/comps/query-key";
import { adminAccess } from "@/lib/safety/admin";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { isUuid } from "@/lib/value/card-value-access";
import { refreshCardValue } from "@/lib/value/getCardValue";

export const runtime = "nodejs";

type FlagRow = {
  id: string;
  user_id: string;
  card_id: string;
  item_id: string;
  reason: string | null;
  created_at: string;
};

async function requireAdmin() {
  const userId = await getAuthUserId();
  if (adminAccess(userId) !== "allow") return null;
  const admin = createSupabaseAdmin();
  if (!admin || !userId) return null;
  return { userId, admin };
}

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate) return Response.json({ error: "Not found" }, { status: 404 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ flags: [] });

  const { admin } = gate;
  let rows: FlagRow[] = [];

  if (isUuid(q)) {
    const { data, error } = await admin
      .from("comp_flags")
      .select("id, user_id, card_id, item_id, reason, created_at")
      .or(`card_id.eq.${q},user_id.eq.${q}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("[admin comp_flags] search failed:", error.message);
      return Response.json({ error: "Unavailable" }, { status: 503 });
    }
    rows = (data ?? []) as FlagRow[];
  } else {
    const name = q.replace(/^@/, "");
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, username")
      .ilike("username", name)
      .limit(5);
    if (profileError) {
      console.warn("[admin comp_flags] user search failed:", profileError.message);
      return Response.json({ error: "Unavailable" }, { status: 503 });
    }
    const ids = (profiles ?? []).map((row) => row.id as string);
    if (!ids.length) return Response.json({ flags: [] });
    const { data, error } = await admin
      .from("comp_flags")
      .select("id, user_id, card_id, item_id, reason, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("[admin comp_flags] search failed:", error.message);
      return Response.json({ error: "Unavailable" }, { status: 503 });
    }
    rows = (data ?? []) as FlagRow[];
  }

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: names } = userIds.length
    ? await admin.from("profiles").select("id, username").in("id", userIds)
    : { data: [] };
  const username = new Map(
    (names ?? []).map((row) => [row.id as string, (row.username as string) ?? ""]),
  );

  const salesByCard = new Map<string, Map<string, { title: string; price: number; soldAt: string }>>();
  for (const cardId of new Set(rows.map((row) => row.card_id))) {
    const card = await loadSoldCompCard(cardId);
    if (!card) continue;
    const sales = await readLatestSoldComps(buildQueryKey(card));
    salesByCard.set(
      cardId,
      new Map(
        sales.map((sale) => [
          sale.itemId,
          { title: sale.title, price: sale.price, soldAt: sale.soldAt },
        ]),
      ),
    );
  }

  return Response.json({
    flags: rows.map((row) => {
      const sale = salesByCard.get(row.card_id)?.get(row.item_id);
      return {
        id: row.id,
        userId: row.user_id,
        username: username.get(row.user_id) ?? "",
        cardId: row.card_id,
        itemId: row.item_id,
        reason: row.reason,
        createdAt: row.created_at,
        title: sale?.title || "Sale",
        price: sale ? sale.price : null,
        soldAt: sale?.soldAt ?? null,
      };
    }),
  });
}

/** Service-role restore. Reprices that card from the comps cache. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate) return Response.json({ error: "Not found" }, { status: 404 });

  let body: { id?: string } = {};
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = body.id?.trim() ?? "";
  if (!isUuid(id)) return Response.json({ error: "id is required" }, { status: 400 });

  const { admin } = gate;
  const { data, error } = await admin
    .from("comp_flags")
    .select("id, card_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[admin comp_flags] read failed:", error.message);
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  const cardId = data.card_id as string;
  const { error: deleteError } = await admin.from("comp_flags").delete().eq("id", id);
  if (deleteError) {
    console.warn("[admin comp_flags] delete failed:", deleteError.message);
    return Response.json({ error: "Could not restore that flag" }, { status: 500 });
  }

  try {
    await refreshCardValue(cardId, {
      cacheOnly: true,
      replaceValue: true,
      beforeTrawl: async () => false,
    });
  } catch (err) {
    console.warn("[admin comp_flags] reprice failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Flag removed, but the value did not update" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
