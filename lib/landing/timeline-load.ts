import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { anonClient } from "./founder-load";
import {
  LANDING_CARD_SELECT,
  LANDING_POST_SCAN,
  LANDING_POST_SELECT,
  LANDING_PROFILE_SELECT,
  LANDING_PROFILE_SELECT_BASE,
  attachedCardId,
  landingTimeline,
  type LandingPost,
  type TimelineCardRow,
  type TimelinePostRow,
  type TimelineProfileRow,
} from "./timeline";

/**
 * The newest public posts, read as a logged-out visitor so RLS decides what
 * is visible: hidden posts and private cards never come back. Throws on a
 * read error, so the cache keeps nothing.
 */
export async function readLandingTimeline(supabase: SupabaseClient): Promise<LandingPost[]> {
  const { data: posts, error: postError } = await supabase
    .from("posts")
    .select(LANDING_POST_SELECT)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(LANDING_POST_SCAN)
    .returns<TimelinePostRow[]>();
  if (postError) throw new Error(`landing posts read failed: ${postError.message}`);
  const rows = posts ?? [];
  if (!rows.length) return [];

  const authorIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => typeof id === "string"))];
  const cardIds = [...new Set(rows.map((row) => attachedCardId(row.card)).filter((id): id is string => id !== null))];

  const readProfiles = (columns: string) =>
    supabase.from("profiles").select(columns).in("id", authorIds).limit(authorIds.length).returns<TimelineProfileRow[]>();
  let { data: profiles, error: profileError } = await readProfiles(LANDING_PROFILE_SELECT);
  // A database without is_test yet: read the base columns.
  if (profileError) ({ data: profiles, error: profileError } = await readProfiles(LANDING_PROFILE_SELECT_BASE));
  if (profileError) throw new Error(`landing profiles read failed: ${profileError.message}`);

  let cards: TimelineCardRow[] = [];
  if (cardIds.length) {
    const { data, error } = await supabase
      .from("public_cards")
      .select(LANDING_CARD_SELECT)
      .in("id", cardIds)
      .limit(cardIds.length)
      .returns<TimelineCardRow[]>();
    if (error) throw new Error(`landing cards read failed: ${error.message}`);
    cards = data ?? [];
  }
  return landingTimeline(rows, profiles ?? [], cards);
}

async function loadLandingTimeline(): Promise<LandingPost[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  return readLandingTimeline(supabase);
}

/** Cached like the rest of the page: one read per half hour, none per visitor. */
const cachedLandingTimeline = unstable_cache(loadLandingTimeline, ["landing-timeline"], { revalidate: 1800 });

/** The page's read. A failure means no posts are drawn; it never breaks the page. */
export async function landingTimelinePosts(read: () => Promise<LandingPost[]> = cachedLandingTimeline): Promise<LandingPost[]> {
  try {
    return await read();
  } catch (error) {
    console.warn("[landing-timeline]", error instanceof Error ? error.message : "read failed");
    return [];
  }
}
