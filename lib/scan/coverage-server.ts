import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isKnownCard, type ClosestCard } from "./closest";
import { loadPlayerCards } from "./closest-load";
import type { ScanMiss } from "./miss";

/**
 * Where the scanner's misses and confirmed cards are kept: public.scan_misses and
 * public.scan_confirmations (the QA-reviewed scan SQL, applied separately; confirm_scan_card takes
 * the user id as p_user_id). Every function throws when the tables are not there; the routes
 * treat that as "not stored" and the scan goes on.
 */

/** One line per miss in the server log: readable in Vercel's logs with or without the table. */
export function logScanMiss(miss: ScanMiss): void {
  console.info(`[scan-miss] ${JSON.stringify({ reason: miss.reason, why: miss.why, kind: miss.kind, read: miss.read, searched: miss.searched, shown: miss.shown, lines: miss.lines, backLines: miss.backLines })}`);
}

export async function storeScanMiss(miss: ScanMiss): Promise<void> {
  const client = createSupabaseAdmin();
  if (!client) throw new Error("No database");
  const { error } = await client.from("scan_misses").insert({
    reason: miss.reason,
    why: miss.why,
    kind: miss.kind,
    front_lines: miss.lines,
    back_lines: miss.backLines,
    player_name: miss.read.player,
    sport: miss.read.sport,
    year_label: miss.read.year,
    set_brand: miss.read.set,
    card_number: miss.read.number,
    serial_run: miss.read.run,
    is_auto: miss.read.auto,
    is_relic: miss.read.relic,
    searched: miss.searched,
    shown: miss.shown,
  });
  if (error) throw new Error(error.message);
}

const MAX_CONFIRMED = 5;

export async function readConfirmedCards(key: string): Promise<ClosestCard[]> {
  const client = createSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client
    .from("scan_confirmations")
    .select("player_name, sport, year_label, set_brand, card_number, confirmations")
    .eq("read_key", key)
    .order("confirmations", { ascending: false })
    .limit(MAX_CONFIRMED);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    playerName: String(row.player_name ?? ""),
    sport: String(row.sport ?? ""),
    yearLabel: String(row.year_label ?? ""),
    setBrand: String(row.set_brand ?? ""),
    cardNumber: String(row.card_number ?? ""),
    confirmed: Number(row.confirmations) || 1,
  }));
}

/** Our checklists have this player on this year, set and card #. False for a sport we have no list for. */
export async function isKnownConfirmedCard(card: ClosestCard): Promise<boolean> {
  return isKnownCard(card, await loadPlayerCards(card.sport));
}

/**
 * One more collector confirmed this card for this read: the database counts one vote per user per
 * card. It throws scan_confirm_rate_limited or scan_confirm_invalid by name; the route maps them.
 */
export async function saveConfirmedCard(key: string, card: ClosestCard, userId: string): Promise<void> {
  const client = createSupabaseAdmin();
  if (!client) throw new Error("No database");
  const { error } = await client.rpc("confirm_scan_card", {
    p_read_key: key,
    p_player_name: card.playerName,
    p_sport: card.sport,
    p_year_label: card.yearLabel,
    p_set_brand: card.setBrand,
    p_card_number: card.cardNumber,
    // One vote per user per card. Server-only: it never leaves the database, and goes with the account.
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}
