import type { SupabaseClient } from "@supabase/supabase-js";
import { withAuthorSafety } from "@/lib/safety/filters";
import { formatGrade, parseGrade } from "@/lib/card-options";
import { isUuid } from "@/lib/value/card-value-access";
import { cardIdentityKey, type IdentityCard } from "./card-identity";
import { loadMailDayPaid, presentMailDay } from "./mail-day";
import { mapPublicCard, PUBLIC_CARD_SELECT, type CardRow } from "./cards";
import type { Post, Profile, PublicCard } from "./types";

export type CardPostsCursor = {
  createdAt: string;
  id: string;
};

/** Post attachment: public card fields only. */
export function toPublicAttachment(card: {
  id: string;
  playerName: string;
  year: number;
  yearLabel?: string;
  setBrand: string;
  cardNumber: string;
  sport: string;
  photoDataUrl: string | null;
  accent: string;
  estimatedSellPrice: number;
  grade?: string;
  parallel?: string;
  conditionType?: "raw" | "graded";
  grader?: string | null;
}): PublicCard {
  return {
    id: card.id,
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    sport: card.sport,
    photoDataUrl: card.photoDataUrl,
    accent: card.accent,
    estimatedSellPrice: card.estimatedSellPrice,
    grade: card.grade,
    parallel: card.parallel,
    conditionType: card.conditionType,
    grader: card.grader || undefined,
  };
}

const POST_SELECT =
  "id, user_id, content, image_url, card, quoted_post_id, created_at, post_type, show_paid, meta";
const PROFILE_SELECT =
  "id, username, display_name, bio, avatar_url, cover_url, accent, created_at";

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  card: unknown;
  quoted_post_id?: string | null;
  created_at: string;
  post_type?: string | null;
  show_paid?: boolean | null;
  meta?: unknown;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  accent: string | null;
  created_at: string;
};

/** Strip paid/notes/private fields from a post's attached card snapshot. */
export function sanitizeAttachedCard(raw: unknown): PublicCard | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  return {
    id: row.id,
    playerName: typeof row.playerName === "string" ? row.playerName : "",
    year: typeof row.year === "number" ? row.year : Number(row.year) || 0,
    setBrand: typeof row.setBrand === "string" ? row.setBrand : "",
    cardNumber: typeof row.cardNumber === "string" ? row.cardNumber : "",
    sport: typeof row.sport === "string" ? row.sport : "Basketball",
    photoDataUrl: typeof row.photoDataUrl === "string" ? row.photoDataUrl : null,
    accent: typeof row.accent === "string" ? row.accent : "#7c5cff",
    estimatedSellPrice:
      typeof row.estimatedSellPrice === "number"
        ? row.estimatedSellPrice
        : Number(row.estimatedSellPrice) || 0,
    grade: typeof row.grade === "string" ? row.grade : undefined,
    parallel: typeof row.parallel === "string" ? row.parallel : undefined,
    yearLabel: typeof row.yearLabel === "string" ? row.yearLabel : undefined,
    conditionType:
      row.conditionType === "raw" || row.conditionType === "graded"
        ? row.conditionType
        : undefined,
    grader: typeof row.grader === "string" ? row.grader : undefined,
  };
}

function mapPostRow(
  row: PostRow,
  viewerId: string | null,
  publicIds: ReadonlySet<string>,
  paid: number | null,
): Post {
  const card = sanitizeAttachedCard(row.card);
  const mailDay = presentMailDay({
    postType: row.post_type,
    showPaid: row.show_paid,
    meta: row.meta,
    authorId: row.user_id,
    viewerId,
    cardIsPublic: Boolean(card && publicIds.has(card.id)),
    paid,
  });
  return {
    id: row.id,
    authorId: row.user_id,
    body: row.content ?? "",
    imageDataUrl: row.image_url,
    card,
    quotedPostId: row.quoted_post_id ?? null,
    createdAt: row.created_at,
    postType: row.post_type === "mail_day" ? "mail_day" : "post",
    showPaid: row.show_paid === true,
    mailDay,
  };
}

function mapProfileRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: "",
    username: row.username,
    displayName: row.display_name,
    bio: row.bio ?? "",
    avatarDataUrl: row.avatar_url,
    coverDataUrl: row.cover_url ?? null,
    accent: row.accent ?? "#7c5cff",
    createdAt: row.created_at,
  };
}

async function loadProfilesById(
  supabase: SupabaseClient,
  authorIds: string[],
): Promise<Map<string, Profile>> {
  const authors = new Map<string, Profile>();
  if (authorIds.length === 0) return authors;
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("id", authorIds);
  if (profileError) throw new Error(profileError.message);
  for (const row of (profileRows ?? []) as ProfileRow[]) {
    authors.set(row.id, mapProfileRow(row));
  }
  return authors;
}

async function mapPostRows(
  supabase: SupabaseClient,
  rows: PostRow[],
  viewerId: string | null,
  publicIds: ReadonlySet<string>,
): Promise<Post[]> {
  const paidByPost = await loadMailDayPaid(
    supabase,
    rows.filter((row) => row.post_type === "mail_day").map((row) => row.id),
  );
  return rows.map((row) =>
    mapPostRow(row, viewerId, publicIds, paidByPost.get(row.id) ?? null),
  );
}

async function publicIdsFor(
  supabase: SupabaseClient,
  rows: PostRow[],
): Promise<Set<string>> {
  const ids = [
    ...new Set(
      rows
        .map((row) => sanitizeAttachedCard(row.card)?.id)
        .filter((id): id is string => Boolean(id && isUuid(id))),
    ),
  ];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.from("public_cards").select("id").in("id", ids);
  if (error) return new Set();
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
}

/** Fetch missing quoted posts (one nested hop) so quote embeds can resolve. */
async function loadQuotedPosts(
  supabase: SupabaseClient,
  posts: Post[],
): Promise<Post[]> {
  const known = new Set(posts.map((post) => post.id));
  const missing = [
    ...new Set(
      posts
        .map((post) => post.quotedPostId)
        .filter((id): id is string => Boolean(id) && !known.has(id!)),
    ),
  ];
  if (missing.length === 0) return [];

  const related: Post[] = [];
  const { data: sessionData } = await supabase.auth.getSession();
  const viewerId = sessionData.session?.user.id ?? null;
  const { query: quotedQuery } = await withAuthorSafety(
    supabase,
    supabase.from("posts").select(POST_SELECT).in("id", missing),
    viewerId,
  );
  const { data, error } = await quotedQuery;
  if (error) throw new Error(error.message);
  const quotedRows = (data ?? []) as PostRow[];
  const publicIds = await publicIdsFor(supabase, quotedRows);
  const quotedPosts = await mapPostRows(supabase, quotedRows, viewerId, publicIds);
  for (const mapped of quotedPosts) {
    related.push(mapped);
    known.add(mapped.id);
  }

  const nestedMissing = [
    ...new Set(
      related
        .map((post) => post.quotedPostId)
        .filter((id): id is string => Boolean(id) && !known.has(id!)),
    ),
  ];
  if (nestedMissing.length > 0) {
    const { query: nestedQuery } = await withAuthorSafety(
      supabase,
      supabase.from("posts").select(POST_SELECT).in("id", nestedMissing),
      viewerId,
    );
    const nested = await nestedQuery;
    if (nested.error) throw new Error(nested.error.message);
    const nestedRows = (nested.data ?? []) as PostRow[];
    const nestedPublicIds = await publicIdsFor(supabase, nestedRows);
    related.push(...(await mapPostRows(supabase, nestedRows, viewerId, nestedPublicIds)));
  }
  return related;
}

type AboutCardRow = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  quoted_post_id: string | null;
  created_at: string;
  attached_id: string | null;
  attached_player: string | null;
  attached_year: number | null;
  attached_year_label: string | null;
  attached_set: string | null;
  attached_number: string | null;
  attached_sport: string | null;
  attached_image: string | null;
  attached_accent: string | null;
  attached_estimate: number | string | null;
  attached_grade: string | null;
  attached_grader: string | null;
  attached_parallel: string | null;
  attached_condition: string | null;
  attached_is_public?: boolean | null;
  post_type?: string | null;
  show_paid?: boolean | null;
  meta?: unknown;
};

export type CardPostsPage = {
  posts: Post[];
  relatedPosts: Post[];
  authors: Map<string, Profile>;
  hasMore: boolean;
  nextCursor: CardPostsCursor | null;
};

function attachedGrade(row: AboutCardRow): string | undefined {
  const grader = (row.attached_grader ?? "").trim();
  const grade = (row.attached_grade ?? "").trim();
  if (!grader && !grade) return undefined;
  if (!grader) return grade;
  const number = /^\d+(?:\.\d+)?$/.test(grade) ? grade : parseGrade(grade).number;
  return formatGrade(grader, number);
}

function attachedCard(row: AboutCardRow): PublicCard | null {
  if (!row.attached_id) return null;
  const condition = row.attached_condition;
  return toPublicAttachment({
    id: row.attached_id,
    playerName: row.attached_player ?? "",
    year: Number(row.attached_year) || 0,
    yearLabel: row.attached_year_label ?? undefined,
    setBrand: row.attached_set ?? "",
    cardNumber: row.attached_number ?? "",
    sport: row.attached_sport ?? "Basketball",
    photoDataUrl: row.attached_image,
    accent: row.attached_accent || "#7c5cff",
    estimatedSellPrice: Number(row.attached_estimate) || 0,
    grade: attachedGrade(row),
    parallel: row.attached_parallel ?? undefined,
    conditionType: condition === "raw" || condition === "graded" ? condition : undefined,
    grader: row.attached_grader,
  });
}

function dedupePosts(posts: Post[]): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    out.push(post);
  }
  return out.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}

/**
 * Posts about this card or another public copy with the same identity.
 * Matching cards come from public_cards inside posts_about_card.
 * Returns null when cardId is not a uuid so the caller can use the local fallback.
 */
export async function loadPostsForCard(
  supabase: SupabaseClient,
  cardId: string,
  options?: { limit?: number; cursor?: CardPostsCursor | null },
): Promise<CardPostsPage | null> {
  if (!isUuid(cardId)) return null;
  const limit = Math.min(40, Math.max(1, options?.limit ?? 5));
  const cursor = options?.cursor ?? null;

  const { data, error } = await supabase.rpc("posts_about_card", {
    p_card_id: cardId,
    p_limit: limit + 1,
    p_before: cursor?.createdAt ?? null,
    p_before_id: cursor && isUuid(cursor.id) ? cursor.id : null,
  });
  if (error) throw new Error(error.message);

  const { data: sessionData } = await supabase.auth.getSession();
  const viewerId = sessionData.session?.user.id ?? null;
  const aboutRows = (data ?? []) as AboutCardRow[];
  const paidByPost = await loadMailDayPaid(
    supabase,
    aboutRows.filter((row) => row.post_type === "mail_day").map((row) => row.id),
  );
  const rows = aboutRows.map((row) => {
    const card = attachedCard(row);
    const mailDay = presentMailDay({
      postType: row.post_type,
      showPaid: row.show_paid,
      meta: row.meta,
      authorId: row.user_id,
      viewerId,
      cardIsPublic: row.attached_is_public === true,
      paid: paidByPost.get(row.id) ?? null,
    });
    return {
      id: row.id,
      authorId: row.user_id,
      body: row.content ?? "",
      imageDataUrl: row.image_url,
      card,
      quotedPostId: row.quoted_post_id ?? null,
      createdAt: row.created_at,
      postType: row.post_type === "mail_day" ? ("mail_day" as const) : ("post" as const),
      showPaid: row.show_paid === true,
      mailDay,
    };
  });
  const unique = dedupePosts(rows);
  const hasMore = unique.length > limit;
  const posts = unique.slice(0, limit);
  const relatedPosts = await loadQuotedPosts(supabase, posts);
  const withPublicCards = await overlayPublicCards(supabase, relatedPosts);

  const authorIds = [
    ...new Set([...posts, ...withPublicCards].map((post) => post.authorId)),
  ];
  const authors = await loadProfilesById(supabase, authorIds);
  const last = posts[posts.length - 1];

  return {
    posts,
    relatedPosts: withPublicCards,
    authors,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

/** Replace quoted-post snapshots with public_cards rows when the card is public. */
async function overlayPublicCards(
  supabase: SupabaseClient,
  posts: Post[],
): Promise<Post[]> {
  const ids = [
    ...new Set(posts.map((post) => post.card?.id).filter((id): id is string => Boolean(id && isUuid(id)))),
  ];
  if (ids.length === 0) return posts;
  const { data, error } = await supabase
    .from("public_cards")
    .select(PUBLIC_CARD_SELECT)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map<string, PublicCard>();
  for (const row of (data ?? []) as CardRow[]) {
    const mapped = mapPublicCard(row);
    byId.set(mapped.id, toPublicAttachment(mapped));
  }
  return posts.map((post) => {
    const safe = post.card ? byId.get(post.card.id) : undefined;
    if (!safe) return { ...post, card: sanitizeAttachedCard(post.card) };
    return { ...post, card: safe };
  });
}

function allowedPublicIds(
  cardId: string,
  publicCardIds: Set<string>,
  publicCards?: Array<IdentityCard & { id: string }>,
): Set<string> {
  const visible = (publicCards ?? []).filter((card) => publicCardIds.has(card.id));
  const subject = visible.find((card) => card.id === cardId);
  if (!subject) return publicCardIds.has(cardId) ? new Set([cardId]) : new Set();
  const key = cardIdentityKey(subject);
  return new Set(
    visible.filter((card) => cardIdentityKey(card) === key).map((card) => card.id),
  );
}

/** Client/local fallback: filter already-loaded posts. Private cards stay out. */
export function filterLoadedPostsForCard(
  posts: Post[],
  cardId: string,
  publicCardIds: Set<string>,
  limit: number,
  options?: {
    publicCards?: Array<IdentityCard & { id: string }>;
    cursor?: CardPostsCursor | null;
  },
): { posts: Post[]; hasMore: boolean; nextCursor: CardPostsCursor | null } {
  const cursor = options?.cursor ?? null;
  const allowed = allowedPublicIds(cardId, publicCardIds, options?.publicCards);
  const matched = dedupePosts(
    posts
      .filter((post) => (post.card?.id ? allowed.has(post.card.id) : false))
      .filter((post) => {
        if (!cursor) return true;
        if (post.createdAt < cursor.createdAt) return true;
        if (post.createdAt > cursor.createdAt) return false;
        return post.id < cursor.id;
      })
      .map((post) => ({
        ...post,
        card: sanitizeAttachedCard(post.card),
      })),
  );
  const page = matched.slice(0, limit);
  const last = page[page.length - 1];
  return {
    posts: page,
    hasMore: matched.length > limit,
    nextCursor:
      matched.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}
