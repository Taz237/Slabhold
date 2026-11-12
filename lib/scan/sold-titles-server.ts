import "server-only";

import { titleHasPlayer } from "@/lib/comps/match";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { SoldTitle } from "./match";
import { MAX_SOLD_TITLES, soldTitlePattern } from "./sold-titles";

/**
 * Reads cached eBay sold listings (sold_comps_cache) whose titles name this
 * player, newest first. A read of what card pages already saved: no Trawl
 * call, no live eBay search, no writes.
 */
export async function searchCachedSoldTitles(player: string): Promise<SoldTitle[]> {
  const pattern = soldTitlePattern(player);
  const client = createSupabaseAdmin();
  if (!pattern || !client) return [];
  const { data, error } = await client
    .from("sold_comps_cache")
    .select("title, price, sold_at, grader, grade")
    .ilike("title", pattern)
    .neq("item_id", "__empty__")
    .order("sold_at", { ascending: false, nullsFirst: false })
    .limit(MAX_SOLD_TITLES);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const out: SoldTitle[] = [];
  for (const row of (data ?? []) as { title: unknown; price: unknown; sold_at: unknown; grader: unknown; grade: unknown }[]) {
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title || !titleHasPlayer(title, player)) continue;
    const price = Number(row.price);
    const soldAt = typeof row.sold_at === "string" ? row.sold_at : null;
    // The same listing can be cached for more than one card page.
    const key = `${title}|${soldAt}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      price: Number.isFinite(price) ? price : null,
      soldAt,
      grader: typeof row.grader === "string" && row.grader.trim() ? row.grader.trim() : null,
      grade: row.grade == null || String(row.grade).trim() === "" ? null : String(row.grade).trim(),
    });
  }
  return out;
}
