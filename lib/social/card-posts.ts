import type { SupabaseClient } from "@supabase/supabase-js";
import type { Post, Profile, PublicCard } from "./types";

const POST_SELECT = "id, user_id, content, image_url, card, quoted_post_id, created_at";
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
  };
}

function mapPostRow(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.user_id,
    body: row.content ?? "",
    imageDataUrl: row.image_url,
    card: sanitizeAttachedCard(row.card),
    quotedPostId: row.quoted_post_id ?? null,
    createdAt: row.created_at,
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
  const { data, error } = await supabase.from("posts").select(POST_SELECT).in("id", missing);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as PostRow[]) {
    const mapped = mapPostRow(row);
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
    const nested = await supabase.from("posts").select(POST_SELECT).in("id", nestedMissing);
    if (nested.error) throw new Error(nested.error.message);
    for (const row of (nested.data ?? []) as PostRow[]) {
      related.push(mapPostRow(row));
    }
  }
  return related;
}

/**
 * Posts that attach this card, newest first.
 * Only returns rows when the card is visible via public_cards (RLS/view).
 * Never selects paid price or notes from cards.
 */
export async function loadPostsForCard(
  supabase: SupabaseClient,
  cardId: string,
  options?: { limit?: number },
): Promise<{
  posts: Post[];
  relatedPosts: Post[];
  authors: Map<string, Profile>;
  hasMore: boolean;
}> {
  const limit = Math.max(1, options?.limit ?? 5);

  const { data: visible, error: visibleError } = await supabase
    .from("public_cards")
    .select("id")
    .eq("id", cardId)
    .maybeSingle();
  if (visibleError) throw new Error(visibleError.message);
  if (!visible) {
    return { posts: [], relatedPosts: [], authors: new Map(), hasMore: false };
  }

  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .filter("card->>id", "eq", cardId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as PostRow[];
  const hasMore = rows.length > limit;
  const sliced = rows.slice(0, limit).map(mapPostRow);
  const relatedPosts = await loadQuotedPosts(supabase, sliced);

  const authorIds = [
    ...new Set([...sliced, ...relatedPosts].map((post) => post.authorId)),
  ];
  const authors = await loadProfilesById(supabase, authorIds);

  return { posts: sliced, relatedPosts, authors, hasMore };
}

/** Client/local fallback: filter already-loaded posts when the card is public. */
export function filterLoadedPostsForCard(
  posts: Post[],
  cardId: string,
  publicCardIds: Set<string>,
  limit: number,
): { posts: Post[]; hasMore: boolean } {
  if (!publicCardIds.has(cardId)) {
    return { posts: [], hasMore: false };
  }
  const matched = posts
    .filter((post) => post.card?.id === cardId)
    .map((post) => ({
      ...post,
      card: sanitizeAttachedCard(post.card),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    posts: matched.slice(0, limit),
    hasMore: matched.length > limit,
  };
}
