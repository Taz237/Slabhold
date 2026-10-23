import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  type Deal,
  type DealKind,
  type DealStatus,
} from "./state";

type DealRow = {
  id: string;
  card_id: string | null;
  seller_id: string;
  buyer_id: string;
  kind: string;
  price_cents: number | null;
  status: string;
  card_player?: string | null;
  card_year?: string | null;
  card_set?: string | null;
  card_number?: string | null;
  card_parallel?: string | null;
  created_at: string;
  confirmed_at: string | null;
};

const STATUSES = new Set<DealStatus>(["pending", "confirmed", "declined", "cancelled"]);

export function mapDeal(row: DealRow): Deal | null {
  if (row.kind !== "sale" && row.kind !== "trade") return null;
  if (!STATUSES.has(row.status as DealStatus)) return null;
  return {
    id: row.id,
    cardId: row.card_id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id,
    kind: row.kind,
    priceCents: row.price_cents == null ? null : Number(row.price_cents),
    status: row.status as DealStatus,
    cardPlayer: row.card_player ?? "",
    cardYear: row.card_year ?? "",
    cardSet: row.card_set ?? "",
    cardNumber: row.card_number ?? "",
    cardParallel: row.card_parallel ?? "",
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

export function dealErrorMessage(error: { code?: string; message?: string } | null): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "23505" || /already waiting|duplicate key/i.test(message)) {
    return "A deal is already waiting on this card.";
  }
  if (/already sold/i.test(message)) return "This card was already marked sold.";
  if (/too many deals/i.test(message)) return "You can send 5 deals to the same person each hour.";
  if (/price too high|deals_price_cents/i.test(message) || code === "23514") {
    return "Enter a price up to $1,000,000.";
  }
  if (/no conversation/i.test(message)) return "Pick someone you already message.";
  if (/not allowed/i.test(message) || code === "42501" || /permission denied/i.test(message)) {
    return "You can't do that.";
  }
  return "Couldn't update that deal.";
}

async function client() {
  return createSupabaseBrowser();
}

export async function createDeal(input: {
  cardId: string;
  buyerId: string;
  kind: DealKind;
  priceCents: number | null;
}): Promise<{ id: string } | { error: string }> {
  const supabase = await client();
  if (!supabase) return { error: "You need to be signed in." };
  const { data, error } = await supabase.rpc("create_deal", {
    p_card_id: input.cardId,
    p_buyer_id: input.buyerId,
    p_kind: input.kind,
    p_price_cents: input.priceCents,
  });
  if (error) return { error: dealErrorMessage(error) };
  if (typeof data !== "string" || !data) return { error: "Couldn't update that deal." };
  return { id: data };
}

export async function respondDeal(
  dealId: string,
  decision: "confirmed" | "declined",
): Promise<{ status: string } | { error: string }> {
  const supabase = await client();
  if (!supabase) return { error: "You need to be signed in." };
  const { data, error } = await supabase.rpc("respond_deal", {
    p_deal_id: dealId,
    p_decision: decision,
  });
  if (error) return { error: dealErrorMessage(error) };
  return { status: typeof data === "string" ? data : decision };
}

export async function cancelDeal(dealId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await client();
  if (!supabase) return { error: "You need to be signed in." };
  const { error } = await supabase.rpc("cancel_deal", { p_deal_id: dealId });
  if (error) return { error: dealErrorMessage(error) };
  return { ok: true };
}

export async function listMyDeals(): Promise<{ deals: Deal[] } | { error: string }> {
  const supabase = await client();
  if (!supabase) return { error: "You need to be signed in." };
  const { data, error } = await supabase
    .from("deals")
    .select(
      "id, card_id, seller_id, buyer_id, kind, price_cents, status, card_player, card_year, card_set, card_number, card_parallel, created_at, confirmed_at",
    )
    .order("created_at", { ascending: false });
  if (error) return { error: dealErrorMessage(error) };
  const deals = ((data ?? []) as DealRow[]).map(mapDeal).filter((deal): deal is Deal => deal != null);
  return { deals };
}
