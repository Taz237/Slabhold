import { FOUNDER_USERNAME } from "@/lib/landing/founder";
import { isRenderablePostPhoto } from "@/lib/social/post-photos";
import { scrubPublicText } from "@/lib/social/share-image";

/*
 * The landing page's timeline: a few real, recent, public posts, shaped for
 * one small presentational card. Plain data in, plain data out, so the rules
 * are easy to test: hidden posts never show, nothing is padded with samples,
 * and only a post with a photo makes the cut.
 */

export const LANDING_POST_LIMIT = 3;
/** How many recent posts to look through for three that fit. */
export const LANDING_POST_SCAN = 40;

export const LANDING_POST_SELECT = "id, user_id, content, image_url, card, quoted_post_id, created_at, hidden_at, post_type";
export const LANDING_PROFILE_SELECT = "id, username, display_name, avatar_url, is_test";
export const LANDING_PROFILE_SELECT_BASE = "id, username, display_name, avatar_url";
export const LANDING_CARD_SELECT = "id, player, year, year_label, set, image_url";

export type TimelinePostRow = {
  id: string;
  user_id: string | null;
  content: string | null;
  image_url: string | null;
  card: unknown;
  quoted_post_id?: string | null;
  created_at: string;
  hidden_at?: string | null;
  post_type?: string | null;
};

export type TimelineProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_test?: boolean | null;
};

export type TimelineCardRow = {
  id: string;
  player: string | null;
  year: number | null;
  year_label: string | null;
  set: string | null;
  image_url: string | null;
};

export type LandingPost = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  text: string;
  photoUrl: string;
  /** "card" is a card from the poster's public collection, drawn 5:7. */
  photoKind: "card" | "photo";
  /** The card's own details, for a card photo. Empty for a plain photo. */
  cardLabel: string;
};

const MAX_TEXT = 240;

function remotePhoto(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const value = url.trim();
  // Stored photos only: an inline data URL would bloat the cached page.
  return /^https:\/\//.test(value) && isRenderablePostPhoto(value) ? value : null;
}

/** An avatar from our own public storage, or none (the card draws the initial). */
function avatar(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url.trim());
    const ours = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : parsed.origin;
    if (parsed.protocol !== "https:" || parsed.origin !== ours) return null;
    return parsed.pathname.startsWith("/storage/v1/object/public/") ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function clip(text: string): string {
  if (text.length <= MAX_TEXT) return text;
  return `${text.slice(0, MAX_TEXT).replace(/\s+\S*$/, "")}…`;
}

/** The id of the card a post attached, if any. */
export function attachedCardId(card: unknown): string | null {
  if (!card || typeof card !== "object") return null;
  const id = (card as { id?: unknown }).id;
  return typeof id === "string" && /^[0-9a-f-]{8,64}$/i.test(id) ? id : null;
}

function cardLabel(card: TimelineCardRow): string {
  const year = card.year_label?.trim() || (card.year ? String(card.year) : "");
  return [scrubPublicText(card.player ?? ""), [year, scrubPublicText(card.set ?? "")].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Up to `limit` posts, newest first, one per collector before anyone gets a
 * second. `cards` are the attached cards that are public right now: a card
 * that went private since it was posted is not drawn.
 */
export function landingTimeline(
  posts: readonly TimelinePostRow[],
  profiles: readonly TimelineProfileRow[],
  cards: readonly TimelineCardRow[],
  limit: number = LANDING_POST_LIMIT,
): LandingPost[] {
  const authors = new Map(profiles.map((profile) => [profile.id, profile]));
  const publicCards = new Map(cards.map((card) => [card.id, card]));
  const fits: LandingPost[] = [];
  const sorted = [...posts].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  for (const post of sorted) {
    // RLS already hides these from a logged-out read. This is the second lock.
    if (post.hidden_at) continue;
    if (post.post_type && post.post_type !== "post") continue;
    if (post.quoted_post_id) continue;
    const author = post.user_id ? authors.get(post.user_id) : undefined;
    const handle = author?.username?.trim() ?? "";
    if (!author || !/^[a-z0-9_]{1,32}$/i.test(handle)) continue;
    if (author.is_test === true) continue;
    // The team account's cards and posts are shown without its name, so its posts stay off this list.
    if (handle.toLowerCase() === FOUNDER_USERNAME) continue;

    const own = remotePhoto(post.image_url);
    const cardId = attachedCardId(post.card);
    const card = cardId ? publicCards.get(cardId) : undefined;
    const cardPhoto = card ? remotePhoto(card.image_url) : null;
    const photoUrl = own ?? cardPhoto;
    if (!photoUrl) continue;

    fits.push({
      id: post.id,
      handle,
      name: scrubPublicText(author.display_name ?? "") || handle,
      avatarUrl: avatar(author.avatar_url),
      text: clip(scrubPublicText(post.content ?? "")),
      photoUrl,
      photoKind: own ? "photo" : "card",
      cardLabel: !own && card ? cardLabel(card) : "",
    });
  }
  const picked: LandingPost[] = [];
  const seen = new Set<string>();
  for (const post of fits) {
    if (picked.length >= limit) break;
    if (seen.has(post.handle)) continue;
    seen.add(post.handle);
    picked.push(post);
  }
  for (const post of fits) {
    if (picked.length >= limit) break;
    if (!picked.includes(post)) picked.push(post);
  }
  // Newest first again, whoever was picked.
  return picked.sort((a, b) => fits.indexOf(a) - fits.indexOf(b));
}
