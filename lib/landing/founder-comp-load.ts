import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getImageProps } from "next/image";
import type { CompDemo } from "@/components/landing/showcase/sample-data";
import { readPublicCardComps, type PublicCompsClient } from "@/lib/comps/public";
import type { PublicCardComps } from "@/lib/comps/public-types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  FOUNDER_COMP_PLAYER,
  FOUNDER_COMP_SALES,
  FOUNDER_COMP_SCAN,
  FOUNDER_COMP_SELECT,
  compDemoFromFounder,
  founderComp,
  pickFounderCompCard,
  type FounderComp,
  type FounderCompRow,
} from "./founder-comp";
import { anonClient, readFounderProfile } from "./founder-load";

/**
 * The founder's Maxey Downtown and its stored comps. The card is read like
 * the hero slabs (anon client, public_cards). The comps are the public card
 * page's own read (readPublicCardComps), which shows nothing unless the card
 * is public and never calls Trawl. Throws on a read error, so the cache keeps
 * nothing; null means "play the sample".
 */
export async function readFounderComp(
  supabase: SupabaseClient,
  readComps: (cardId: string) => Promise<PublicCardComps>,
  now: number = Date.now(),
): Promise<FounderComp | null> {
  const profile = await readFounderProfile(supabase);
  if (!profile) return null;

  const { data: rows, error } = await supabase
    .from("public_cards")
    .select(FOUNDER_COMP_SELECT)
    .eq("user_id", profile.id)
    .ilike("player", `%${FOUNDER_COMP_PLAYER}%`)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(FOUNDER_COMP_SCAN)
    .returns<FounderCompRow[]>();
  if (error) throw new Error(`founder comp card read failed: ${error.message}`);
  const card = pickFounderCompCard(profile, rows ?? []);
  if (!card) return null;

  const comps = await readComps(card.id);
  if (comps.status === "unavailable") throw new Error("founder comp read failed");
  return founderComp(profile, card, comps, now);
}

async function loadFounderComp(): Promise<FounderComp | null> {
  const supabase = anonClient();
  const admin = createSupabaseAdmin() as PublicCompsClient | null;
  if (!supabase || !admin) return null;
  return readFounderComp(supabase, (cardId) => readPublicCardComps(cardId, admin, FOUNDER_COMP_SALES));
}

/** Cached for about an hour, like the hero slabs: one read an hour, none per visitor. */
export const cachedFounderComp = unstable_cache(loadFounderComp, ["landing-founder-comp"], { revalidate: 3600 });

/** The landing page's read. Any failure plays the sample. */
export async function landingFounderComp(
  read: () => Promise<FounderComp | null> = cachedFounderComp,
): Promise<FounderComp | null> {
  try {
    return await read();
  } catch (error) {
    console.warn("[landing-founder-comp]", error instanceof Error ? error.message : "read failed");
    return null;
  }
}

/**
 * What the landing's Quick Comp draws: the real card with next/image's
 * optimizer src and srcset worked out here on the server (so the demo's chunk
 * carries no image code), or null for the sample.
 */
export async function landingCompDemo(
  read: () => Promise<FounderComp | null> = cachedFounderComp,
): Promise<CompDemo | null> {
  const comp = await landingFounderComp(read);
  if (!comp) return null;
  const { props } = getImageProps({ src: comp.photoUrl, alt: "", width: 104, height: 156, quality: 75 });
  return compDemoFromFounder(comp, { src: props.src, srcSet: props.srcSet });
}
