import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlike } from "@/lib/db/escape-ilike";
import { mapDirectMessage } from "@/lib/offers/open-to-offers";
import { applyAuthorSafety, loadHiddenAuthorIds, type SafetyQuery } from "@/lib/safety/filters";
import { mapPublicCard, PUBLIC_CARD_SELECT } from "./cards";
import { unreadGroupCount } from "./group-notifications";
import { dedupeMailDayRows, loadMailDayViews } from "./mail-day";
import { homeHead, type HomeHead } from "./feed-page";
import { olderThanCursor, pageAfter, type PageCursor } from "./page-cursor";
import { ilikeExact } from "./username-taken";
import type {
  FollowEdge,
  Notification,
  OwnedCard,
  Post,
  PostRepost,
  Profile,
  SocialSnapshot,
} from "./types";
import type { FollowCounts } from "./optimistic-patch";

export const VIEWER_PROFILE_COLUMNS =
  "id, username, display_name, bio, avatar_url, cover_url, accent, created_at, is_test, pinned_post_id";
export const PROFILE_COLUMNS =
  "id, username, display_name, bio, avatar_url, cover_url, accent, created_at, pinned_post_id";
export const FOLLOW_COLUMNS = "follower_id, following_id, created_at";
export const NOTIFICATION_COLUMNS =
  "id, recipient_id, actor_id, kind, post_id, preview, href, metadata, read, created_at";
export const POST_COLUMNS =
  "id, user_id, content, image_url, card, quoted_post_id, created_at, post_type, show_paid, meta";
export const NOTIFICATION_PAGE_SIZE = 50;
export const FOLLOW_LIST_PAGE_SIZE = 50;
export const PUBLIC_CARD_PAGE_SIZE = 100;
export const SEARCH_PAGE_SIZE = 20;

type DbError = { code?: string; message?: string } | null;

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  accent: string | null;
  created_at: string;
  is_test?: boolean | null;
  pinned_post_id?: string | null;
};

type FollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  kind: Notification["kind"];
  post_id: string | null;
  preview: string | null;
  href?: string | null;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

export function emptySocialSnapshot(): SocialSnapshot {
  return {
    user: null,
    profiles: [],
    posts: [],
    follows: [],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
    messages: [],
    publicCards: [],
    homePosts: [],
    homeReposts: [],
    blockedIds: [],
    mutedIds: [],
    safetyAccounts: [],
  };
}

function missingTable(error: DbError) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function missingColumn(error: DbError) {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? "");
}

export function mapScopedProfile(row: ProfileRow, email = ""): Profile {
  return {
    id: row.id,
    email,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio ?? "",
    avatarDataUrl: row.avatar_url,
    coverDataUrl: row.cover_url ?? null,
    accent: row.accent ?? "#7c5cff",
    createdAt: row.created_at,
    pinnedPostId: typeof row.pinned_post_id === "string" ? row.pinned_post_id : null,
    ...(row.is_test === true ? { isTest: true } : {}),
  };
}

function mapFollow(row: FollowRow): FollowEdge {
  return {
    followerId: row.follower_id,
    followingId: row.following_id,
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    actorId: row.actor_id,
    kind: row.kind,
    postId: row.post_id,
    preview: row.preview,
    href: row.href ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
    read: row.read,
  };
}

export function mergeProfiles(current: readonly Profile[], extra: readonly Profile[]): Profile[] {
  const byId = new Map(current.map((profile) => [profile.id, profile]));
  for (const profile of extra) byId.set(profile.id, { ...byId.get(profile.id), ...profile });
  return [...byId.values()];
}

export function mergePosts(current: readonly Post[], extra: readonly Post[]): Post[] {
  const byId = new Map(current.map((post) => [post.id, post]));
  for (const post of extra) byId.set(post.id, post);
  return [...byId.values()];
}

/** Replace one owner's public cards. Other owners stay as they were. */
export function replaceOwnerCards(
  current: readonly OwnedCard[],
  ownerId: string,
  next: readonly OwnedCard[],
): OwnedCard[] {
  return [...current.filter((card) => card.ownerId !== ownerId), ...next];
}

export function applyViewerShell(existing: SocialSnapshot, shell: SocialSnapshot): SocialSnapshot {
  if (!shell.user) return emptySocialSnapshot();
  if (existing.user && existing.user.id !== shell.user.id) return shell;
  return {
    ...existing,
    user: shell.user,
    profiles: mergeProfiles(mergeProfiles(existing.profiles, shell.profiles), shell.safetyAccounts ?? []),
    follows: shell.follows,
    blockedIds: shell.blockedIds ?? [],
    mutedIds: shell.mutedIds ?? [],
    safetyAccounts: shell.safetyAccounts ?? existing.safetyAccounts ?? [],
  };
}

export type UnreadCounts = { notifications: number; messages: number };

const emptyUnread = { notifications: 0, messages: 0 };

const UNREAD_NOTE_COLUMNS =
  "id, recipient_id, actor_id, kind, post_id, created_at, read";

/**
 * Bell badge is the grouped unread count, matching the notifications list.
 * Message badge stays a head count. RLS hides blocked and muted actors.
 */
export async function loadUnreadCounts(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<UnreadCounts> {
  const [notes, messages] = await Promise.all([
    supabase
      .from("notifications")
      .select(UNREAD_NOTE_COLUMNS)
      .eq("recipient_id", viewerId)
      .eq("read", false),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", viewerId)
      .eq("read", false),
  ]);
  if (notes.error && !missingTable(notes.error)) throw new Error(notes.error.message);
  const rows = notes.error ? [] : ((notes.data ?? []) as NotificationRow[]);
  return {
    notifications: unreadGroupCount(
      rows.map((row) => ({
        id: row.id,
        recipientId: row.recipient_id,
        actorId: row.actor_id,
        kind: row.kind,
        postId: row.post_id,
        preview: null,
        href: null,
        metadata: null,
        createdAt: row.created_at,
        read: row.read,
      })),
    ),
    messages: countOrZero(messages.error, messages.count),
  };
}

function countOrZero(error: DbError, count: number | null) {
  if (error && !missingTable(error)) throw new Error(error.message);
  return count ?? 0;
}

export type ShellBundle = {
  shell: SocialSnapshot;
  /** Hidden authors for the signed-in home feed, loaded with the shell. Empty when signed out. */
  hiddenAuthorIds: readonly string[];
  unread: UnreadCounts;
};

/**
 * Signed-in shell: profile, follow edges, blocks, mutes, hidden authors, the grouped unread notification rows, and an unread message head count.
 * Blocks, mutes, and hidden_author_ids run in one parallel batch so the home feed does not
 * wait on them one after another. No posts, public cards, comments, or reposts.
 * Signed-out: no table reads.
 */
export async function loadShellBundle(supabase: SupabaseClient): Promise<ShellBundle> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const viewerId = session?.user.id ?? null;
  if (!viewerId) return { shell: emptySocialSnapshot(), hiddenAuthorIds: [], unread: emptyUnread };

  const [profileRes, followsRes, blocksRes, mutesRes, hiddenAuthorIds, unread] = await Promise.all([
    supabase.from("profiles").select(VIEWER_PROFILE_COLUMNS).eq("id", viewerId).maybeSingle(),
    supabase.from("follows").select(FOLLOW_COLUMNS).or(`follower_id.eq.${viewerId},following_id.eq.${viewerId}`),
    supabase.from("blocks").select("blocked_id"),
    supabase.from("mutes").select("muted_id"),
    loadHiddenAuthorIds(supabase, true),
    loadUnreadCounts(supabase, viewerId),
  ]);
  if (profileRes.error) throw new Error(profileRes.error.message);
  if (followsRes.error) throw new Error(followsRes.error.message);
  if (blocksRes.error && !missingTable(blocksRes.error)) throw new Error(blocksRes.error.message);
  if (mutesRes.error && !missingTable(mutesRes.error)) throw new Error(mutesRes.error.message);

  const profileRow = profileRes.data as ProfileRow | null;
  const user = profileRow
    ? mapScopedProfile(profileRow, session?.user.email ?? "")
    : null;
  const follows = ((followsRes.data ?? []) as FollowRow[]).map(mapFollow);
  const blockedIds = ((blocksRes.data ?? []) as { blocked_id: string }[]).map((row) => row.blocked_id);
  const mutedIds = ((mutesRes.data ?? []) as { muted_id: string }[]).map((row) => row.muted_id);
  const safetyIds = [...new Set([...blockedIds, ...mutedIds])];
  let safetyAccounts: Profile[] = [];
  if (safetyIds.length > 0) {
    const extra = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", safetyIds);
    if (extra.error) throw new Error(extra.error.message);
    safetyAccounts = ((extra.data ?? []) as ProfileRow[]).map((row) => mapScopedProfile(row));
  }

  return {
    shell: {
      ...emptySocialSnapshot(),
      user,
      profiles: user ? mergeProfiles([user], safetyAccounts) : safetyAccounts,
      follows,
      blockedIds,
      mutedIds,
      safetyAccounts,
    },
    hiddenAuthorIds,
    unread,
  };
}

export async function loadViewerShell(supabase: SupabaseClient): Promise<SocialSnapshot> {
  return (await loadShellBundle(supabase)).shell;
}

export type NotificationPage = {
  notifications: Notification[];
  profiles: Profile[];
  hasMore: boolean;
  cursor: PageCursor | null;
};

/** One page of the viewer's notifications, newest first, plus the actors on that page. */
export async function loadNotificationPage(
  supabase: SupabaseClient,
  viewerId: string,
  cursor: PageCursor | null,
): Promise<NotificationPage> {
  const hidden = await loadHiddenAuthorIds(supabase, true);
  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_id", viewerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE);
  if (cursor) query = query.or(olderThanCursor(cursor));
  const guarded = applyAuthorSafety(query as unknown as SafetyQuery, viewerId, hidden, {
    authorColumn: "actor_id",
    mute: true,
    keepNullAuthor: true,
  });
  const { data, error } = await (guarded as typeof query);
  if (error && !missingTable(error)) throw new Error(error.message);
  const rows = (data ?? []) as NotificationRow[];
  const notifications = rows.map(mapNotification);
  const actorIds = [...new Set(notifications.map((note) => note.actorId).filter((id): id is string => Boolean(id)))];
  const tail = pageAfter(rows, NOTIFICATION_PAGE_SIZE);
  return {
    notifications,
    profiles: await loadProfilesByIds(supabase, actorIds),
    hasMore: tail.hasMore,
    cursor: tail.cursor,
  };
}

async function loadProfilesByIds(supabase: SupabaseClient, ids: readonly string[]): Promise<Profile[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", unique);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProfileRow[]).map((row) => mapScopedProfile(row));
}

async function loadProfileByUsername(supabase: SupabaseClient, username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .ilike("username", ilikeExact(username))
    .limit(1);
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as ProfileRow[])[0];
  return row ? mapScopedProfile(row) : null;
}

async function headCount(
  supabase: SupabaseClient,
  column: "follower_id" | "following_id",
  userId: string,
): Promise<number> {
  const filtered =
    column === "follower_id"
      ? supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", userId)
      : supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", userId);
  const { count, error } = await filtered;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type CardPage = {
  cards: OwnedCard[];
  hasMore: boolean;
  cursor: PageCursor | null;
};

export type ProfileSlice = {
  profile: Profile | null;
  counts: FollowCounts;
  cards: OwnedCard[];
  cardsHasMore: boolean;
  cardsCursor: PageCursor | null;
};

/** The profile on screen, its two follow counts, and the newest page of that owner's public cards. */
export async function loadProfileSlice(
  supabase: SupabaseClient,
  input: { username: string | null; viewerId: string | null; viewer: Profile | null },
): Promise<ProfileSlice> {
  const profile = input.username
    ? await loadProfileByUsername(supabase, input.username)
    : input.viewer;
  if (!profile) {
    return { profile: null, counts: { followers: 0, following: 0 }, cards: [], cardsHasMore: false, cardsCursor: null };
  }
  const [followers, following, cards] = await Promise.all([
    headCount(supabase, "follower_id", profile.id),
    headCount(supabase, "following_id", profile.id),
    loadOwnerCardPage(supabase, profile.id, null),
  ]);
  return {
    profile,
    counts: { followers, following },
    cards: cards.cards,
    cardsHasMore: cards.hasMore,
    cardsCursor: cards.cursor,
  };
}

export async function loadOwnerCardPage(
  supabase: SupabaseClient,
  ownerId: string,
  cursor: PageCursor | null,
): Promise<CardPage> {
  const run = (columns: string) => {
    let query = supabase
      .from("public_cards")
      .select(columns)
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PUBLIC_CARD_PAGE_SIZE);
    if (cursor) query = query.or(olderThanCursor(cursor));
    return query;
  };
  const withOffers = await run(`${PUBLIC_CARD_SELECT}, open_to_offers`);
  const result =
    withOffers.error && missingColumn(withOffers.error) ? await run(PUBLIC_CARD_SELECT) : withOffers;
  if (result.error && !missingTable(result.error)) throw new Error(result.error.message);
  const rows = (result.data ?? []) as unknown as (Parameters<typeof mapPublicCard>[0] & {
    id: string;
    created_at?: string | null;
  })[];
  const tail = pageAfter(
    rows.map((row) => ({ id: row.id, created_at: row.created_at ?? "" })),
    PUBLIC_CARD_PAGE_SIZE,
  );
  return { cards: rows.map((row) => mapPublicCard(row)), hasMore: tail.hasMore, cursor: tail.cursor };
}

export type FollowListPage = {
  profile: Profile | null;
  follows: FollowEdge[];
  profiles: Profile[];
  hasMore: boolean;
  cursor: PageCursor | null;
};

export async function loadFollowList(
  supabase: SupabaseClient,
  input: {
    direction: "followers" | "following";
    username: string | null;
    viewer: Profile | null;
    cursor?: PageCursor | null;
  },
): Promise<FollowListPage> {
  const profile = input.username
    ? await loadProfileByUsername(supabase, input.username)
    : input.viewer;
  if (!profile) return { profile: null, follows: [], profiles: [], hasMore: false, cursor: null };
  const column = input.direction === "followers" ? "following_id" : "follower_id";
  const personColumn = input.direction === "followers" ? "follower_id" : "following_id";
  let query = supabase
    .from("follows")
    .select(FOLLOW_COLUMNS)
    .eq(column, profile.id)
    .order("created_at", { ascending: false })
    .order(personColumn, { ascending: false })
    .limit(FOLLOW_LIST_PAGE_SIZE);
  if (input.cursor) query = query.or(olderThanCursor(input.cursor, personColumn));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FollowRow[];
  const follows = rows.map(mapFollow);
  const ids = follows.map((edge) => (input.direction === "followers" ? edge.followerId : edge.followingId));
  const last = rows[rows.length - 1];
  const tail =
    rows.length === FOLLOW_LIST_PAGE_SIZE && last
      ? {
          hasMore: true,
          cursor: {
            createdAt: last.created_at,
            id: input.direction === "followers" ? last.follower_id : last.following_id,
          },
        }
      : { hasMore: false, cursor: null };
  return {
    profile,
    follows,
    profiles: await loadProfilesByIds(supabase, ids),
    hasMore: tail.hasMore,
    cursor: tail.cursor,
  };
}

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  card: Post["card"];
  quoted_post_id?: string | null;
  created_at: string;
  post_type?: string | null;
  show_paid?: boolean | null;
  meta?: unknown;
};

async function mapSearchPosts(supabase: SupabaseClient, rows: PostRow[], viewerId: string | null): Promise<Post[]> {
  const unique = dedupeMailDayRows(
    rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      post_type: row.post_type,
      show_paid: row.show_paid,
      meta: row.meta,
      card: row.card,
    })),
  );
  const views = await loadMailDayViews(supabase, unique, viewerId);
  return unique.map((row) => {
    const source = rows.find((item) => item.id === row.id) ?? row;
    const full = source as PostRow;
    const cards = views.get(row.id) ?? [];
    const first = cards[0];
    return {
      id: full.id,
      authorId: full.user_id,
      body: full.content ?? "",
      imageDataUrl: full.image_url,
      card: full.card ?? null,
      quotedPostId: full.quoted_post_id ?? null,
      createdAt: full.created_at,
      postType: full.post_type === "mail_day" ? "mail_day" : "post",
      showPaid: full.show_paid === true,
      mailDay: first
        ? {
            source: first.source,
            photos: first.photos,
            paid: first.paid,
            isPublic: first.isPublic,
            showValue: first.showValue,
          }
        : null,
      mailDayCards: cards,
    } satisfies Post;
  });
}

export type SearchSlice = {
  profiles: Profile[];
  posts: Post[];
};

/** People and posts for the current search box. Ranking stays in the search screen. */
export async function loadSearchSlice(
  supabase: SupabaseClient,
  query: string,
  viewerId: string | null,
): Promise<SearchSlice> {
  const term = query.trim().replace(/^@+/, "");
  if (!term) return { profiles: [], posts: [] };
  const pattern = `%${escapeIlike(term)}%`;
  const hidden = viewerId ? await loadHiddenAuthorIds(supabase, true) : [];
  let postsQuery = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .ilike("content", pattern)
    .order("created_at", { ascending: false })
    .limit(SEARCH_PAGE_SIZE);
  postsQuery = applyAuthorSafety(postsQuery as unknown as SafetyQuery, viewerId, hidden, {
    mute: true,
  }) as typeof postsQuery;
  const [profilesRes, postsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .limit(SEARCH_PAGE_SIZE),
    postsQuery,
  ]);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (postsRes.error) throw new Error(postsRes.error.message);
  const posts = await mapSearchPosts(supabase, (postsRes.data ?? []) as PostRow[], viewerId);
  const authors = await loadProfilesByIds(
    supabase,
    posts.map((post) => post.authorId),
  );
  return {
    profiles: mergeProfiles(((profilesRes.data ?? []) as ProfileRow[]).map((row) => mapScopedProfile(row)), authors),
    posts,
  };
}

/** Newest post and newest repost only, so the New posts pill does not load a snapshot. */
export async function loadNewestFeedHead(
  supabase: SupabaseClient,
  viewerId: string | null,
  hiddenAuthorIds?: readonly string[],
): Promise<HomeHead> {
  const hidden = viewerId ? (hiddenAuthorIds ?? (await loadHiddenAuthorIds(supabase, true))) : [];
  let postsQuery = supabase
    .from("posts")
    .select("id, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  let repostsQuery = supabase
    .from("reposts")
    .select("user_id, post_id, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  postsQuery = applyAuthorSafety(postsQuery as unknown as SafetyQuery, viewerId, hidden, {
    mute: true,
  }) as typeof postsQuery;
  repostsQuery = applyAuthorSafety(repostsQuery as unknown as SafetyQuery, viewerId, hidden, {
    mute: true,
  }) as typeof repostsQuery;
  const [postsRes, repostsRes] = await Promise.all([postsQuery, repostsQuery]);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (repostsRes.error && !missingTable(repostsRes.error)) throw new Error(repostsRes.error.message);
  const post = ((postsRes.data ?? []) as { id: string; user_id: string; created_at: string }[])[0];
  const repost = ((repostsRes.data ?? []) as { user_id: string; post_id: string; created_at: string }[])[0];
  const posts: Post[] = post
    ? [
        {
          id: post.id,
          authorId: post.user_id,
          body: "",
          imageDataUrl: null,
          card: null,
          quotedPostId: null,
          createdAt: post.created_at,
        },
      ]
    : [];
  const reposts: PostRepost[] = repost
    ? [{ userId: repost.user_id, postId: repost.post_id, createdAt: repost.created_at }]
    : [];
  return homeHead(posts, reposts);
}

export type SocialRoute =
  | { kind: "home" }
  | { kind: "notifications" }
  | { kind: "messages"; username: string | null }
  | { kind: "search" }
  | { kind: "profile"; username: string | null }
  | { kind: "followers" | "following"; username: string | null }
  | { kind: "other" };

export function socialRoute(pathname: string): SocialRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/home") return { kind: "home" };
  if (path === "/notifications") return { kind: "notifications" };
  const message = path.match(/^\/messages(?:\/([^/]+))?$/);
  if (message) return { kind: "messages", username: message[1] ? decodeURIComponent(message[1]) : null };
  if (path === "/search") return { kind: "search" };
  const follow = path.match(/^\/u\/([^/]+)\/(followers|following)$/);
  if (follow) {
    return {
      kind: follow[2] as "followers" | "following",
      username: decodeURIComponent(follow[1] ?? ""),
    };
  }
  if (path === "/profile/followers") return { kind: "followers", username: null };
  if (path === "/profile/following") return { kind: "following", username: null };
  const profile = path.match(/^\/u\/([^/]+)$/);
  if (profile) return { kind: "profile", username: decodeURIComponent(profile[1] ?? "") };
  if (path === "/profile") return { kind: "profile", username: null };
  return { kind: "other" };
}

export function appendFollowList(
  existing: readonly FollowEdge[],
  page: readonly FollowEdge[],
): FollowEdge[] {
  const seen = new Set(existing.map((edge) => `${edge.followerId}:${edge.followingId}`));
  const extra = page.filter((edge) => !seen.has(`${edge.followerId}:${edge.followingId}`));
  return extra.length === 0 ? [...existing] : [...existing, ...extra];
}

export function appendOwnerCards(
  current: readonly OwnedCard[],
  ownerId: string,
  page: readonly OwnedCard[],
): OwnedCard[] {
  const mine = current.filter((card) => card.ownerId === ownerId);
  const rest = current.filter((card) => card.ownerId !== ownerId);
  const seen = new Set(mine.map((card) => card.id));
  const extra = page.filter((card) => !seen.has(card.id));
  return [...rest, ...mine, ...extra];
}

export function mergeFollowList(
  existing: readonly FollowEdge[],
  page: readonly FollowEdge[],
  userId: string,
  direction: "followers" | "following",
): FollowEdge[] {
  const rest = existing.filter((edge) =>
    direction === "followers" ? edge.followingId !== userId : edge.followerId !== userId,
  );
  return [...rest, ...page];
}

export function partnerIds(viewerId: string, rows: readonly { senderId: string; receiverId: string }[]): string[] {
  return [
    ...new Set(
      rows.map((row) => (row.senderId === viewerId ? row.receiverId : row.senderId)),
    ),
  ];
}

export function mapMessageRows(rows: readonly Parameters<typeof mapDirectMessage>[0][]) {
  return rows.map((row) => mapDirectMessage(row));
}

/** Profiles for the people on this message page, plus the open thread when it has no rows yet. */
export async function loadMessagePartners(
  supabase: SupabaseClient,
  viewerId: string,
  rows: readonly { senderId: string; receiverId: string }[],
  username: string | null,
): Promise<Profile[]> {
  const listed = await loadProfilesByIds(supabase, partnerIds(viewerId, rows));
  if (!username) return listed;
  const partner = await loadProfileByUsername(supabase, username);
  return partner ? mergeProfiles(listed, [partner]) : listed;
}
