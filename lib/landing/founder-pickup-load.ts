import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { PickupDemo } from "@/components/landing/showcase/sample-data";
import {
  FOUNDER_PICKUP_PLAYER,
  FOUNDER_PICKUP_SCAN,
  FOUNDER_PICKUP_SELECT,
  founderPickup,
  type FounderPickupRow,
} from "./founder-pickup";
import { anonClient, readFounderProfile } from "./founder-load";

/**
 * The founder's Jordan Love PSA 10, read like the hero slabs and the Quick
 * Comp card (anon client, public_cards). Throws on a read error, so the cache
 * keeps nothing; null means "keep the sample slab".
 */
export async function readFounderPickup(supabase: SupabaseClient): Promise<PickupDemo | null> {
  const profile = await readFounderProfile(supabase);
  if (!profile) return null;

  const { data: rows, error } = await supabase
    .from("public_cards")
    .select(FOUNDER_PICKUP_SELECT)
    .eq("user_id", profile.id)
    .ilike("player", `%${FOUNDER_PICKUP_PLAYER}%`)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(FOUNDER_PICKUP_SCAN)
    .returns<FounderPickupRow[]>();
  if (error) throw new Error(`founder pickup card read failed: ${error.message}`);
  return founderPickup(profile, rows ?? []);
}

async function loadFounderPickup(): Promise<PickupDemo | null> {
  const supabase = anonClient();
  if (!supabase) return null;
  return readFounderPickup(supabase);
}

/** Cached for about an hour, like the hero slabs: one read an hour, none per visitor. */
export const cachedFounderPickup = unstable_cache(loadFounderPickup, ["landing-founder-pickup"], { revalidate: 3600 });

/** The landing page's read. Any failure keeps the sample slab. */
export async function landingFounderPickup(
  read: () => Promise<PickupDemo | null> = cachedFounderPickup,
): Promise<PickupDemo | null> {
  try {
    return await read();
  } catch (error) {
    console.warn("[landing-founder-pickup]", error instanceof Error ? error.message : "read failed");
    return null;
  }
}
