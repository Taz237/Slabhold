import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPublicCard, PUBLIC_CARD_SELECT } from "@/lib/social/cards";
import { mailDayPhotoUrls, postShareImage, scrubPublicText, type ShareImage } from "@/lib/social/share-image";
import { isUuid } from "@/lib/value/card-value-access";
import { postStoryLink } from "./links";

/**
 * A post's Story image, read the way a logged-out visitor sees it. Hidden,
 * deleted and unknown posts are null (a 404). Paid prices, notes and card
 * values are never read: the image draws the post, its public cards' photos
 * and labels, and the like and reply counts.
 */
export type PostStoryRead = { model: ShareImage; authorId: string; username: string };

type PostRow = {
  id: string;
  user_id: string | null;
  content: string | null;
  image_url: string | null;
  card: unknown;
  post_type: string | null;
  meta: unknown;
  hidden_at: string | null;
};

const POST_COLUMNS = "id, user_id, content, image_url, card, post_type, meta, hidden_at";

function linkedCardIds(card: unknown, meta: unknown): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string" || !isUuid(value) || ids.includes(value)) return;
    ids.push(value);
  };
  if (card && typeof card === "object") push((card as { id?: unknown }).id);
  if (meta && typeof meta === "object") {
    const cards = (meta as { cards?: unknown }).cards;
    if (Array.isArray(cards)) {
      for (const item of cards) {
        if (item && typeof item === "object") push((item as { id?: unknown }).id);
      }
    }
  }
  return ids.slice(0, 3);
}

/** Photos saved on the post's card snapshot, used only for cards confirmed public. */
function snapshotPhotos(card: unknown, meta: unknown): Map<string, string> {
  const found = new Map<string, string>();
  const take = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const { id, photoDataUrl } = value as { id?: unknown; photoDataUrl?: unknown };
    if (typeof id === "string" && typeof photoDataUrl === "string" && !found.has(id)) found.set(id, photoDataUrl);
  };
  take(card);
  if (meta && typeof meta === "object") {
    const cards = (meta as { cards?: unknown }).cards;
    if (Array.isArray(cards)) cards.forEach(take);
  }
  return found;
}

function metaImages(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const images = (meta as { images?: unknown }).images;
  return Array.isArray(images) ? images.filter((url): url is string => typeof url === "string").slice(0, 3) : [];
}

function count(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Like count lives on the post row. A missing column or error just leaves it out. */
async function readLikes(client: SupabaseClient, id: string): Promise<number | null> {
  try {
    const { data, error } = await client.from("posts").select("like_count").eq("id", id).maybeSingle();
    return error || !data ? null : count((data as { like_count?: unknown }).like_count);
  } catch {
    return null;
  }
}

async function readReplies(client: SupabaseClient, id: string): Promise<number | null> {
  try {
    const { count: total, error } = await client
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id);
    return error ? null : count(total);
  } catch {
    return null;
  }
}

type CardInput = NonNullable<Parameters<typeof postShareImage>[0]["cards"]>[number];

async function readCards(client: SupabaseClient, post: PostRow): Promise<CardInput[]> {
  const ids = linkedCardIds(post.card, post.meta);
  if (!ids.length) return [];
  const { data } = await client.from("public_cards").select(PUBLIC_CARD_SELECT).in("id", ids);
  const byId = new Map(((data ?? []) as { id: string }[]).map((row) => [row.id, row]));
  const snapshots = snapshotPhotos(post.card, post.meta);
  return ids.map((cardId): CardInput => {
    const row = byId.get(cardId);
    // Private or deleted: nothing about the card is drawn.
    if (!row) return { isPublic: false, name: "", valueLabel: null, imageUrl: null };
    const mapped = mapPublicCard(row as Parameters<typeof mapPublicCard>[0]);
    return {
      isPublic: true,
      name: mapped.playerName,
      // No values on a Story: the image is the post, not a price check.
      valueLabel: null,
      imageUrl: mapped.photoDataUrl,
      snapshotImageUrl: snapshots.get(cardId) ?? null,
      player: mapped.playerName,
      year: mapped.year,
      yearLabel: mapped.yearLabel,
      setBrand: mapped.setBrand,
      parallel: mapped.parallel,
      grade: mapped.grade,
      grader: mapped.grader,
      conditionType: mapped.conditionType,
    };
  });
}

/**
 * Read one post for its Story image with a logged-out (anon) client, so RLS
 * hides what a visitor can't see. The link has no invite code here; see
 * withInviteCode.
 */
export async function readPostStory(
  client: SupabaseClient | null,
  id: string,
): Promise<PostStoryRead | null> {
  if (!client || !isUuid(id)) return null;
  const { data, error } = await client.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const post = data as PostRow;
  // RLS already drops hidden posts for visitors. Check again, in case a reader ever sees more.
  if (post.hidden_at) return null;
  const authorId = typeof post.user_id === "string" && isUuid(post.user_id) ? post.user_id : "";
  if (!authorId) return null;

  const { data: profile } = await client
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", authorId)
    .maybeSingle();
  // No public profile, no invite link: nothing to share.
  if (!profile) return null;
  const author = profile as { username?: string | null; display_name?: string | null; avatar_url?: string | null };

  const [cards, likes, replies] = await Promise.all([
    readCards(client, post),
    readLikes(client, id),
    readReplies(client, id),
  ]);
  const postType = post.post_type === "mail_day" ? "mail_day" : "post";
  const body = post.content ?? "";
  const model = postShareImage({
    found: true,
    body,
    authorName: author.display_name ?? null,
    authorHandle: author.username ?? null,
    avatarUrl: author.avatar_url ?? null,
    imageUrl: post.image_url,
    postPhotos: postType === "mail_day" ? [] : metaImages(post.meta),
    postType,
    mailDayPhotos: postType === "mail_day" ? mailDayPhotoUrls(post.meta, post.image_url) : [],
    cards,
  });
  // postShareImage keeps only a well-formed handle. Without one there is no invite link.
  const username = model.authorHandle;
  if (!username) return null;
  return {
    model: {
      ...model,
      // The Story never draws a card's value line.
      cardLines: model.cardLines.map((line) => ({ ...line, value: "" })),
      story: {
        likes,
        replies,
        link: postStoryLink(username),
        hasText: Boolean(scrubPublicText(body)),
      },
    },
    authorId,
    username,
  };
}

/** The author's own image carries their invite code. Everyone else's never does. */
export function withInviteCode(read: PostStoryRead, viewerId: string | null, code: string | null): ShareImage {
  const own = Boolean(viewerId) && viewerId === read.authorId;
  const story = read.model.story;
  if (!story) return read.model;
  return { ...read.model, story: { ...story, link: postStoryLink(read.username, own ? code : null) } };
}
