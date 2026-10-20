import { readLatestSoldComps } from "@/lib/comps/cache";
import { compFlagStatus, parseFlagReason } from "@/lib/comps/flag-reasons";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import { isCardOwner } from "@/lib/comps/ownership";
import { buildQueryKey } from "@/lib/comps/query-key";
import { repriceCardFromCache } from "@/lib/comps/reprice-from-cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { revalidateCard } from "@/lib/value/card-market";
import { refreshCardValue } from "@/lib/value/getCardValue";
import type { CardValueResult } from "@/lib/value/types";

async function repriceFromCache(cardId: string) {
  return repriceCardFromCache(cardId, {
    refresh: refreshCardValue,
    revalidate: revalidateCard,
  });
}

export const runtime = "nodejs";

type FlagAdmin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;

function valuePayload(value: CardValueResult) {
  return {
    median: value.median,
    low: value.low,
    high: value.high,
    nSales: value.nSales,
    status: value.status,
  };
}

async function ownerId(admin: FlagAdmin, cardId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("cards")
    .select("user_id")
    .eq("id", cardId)
    .maybeSingle();
  if (error) {
    console.warn("[comp_flags] ownership check failed:", error.message);
    return null;
  }
  return data?.user_id ? String(data.user_id) : null;
}

/**
 * Owner's hidden sales: flag rows joined to the cached sale (title, price, date).
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId();
  const cardId = new URL(request.url).searchParams.get("cardId")?.trim() ?? "";
  if (!cardId) return Response.json({ error: "cardId is required" }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return Response.json({ error: "Unavailable" }, { status: 503 });

  const owner = await ownerId(admin, cardId);
  if (owner == null && userId) {
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }
  const status = compFlagStatus({ userId, ownerId: owner });
  if (status !== 200) {
    return Response.json(
      { error: status === 401 ? "Unauthorized" : "Forbidden" },
      { status },
    );
  }

  const { data, error } = await admin
    .from("comp_flags")
    .select("item_id, reason, created_at")
    .eq("card_id", cardId)
    .eq("user_id", userId);
  if (error) {
    console.warn("[comp_flags] list failed:", error.message);
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }

  const card = await loadSoldCompCard(cardId);
  const sales = card ? await readLatestSoldComps(buildQueryKey(card)) : [];
  const byItem = new Map(sales.map((sale) => [sale.itemId, sale]));

  return Response.json({
    sales: (data ?? []).map((row) => {
      const itemId = String(row.item_id ?? "");
      const sale = byItem.get(itemId);
      return {
        itemId,
        title: sale?.title?.trim() || "Sale",
        price: sale ? sale.price : null,
        soldAt: sale?.soldAt ?? null,
        reason: (row.reason as string | null) ?? null,
        url: sale?.url || null,
      };
    }),
  });
}

/**
 * Flag a sold comp as not a match.
 * Only the card owner may write. Reason is required. Reprices from cache.
 */
export async function POST(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { cardId?: string; itemId?: string; reason?: string } = {};
  try {
    body = (await request.json()) as { cardId?: string; itemId?: string; reason?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cardId = body.cardId?.trim() ?? "";
  const itemId = body.itemId?.trim() ?? "";
  const reason = parseFlagReason(body.reason);
  if (!cardId || !itemId) {
    return Response.json({ error: "cardId and itemId are required" }, { status: 400 });
  }
  if (!reason) {
    return Response.json({ error: "Choose a reason" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return Response.json({ error: "Unavailable" }, { status: 503 });

  const owner = await ownerId(admin, cardId);
  if (!owner) return Response.json({ error: "Unavailable" }, { status: 503 });
  if (!isCardOwner(owner, userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: writeError } = await admin.from("comp_flags").upsert(
    {
      user_id: userId,
      card_id: cardId,
      item_id: itemId,
      reason,
    },
    { onConflict: "user_id,card_id,item_id" },
  );
  if (writeError) {
    console.warn("[comp_flags] upsert failed:", writeError.message);
    return Response.json({ error: "Could not save flag" }, { status: 500 });
  }

  try {
    const refreshed = await repriceFromCache(cardId);
    return Response.json({ ok: true, value: valuePayload(refreshed) });
  } catch (err) {
    console.warn("[comp_flags] reprice failed:", err instanceof Error ? err.message : err);
    await admin
      .from("comp_flags")
      .delete()
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .eq("item_id", itemId);
    return Response.json({ error: "Could not update the value" }, { status: 500 });
  }
}

/** Owner undo / restore. Deletes the flag and reprices from cache. */
export async function DELETE(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { cardId?: string; itemId?: string } = {};
  try {
    body = (await request.json()) as { cardId?: string; itemId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cardId = body.cardId?.trim() ?? "";
  const itemId = body.itemId?.trim() ?? "";
  if (!cardId || !itemId) {
    return Response.json({ error: "cardId and itemId are required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return Response.json({ error: "Unavailable" }, { status: 503 });

  const owner = await ownerId(admin, cardId);
  if (!owner) return Response.json({ error: "Unavailable" }, { status: 503 });
  if (!isCardOwner(owner, userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: deleteError } = await admin
    .from("comp_flags")
    .delete()
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .eq("item_id", itemId);
  if (deleteError) {
    console.warn("[comp_flags] delete failed:", deleteError.message);
    return Response.json({ error: "Could not restore that sale" }, { status: 500 });
  }

  try {
    const refreshed = await repriceFromCache(cardId);
    return Response.json({ ok: true, value: valuePayload(refreshed) });
  } catch (err) {
    console.warn("[comp_flags] restore reprice failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not update the value" }, { status: 500 });
  }
}
