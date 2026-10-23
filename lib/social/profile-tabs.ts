import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPublicCard } from "./cards";
import { imagesFromPost } from "./post-photos";
import type { TimelineItem } from "./timeline";
import type { OwnedCard, Post, PostComment, Profile, PublicCard } from "./types";

export type ProfileTab = "posts" | "replies" | "media" | "cards";

export const PROFILE_TAB_LABELS: { id: ProfileTab; label: string }[] = [
  { id: "posts", label: "Posts" },
  { id: "replies", label: "Replies" },
  { id: "media", label: "Media" },
  { id: "cards", label: "Cards" },
];

/** `tab=collection` stays valid for older card links. */
export function profileTabFromQuery(value: string | null | undefined): ProfileTab {
  if (value === "replies" || value === "media" || value === "cards") return value;
  if (value === "collection") return "cards";
  return "posts";
}

export function postHasProfileMedia(
  post: Pick<Post, "imageDataUrl" | "images" | "mailDay" | "mailDayCards">,
): boolean {
  if (imagesFromPost(post).length > 0) return true;
  if (post.mailDay?.photos.some((photo) => photo.length > 0)) return true;
  return Boolean(post.mailDayCards?.some((card) => card.photos.some((photo) => photo.length > 0)));
}

/** Photos on this person's own posts. Reposts of someone else's photo stay out. */
export function profileMediaItems(items: readonly TimelineItem[], userId: string): TimelineItem[] {
  return items.filter(
    (item) => !item.repostedBy && item.post.authorId === userId && postHasProfileMedia(item.post),
  );
}

/**
 * The pinned post is first and is not repeated in the list under it.
 * A pin that is not this profile's post is left off.
 */
export function withPinnedFirst(
  items: readonly TimelineItem[],
  pinned: Post | null,
  profile: Profile | null,
): TimelineItem[] {
  if (!pinned || !profile || pinned.authorId !== profile.id) return [...items];
  const pinnedItem: TimelineItem = {
    key: `pinned:${pinned.id}`,
    post: pinned,
    at: pinned.createdAt,
    repostedBy: null,
  };
  return [pinnedItem, ...items.filter((item) => item.post.id !== pinned.id)];
}

export type ProfileReply = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
};

/** Replies are comments this person wrote, newest first. */
export function profileReplies(comments: readonly PostComment[], userId: string): ProfileReply[] {
  return comments
    .filter((comment) => comment.authorId === userId && comment.body.trim().length > 0)
    .map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      body: comment.body,
      createdAt: comment.createdAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export type PinResult =
  | { ok: true; pinnedPostId: string | null }
  | { ok: false; error: string };

export function decidePin(input: {
  actorId: string | null;
  profileId: string;
  post: { id: string; authorId: string } | null;
}): PinResult {
  if (!input.actorId) return { ok: false, error: "Log in to pin a post." };
  if (input.actorId !== input.profileId) {
    return { ok: false, error: "You can only pin your own post." };
  }
  if (!input.post) return { ok: false, error: "That post is gone." };
  if (input.post.authorId !== input.actorId) {
    return { ok: false, error: "You can only pin your own post." };
  }
  return { ok: true, pinnedPostId: input.post.id };
}

export function decideUnpin(actorId: string | null, profileId: string): PinResult {
  if (!actorId || actorId !== profileId) {
    return { ok: false, error: "You can only unpin your own profile." };
  }
  return { ok: true, pinnedPostId: null };
}

/** Deleting the pinned post clears it. Any other pin stays. */
export function pinnedPostIdAfterDelete(
  pinnedPostId: string | null | undefined,
  deletedPostId: string,
): string | null {
  if (!pinnedPostId || pinnedPostId === deletedPostId) return null;
  return pinnedPostId;
}

export function profileWithPin<T extends { id: string; pinnedPostId?: string | null }>(
  profiles: readonly T[],
  userId: string,
  pinnedPostId: string | null,
): T[] {
  return profiles.map((profile) =>
    profile.id === userId ? { ...profile, pinnedPostId } : profile,
  );
}

export type ProfileTabCard = PublicCard & {
  ownerId?: string | null;
  isPublic?: boolean | null;
};

function cardIdentity(card: ProfileTabCard): string {
  return `${card.year}|${card.playerName}|${card.cardNumber ?? ""}`.toLowerCase();
}

/**
 * Cards tab. Rows should come from public_cards.
 * isPublic === false never appears, including when the viewer is someone else
 * and a private book card was passed in by mistake.
 * The owner's public book rows fill in a card that is not in the view yet.
 */
export function profileCardsTab(input: {
  ownerId: string;
  viewerId: string | null;
  publicCards: readonly ProfileTabCard[];
  ownBook?: readonly ProfileTabCard[];
}): ProfileTabCard[] {
  const seen = new Set<string>();
  const out: ProfileTabCard[] = [];
  const add = (card: ProfileTabCard, requirePublicFlag: boolean) => {
    if (card.ownerId != null && card.ownerId !== input.ownerId) return;
    if (card.isPublic === false) return;
    if (requirePublicFlag && card.isPublic !== true) return;
    const key = cardIdentity(card);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(card);
  };
  for (const card of input.publicCards) add(card, false);
  if (input.viewerId != null && input.viewerId === input.ownerId) {
    for (const card of input.ownBook ?? []) add(card, true);
  }
  return out;
}

/** One profile's rows from public_cards. Private cards are not in that view. */
export async function loadProfilePublicCards(
  supabase: SupabaseClient,
  userId: string,
): Promise<OwnedCard[]> {
  const { data, error } = await supabase
    .from("public_cards")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Parameters<typeof mapPublicCard>[0][]).map((row) => mapPublicCard(row));
}
