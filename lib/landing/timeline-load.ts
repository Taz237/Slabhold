import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { anonClient } from "./founder-load";
import {
  LANDING_CARD_SELECT,
  LANDING_POST_LIMIT,
  LANDING_POST_PAGES,
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
 * The newest public posts with a card photo, read as a logged-out visitor so
 * RLS decides what is visible: hidden posts, posts by suspended accounts
 * (hidden when the account is suspended) and private cards never come back,
 * and a deleted post is not there to read. When fewer than three of the
 * newest fit, it keeps reading older posts, a page at a time, until three do
 * or there is nothing older. Throws on a read error, so the cache keeps
 * nothing.
 */
export async function readLandingTimeline(supabase: SupabaseClient): Promise<LandingPost[]> {
  const rows: TimelinePostRow[] = [];
  const profiles = new Map<string, TimelineProfileRow>();
  const cards = new Map<string, TimelineCardRow>();
  let picked: LandingPost[] = [];
  let before: string | null = null;

  for (let page = 0; page < LANDING_POST_PAGES; page += 1) {
    let query = supabase
      .from("posts")
      .select(LANDING_POST_SELECT)
      .is("hidden_at", null)
      // Only posts that can have a card photo: their own photo or an attached card.
      .or("image_url.not.is.null,card.not.is.null");
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(LANDING_POST_SCAN).returns<TimelinePostRow[]>();
    if (error) throw new Error(`landing posts read failed: ${error.message}`);
    const found = data ?? [];
    if (!found.length) break;
    rows.push(...found);
    before = found[found.length - 1].created_at;

    const authorIds = [...new Set(found.map((row) => row.user_id).filter((id): id is string => typeof id === "string" && !profiles.has(id)))];
    if (authorIds.length) {
      const readProfiles = (columns: string) =>
        supabase.from("profiles").select(columns).in("id", authorIds).limit(authorIds.length).returns<TimelineProfileRow[]>();
      let { data: authors, error: profileError } = await readProfiles(LANDING_PROFILE_SELECT);
      // A database without is_test yet: read the base columns.
      if (profileError) ({ data: authors, error: profileError } = await readProfiles(LANDING_PROFILE_SELECT_BASE));
      if (profileError) throw new Error(`landing profiles read failed: ${profileError.message}`);
      for (const author of authors ?? []) profiles.set(author.id, author);
    }

    const cardIds = [...new Set(found.map((row) => attachedCardId(row.card)).filter((id): id is string => id !== null && !cards.has(id)))];
    if (cardIds.length) {
      const { data: publicCards, error: cardError } = await supabase
        .from("public_cards")
        .select(LANDING_CARD_SELECT)
        .in("id", cardIds)
        .limit(cardIds.length)
        .returns<TimelineCardRow[]>();
      if (cardError) throw new Error(`landing cards read failed: ${cardError.message}`);
      for (const card of publicCards ?? []) cards.set(card.id, card);
    }

    picked = landingTimeline(rows, [...profiles.values()], [...cards.values()]);
    if (picked.length >= LANDING_POST_LIMIT || found.length < LANDING_POST_SCAN) break;
  }
  return picked;
}

async function loadLandingTimeline(): Promise<LandingPost[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  return readLandingTimeline(supabase);
}

/** Cached like the rest of the page: one read per half hour, none per visitor. */
const cachedLandingTimeline = unstable_cache(loadLandingTimeline, ["landing-timeline"], { revalidate: 1800 });

function warn(error: unknown) {
  console.warn("[landing-timeline]", error instanceof Error ? error.message : "read failed");
}

/** Home's read (the signed-in address). A failure means no posts are drawn; it never breaks Home. */
export async function landingTimelinePosts(read: () => Promise<LandingPost[]> = cachedLandingTimeline): Promise<LandingPost[]> {
  try {
    return await read();
  } catch (error) {
    warn(error);
    return [];
  }
}

/**
 * /welcome's read. During `next build`, and outside production, a failed
 * read draws the page without posts, so a build or a laptop with no database
 * still works. In production at runtime it throws instead: the cached page
 * with its last good timeline stays up and the next request tries again, so
 * a blip never swaps the timeline for an empty one.
 */
export async function welcomeTimelinePosts(
  read: () => Promise<LandingPost[]> = cachedLandingTimeline,
  phase: string | undefined = process.env.NEXT_PHASE,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Promise<LandingPost[]> {
  try {
    return await read();
  } catch (error) {
    warn(error);
    if (phase === PHASE_PRODUCTION_BUILD || nodeEnv !== "production") return [];
    throw error;
  }
}
