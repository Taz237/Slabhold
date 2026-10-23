import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAuthorSafety, loadHiddenAuthorIds } from "@/lib/safety/filters";
import { isUuid } from "@/lib/value/card-value-access";
import { sanitizeAttachedCard } from "./card-posts";
import {
  buildFeedPage,
  cursorFromRow,
  feedRowKey,
  isFeedCursor,
  keysetOrFilter,
  missingRepostOriginalIds,
  type FeedCursor,
  type FeedRow,
} from "./feed-page";
import { loadMailDayViews } from "./mail-day";
import { mappedPostImages } from "./post-photos";
import type { TimelineItem } from "./timeline";
import type {
  DirectMessage,
  MailDayCardView,
  Notification,
  Post,
  PostComment,
  PostRepost,
  Profile,
} from "./types";

const POST_SELECT =
  "id, user_id, content, image_url, card, quoted_post_id, created_at, hidden_at, post_type, show_paid, meta";
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
  hidden_at?: string | null;
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

type RepostRow = {
  user_id: string;
  post_id: string;
  created_at: string;
};

export type FeedPageScope = "public" | "following" | "profile";

export type LoadedFeedPage = {
  items: TimelineItem[];
  posts: Post[];
  relatedPosts: Post[];
  profiles: Profile[];
  hasMore: boolean;
  nextCursor: FeedCursor | null;
};

const emptyPage: LoadedFeedPage = {
  items: [],
  posts: [],
  relatedPosts: [],
  profiles: [],
  hasMore: false,
  nextCursor: null,
};

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function mapPost(row: PostRow, mailDayCards: MailDayCardView[]): Post {
  const card = sanitizeAttachedCard(row.card);
  const first = mailDayCards[0];
  const photos = mappedPostImages(row);
  return {
    id: row.id,
    authorId: row.user_id,
    body: row.content ?? "",
    imageDataUrl: photos.imageDataUrl,
    images: photos.images,
    card,
    quotedPostId: row.quoted_post_id ?? null,
    createdAt: row.created_at,
    hiddenAt: row.hidden_at ?? null,
    postType: row.post_type === "mail_day" ? "mail_day" : "post",
    showPaid: row.show_paid === true,
    mailDay: first
      ? {
          source: first.source,
          photos: first.photos,
          paid: first.paid,
          isPublic: first.isPublic,
          showValue: first.showValue,
        }
      : null,
    mailDayCards,
  };
}

function mapProfile(row: ProfileRow): Profile {
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

async function mapRows(
  supabase: SupabaseClient,
  rows: PostRow[],
  viewerId: string | null,
): Promise<Post[]> {
  const views = await loadMailDayViews(
    supabase,
    rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      post_type: row.post_type,
      show_paid: row.show_paid,
      meta: row.meta,
      card: sanitizeAttachedCard(row.card),
    })),
    viewerId,
  );
  return rows.map((row) => mapPost(row, views.get(row.id) ?? []));
}

type QueryResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

type PostExec = {
  eq: (column: string, value: string) => PostExec;
  in: (column: string, values: readonly string[]) => PostExec;
  or: (filters: string) => PostExec;
  order: (column: string, options?: { ascending: boolean }) => PostExec;
  limit: (count: number) => PostExec;
  not: (column: string, operator: string, value: string) => PostExec;
  then: PromiseLike<QueryResult>["then"];
};

/** Apply a hidden-author list that the caller already loaded once for this page. */
async function execute(
  query: PostExec,
  viewerId: string | null,
  mute: boolean,
  hidden: readonly string[] | null,
): Promise<QueryResult> {
  if (!viewerId || !hidden || hidden.length === 0) return query;
  const guarded = applyAuthorSafety(
    query,
    viewerId,
    hidden,
    mute ? { mute: true } : undefined,
  ) as unknown as PostExec;
  return guarded;
}

async function selectPosts(
  supabase: SupabaseClient,
  viewerId: string | null,
  options: {
    authorIds: string[] | null;
    cursor: FeedCursor | null;
    limit: number;
    mute: boolean;
    hidden: readonly string[] | null;
    ids?: string[];
  },
): Promise<PostRow[]> {
  let query = supabase.from("posts").select(POST_SELECT) as unknown as PostExec;
  if (options.ids) {
    if (options.ids.length === 0) return [];
    query = query.in("id", options.ids);
  }
  if (options.authorIds) query = query.in("user_id", options.authorIds);
  if (options.cursor) query = query.or(keysetOrFilter(options.cursor, "posts"));
  if (!options.ids) {
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(options.limit);
  }
  const { data, error } = await execute(query, viewerId, options.mute, options.hidden);
  if (error) throw new Error(error.message);
  return (data ?? []) as PostRow[];
}

async function selectReposts(
  supabase: SupabaseClient,
  viewerId: string | null,
  options: {
    authorIds: string[] | null;
    cursor: FeedCursor | null;
    limit: number;
    mute: boolean;
    hidden: readonly string[] | null;
  },
): Promise<{ rows: RepostRow[]; exhausted: boolean }> {
  let query = supabase
    .from("reposts")
    .select("user_id, post_id, created_at") as unknown as PostExec;
  if (options.authorIds) query = query.in("user_id", options.authorIds);
  if (options.cursor) query = query.or(keysetOrFilter(options.cursor, "reposts"));
  query = query
    .order("created_at", { ascending: false })
    .order("user_id", { ascending: true })
    .order("post_id", { ascending: true })
    .limit(options.limit);
  const { data, error } = await execute(query, viewerId, options.mute, options.hidden);
  if (error) {
    if (missingTable(error)) return { rows: [], exhausted: true };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as RepostRow[];
  return { rows, exhausted: rows.length < options.limit };
}

async function loadProfiles(supabase: SupabaseClient, ids: string[]): Promise<Profile[]> {
  const unique = [...new Set(ids)].filter((id) => isUuid(id));
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).in("id", unique);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProfileRow[]).map(mapProfile);
}

async function loadQuoted(
  supabase: SupabaseClient,
  posts: Post[],
  viewerId: string | null,
  mute: boolean,
  hidden: readonly string[] | null,
): Promise<Post[]> {
  const known = new Set(posts.map((post) => post.id));
  const missing = [
    ...new Set(
      posts
        .map((post) => post.quotedPostId)
        .filter((id): id is string => typeof id === "string" && !known.has(id)),
    ),
  ];
  if (missing.length === 0) return [];
  const related = await mapRows(
    supabase,
    await selectPosts(supabase, viewerId, {
      authorIds: null,
      cursor: null,
      limit: missing.length,
      mute,
      hidden,
      ids: missing,
    }),
    viewerId,
  );
  const nestedIds = [
    ...new Set(
      related
        .map((post) => post.quotedPostId)
        .filter(
          (id): id is string =>
            typeof id === "string" && !known.has(id) && !related.some((item) => item.id === id),
        ),
    ),
  ];
  if (nestedIds.length === 0) return related;
  related.push(
    ...(await mapRows(
      supabase,
      await selectPosts(supabase, viewerId, {
        authorIds: null,
        cursor: null,
        limit: nestedIds.length,
        mute,
        hidden,
        ids: nestedIds,
      }),
      viewerId,
    )),
  );
  return related;
}

/** post_ids in this page that already have an in-scope repost, including one on a later page. */
async function loadRepostedPostIds(
  supabase: SupabaseClient,
  viewerId: string | null,
  postIds: string[],
  authorIds: string[] | null,
  mute: boolean,
  hidden: readonly string[] | null,
): Promise<Set<string>> {
  const ids = [...new Set(postIds)].filter((id) => isUuid(id));
  if (ids.length === 0) return new Set();
  let query = supabase.from("reposts").select("post_id").in("post_id", ids) as unknown as PostExec;
  if (authorIds) query = query.in("user_id", authorIds);
  const { data, error } = await execute(query, viewerId, mute, hidden);
  if (error) {
    if (missingTable(error)) return new Set();
    throw new Error(error.message);
  }
  return new Set(((data ?? []) as { post_id: string }[]).map((row) => row.post_id));
}

function authorScope(input: {
  scope: FeedPageScope;
  authorIds?: readonly string[];
  profileId?: string;
}): string[] | null {
  if (input.scope === "public") return null;
  if (input.scope === "profile") {
    return input.profileId && isUuid(input.profileId) ? [input.profileId] : [];
  }
  return [...new Set((input.authorIds ?? []).filter((id) => isUuid(id)))];
}

/**
 * One keyset page of a merged posts + reposts timeline.
 * Public is For You. Following is its own query: user_id in `authorIds`
 * (accounts the viewer follows, plus the viewer). It is not a filter of the
 * newest 100 home posts. Profile is that account's posts and reposts only.
 * Reposts are ordered by repost time, and each page loads the original post
 * by id when it was not in the post page. Mute filtering matches the home
 * snapshot. Profiles keep muted authors' posts.
 */
export async function loadFeedPage(
  supabase: SupabaseClient,
  input: {
    scope: FeedPageScope;
    viewerId: string | null;
    authorIds?: readonly string[];
    profileId?: string;
    cursor?: FeedCursor | null;
    seenPostIds?: ReadonlySet<string>;
    limit: number;
  },
): Promise<LoadedFeedPage> {
  const limit = Math.min(50, Math.max(1, input.limit));
  const authors = authorScope(input);
  if (authors && authors.length === 0) return emptyPage;
  const mute = input.scope !== "profile";
  const hidden = input.viewerId ? await loadHiddenAuthorIds(supabase, mute) : null;
  const seen = new Set(input.seenPostIds ?? []);
  let cursor = input.cursor && isFeedCursor(input.cursor) ? input.cursor : null;
  const items: TimelineItem[] = [];
  const posts: Post[] = [];
  const relatedPosts: Post[] = [];
  const profiles: Profile[] = [];
  const profileIds = new Map<string, Profile>();
  let hasMore = false;
  let nextCursor: FeedCursor | null = null;

  for (let hop = 0; hop < 4 && items.length < limit; hop++) {
    const [postRows, repostPage] = await Promise.all([
      selectPosts(supabase, input.viewerId, {
        authorIds: authors,
        cursor,
        limit,
        mute,
        hidden,
      }),
      selectReposts(supabase, input.viewerId, {
        authorIds: authors,
        cursor,
        limit,
        mute,
        hidden,
      }),
    ]);
    const postFeed = postRows.map(
      (row): FeedRow => ({
        kind: "post",
        createdAt: row.created_at,
        id: row.id,
        userId: row.user_id,
      }),
    );
    const repostFeed = repostPage.rows.map(
      (row): FeedRow => ({
        kind: "repost",
        createdAt: row.created_at,
        id: row.post_id,
        userId: row.user_id,
      }),
    );
    const built = buildFeedPage({
      posts: postFeed,
      reposts: repostFeed,
      postsExhausted: postRows.length < limit,
      repostsExhausted: repostPage.exhausted,
      pageSize: limit,
    });
    const repostedPostIds = await loadRepostedPostIds(
      supabase,
      input.viewerId,
      built.rows.filter((row) => row.kind === "post").map((row) => row.id),
      authors,
      mute,
      hidden,
    );

    const known = new Map(postRows.map((row) => [row.id, row]));
    const missingIds = missingRepostOriginalIds(built.rows, new Set(known.keys()));
    if (missingIds.length > 0) {
      for (const row of await selectPosts(supabase, input.viewerId, {
        authorIds: null,
        cursor: null,
        limit: missingIds.length,
        mute,
        hidden,
        ids: missingIds,
      })) {
        known.set(row.id, row);
      }
    }
    const hydrated = await mapRows(supabase, [...known.values()], input.viewerId);
    const postById = new Map(hydrated.map((post) => [post.id, post]));
    const people = await loadProfiles(supabase, [
      ...hydrated.map((post) => post.authorId),
      ...built.rows.filter((row) => row.kind === "repost").map((row) => row.userId),
    ]);
    for (const person of people) profileIds.set(person.id, person);

    let consumed: FeedCursor | null = null;
    for (const row of built.rows) {
      if (items.length >= limit) break;
      consumed = cursorFromRow(row);
      if (seen.has(row.id)) continue;
      // A later repost of this post still has to appear. Do not mark it seen.
      if (row.kind === "post" && repostedPostIds.has(row.id)) continue;
      const post = postById.get(row.id);
      const author = post ? profileIds.get(post.authorId) : undefined;
      const repostedBy = row.kind === "repost" ? (profileIds.get(row.userId) ?? null) : null;
      if (!post || !author || (row.kind === "repost" && !repostedBy)) {
        seen.add(row.id);
        continue;
      }
      seen.add(row.id);
      posts.push(post);
      items.push({
        key: feedRowKey(row),
        post,
        at: row.createdAt,
        repostedBy,
      });
    }
    const lastBuilt = built.rows[built.rows.length - 1];
    const consumedAll =
      built.rows.length === 0 ||
      (consumed !== null && lastBuilt !== undefined && consumed.key === feedRowKey(lastBuilt));
    if (!consumedAll && consumed) {
      hasMore = true;
      nextCursor = consumed;
    } else {
      hasMore = built.hasMore;
      nextCursor = built.nextCursor;
    }
    if (items.length >= limit || !hasMore || !nextCursor || consumed === null) break;
    cursor = nextCursor;
  }

  const quoted = await loadQuoted(supabase, posts, input.viewerId, mute, hidden);
  relatedPosts.push(...quoted);
  const quoteAuthors = await loadProfiles(
    supabase,
    quoted.map((post) => post.authorId),
  );
  for (const person of quoteAuthors) profileIds.set(person.id, person);
  profiles.push(...profileIds.values());

  return { items, posts, relatedPosts, profiles, hasMore, nextCursor };
}

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

/** Same cap as the old home window. The quotes tab stays bounded to this post. */
const QUOTE_WINDOW = 100;

export type LoadedPostPage = {
  post: Post | null;
  /** Post this one quotes, plus one nested hop. */
  relatedPosts: Post[];
  /** Newer posts that quote this one, for the quotes tab. */
  quotingPosts: Post[];
  profiles: Profile[];
  user: Profile | null;
  comments: PostComment[];
  /** Reposts of this post, its replies, quoting posts, and the quoted original. */
  reposts: PostRepost[];
  /** Unread notices for the viewer, so the bell stays up on a cold post page. */
  notifications: Notification[];
  /** Unread messages sent to the viewer, so the Messages badge stays up. */
  messages: DirectMessage[];
  blockedIds: string[];
  mutedIds: string[];
};

const emptyPostPage: LoadedPostPage = {
  post: null,
  relatedPosts: [],
  quotingPosts: [],
  profiles: [],
  user: null,
  comments: [],
  reposts: [],
  notifications: [],
  messages: [],
  blockedIds: [],
  mutedIds: [],
};

function idColumn(data: unknown, key: string): string[] {
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = (row as Record<string, unknown>)[key];
    if (typeof id === "string") ids.push(id);
  }
  return ids;
}

function withViewerEmail(profiles: Profile[], viewerId: string | null, email: string) {
  if (!viewerId) return { profiles, user: null as Profile | null };
  const found = profiles.find((profile) => profile.id === viewerId);
  if (!found) return { profiles, user: null as Profile | null };
  const user = { ...found, email: email || found.email };
  return {
    user,
    profiles: profiles.map((profile) => (profile.id === user.id ? user : profile)),
  };
}

/**
 * Blocks for the post itself, blocks plus mutes for replies.
 * `hidden` is one hidden_author_ids(apply_mute: true) result.
 */
export function postPageAuthorFilters(
  hidden: readonly string[],
  blockedIds: readonly string[],
  mutedIds: readonly string[],
) {
  const muted = new Set(mutedIds);
  const postHidden = [...new Set([...hidden.filter((id) => !muted.has(id)), ...blockedIds])];
  const replyHidden = [...new Set([...hidden, ...blockedIds, ...mutedIds])];
  return { postHidden, replyHidden };
}

function mapComment(row: CommentRow): PostComment {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function selectComments(
  supabase: SupabaseClient,
  postId: string,
  viewerId: string | null,
  hidden: readonly string[] | null,
): Promise<CommentRow[]> {
  return selectCommentsForPosts(supabase, [postId], viewerId, hidden, "eq");
}

async function selectCommentsForPosts(
  supabase: SupabaseClient,
  postIds: readonly string[],
  viewerId: string | null,
  hidden: readonly string[] | null,
  match: "eq" | "in" = "in",
): Promise<CommentRow[]> {
  const ids = [...new Set(postIds)].filter((id) => isUuid(id));
  if (ids.length === 0) return [];
  let query = supabase
    .from("comments")
    .select("id, post_id, user_id, body, created_at") as unknown as PostExec;
  query = match === "eq" && ids[0] ? query.eq("post_id", ids[0]) : query.in("post_id", ids);
  query = query.order("created_at", { ascending: true });
  const { data, error } = await execute(query, viewerId, true, hidden);
  if (error) {
    if (missingTable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as CommentRow[];
}

type InboxQuery = {
  eq: (column: string, value: string | boolean) => InboxQuery;
  order: (column: string, options?: { ascending: boolean }) => InboxQuery;
  not: (column: string, operator: string, value: string) => InboxQuery;
  or: (filters: string) => InboxQuery;
  then: PromiseLike<QueryResult>["then"];
};

type NotificationInboxRow = {
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

type MessageInboxRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
};

/**
 * Unread bell and Messages badge rows for a signed-in viewer.
 * Notifications use the same muted-author filter as the site snapshot.
 */
async function loadViewerInbox(
  supabase: SupabaseClient,
  viewerId: string,
  hidden: readonly string[],
): Promise<{ notifications: Notification[]; messages: DirectMessage[] }> {
  const notificationsQuery = supabase
    .from("notifications")
    .select("id, recipient_id, actor_id, kind, post_id, preview, href, metadata, read, created_at")
    .eq("recipient_id", viewerId)
    .eq("read", false)
    .order("created_at", { ascending: false }) as unknown as InboxQuery;
  const guardedNotes = applyAuthorSafety(notificationsQuery, viewerId, hidden, {
    authorColumn: "actor_id",
    mute: true,
    keepNullAuthor: true,
  });
  const messagesQuery = supabase
    .from("messages")
    .select("id, sender_id, receiver_id, content, created_at, read")
    .eq("receiver_id", viewerId)
    .eq("read", false)
    .order("created_at", { ascending: true }) as unknown as InboxQuery;
  const [notesRes, messagesRes] = await Promise.all([guardedNotes, messagesQuery]);
  if (notesRes.error && !missingTable(notesRes.error)) throw new Error(notesRes.error.message);
  if (messagesRes.error && !missingTable(messagesRes.error)) throw new Error(messagesRes.error.message);
  const notifications = ((notesRes.data ?? []) as NotificationInboxRow[]).map(
    (row): Notification => ({
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
    }),
  );
  const messages = ((messagesRes.data ?? []) as MessageInboxRow[]).map(
    (row): DirectMessage => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      content: row.content,
      createdAt: row.created_at,
      read: row.read,
    }),
  );
  return { notifications, messages };
}

async function selectQuotingPosts(
  supabase: SupabaseClient,
  postId: string,
  viewerId: string | null,
  hidden: readonly string[] | null,
): Promise<PostRow[]> {
  const query = supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("quoted_post_id", postId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(QUOTE_WINDOW) as unknown as PostExec;
  const { data, error } = await execute(query, viewerId, false, hidden);
  if (error) throw new Error(error.message);
  return (data ?? []) as PostRow[];
}

async function selectRepostsFor(
  supabase: SupabaseClient,
  postIds: string[],
  viewerId: string | null,
  hidden: readonly string[] | null,
): Promise<PostRepost[]> {
  const ids = [...new Set(postIds)].filter((id) => isUuid(id));
  if (ids.length === 0) return [];
  const query = supabase
    .from("reposts")
    .select("user_id, post_id, created_at")
    .in("post_id", ids) as unknown as PostExec;
  const { data, error } = await execute(query, viewerId, false, hidden);
  if (error) {
    if (missingTable(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as RepostRow[]).map(
    (row): PostRepost => ({
      postId: row.post_id,
      userId: row.user_id,
      createdAt: row.created_at,
    }),
  );
}

/**
 * Everything a single post screen needs, and nothing site-wide.
 * One hidden_author_ids call. No follows or paged-off posts.
 * Unread notifications and received messages are loaded so the badges stay.
 * Likes stay on the device (see activity.ts), so this does not query them.
 */
export async function loadPostPage(
  supabase: SupabaseClient,
  postId: string,
): Promise<LoadedPostPage> {
  if (!isUuid(postId)) return emptyPostPage;
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const viewerId = session?.user.id ?? null;
  const email = session?.user.email ?? "";

  let blockedIds: string[] = [];
  let mutedIds: string[] = [];
  let hidden: string[] = [];
  if (viewerId) {
    const [hiddenIds, blocksRes, mutesRes] = await Promise.all([
      loadHiddenAuthorIds(supabase, true),
      supabase.from("blocks").select("blocked_id"),
      supabase.from("mutes").select("muted_id"),
    ]);
    hidden = hiddenIds;
    const blocksError = blocksRes.error;
    const mutesError = mutesRes.error;
    if (blocksError && !missingTable(blocksError)) throw new Error(blocksError.message);
    if (mutesError && !missingTable(mutesError)) throw new Error(mutesError.message);
    blockedIds = idColumn(blocksRes.data, "blocked_id");
    mutedIds = idColumn(mutesRes.data, "muted_id");
  }

  const { postHidden, replyHidden } = postPageAuthorFilters(hidden, blockedIds, mutedIds);
  const inboxPromise = viewerId
    ? loadViewerInbox(supabase, viewerId, hidden)
    : Promise.resolve({ notifications: [] as Notification[], messages: [] as DirectMessage[] });
  const [postRows, commentRows, quotingRows, inbox] = await Promise.all([
    selectPosts(supabase, viewerId, {
      authorIds: null,
      cursor: null,
      limit: 1,
      mute: false,
      hidden: viewerId ? postHidden : null,
      ids: [postId],
    }),
    selectComments(supabase, postId, viewerId, viewerId ? replyHidden : null),
    selectQuotingPosts(supabase, postId, viewerId, viewerId ? postHidden : null),
    inboxPromise,
  ]);
  const [post] = await mapRows(supabase, postRows, viewerId);
  if (!post) {
    const people = viewerId ? await loadProfiles(supabase, [viewerId]) : [];
    const viewer = withViewerEmail(people, viewerId, email);
    return {
      ...emptyPostPage,
      profiles: viewer.profiles,
      user: viewer.user,
      notifications: inbox.notifications,
      messages: inbox.messages,
      blockedIds,
      mutedIds,
    };
  }

  const relatedPosts = await loadQuoted(supabase, [post], viewerId, false, viewerId ? postHidden : null);
  const quotingPosts = (await mapRows(supabase, quotingRows, viewerId)).filter(
    (item) => item.id !== post.id,
  );
  const quotingComments = await selectCommentsForPosts(
    supabase,
    quotingPosts.map((item) => item.id),
    viewerId,
    viewerId ? replyHidden : null,
  );
  const comments = [...commentRows, ...quotingComments].map(mapComment);
  const reposts = await selectRepostsFor(
    supabase,
    [
      post.id,
      ...comments.map((comment) => comment.id),
      ...quotingPosts.map((item) => item.id),
      ...relatedPosts.map((item) => item.id),
    ],
    viewerId,
    viewerId ? postHidden : null,
  );
  const people = await loadProfiles(supabase, [
    ...(viewerId ? [viewerId] : []),
    post.authorId,
    ...relatedPosts.map((item) => item.authorId),
    ...quotingPosts.map((item) => item.authorId),
    ...comments.map((comment) => comment.authorId),
  ]);
  const viewer = withViewerEmail(people, viewerId, email);
  return {
    post,
    relatedPosts,
    quotingPosts,
    profiles: viewer.profiles,
    user: viewer.user,
    comments,
    reposts,
    notifications: inbox.notifications,
    messages: inbox.messages,
    blockedIds,
    mutedIds,
  };
}

/** Load one post by id, including quoted posts, even when it is older than the home window. */
export async function loadPostById(
  supabase: SupabaseClient,
  postId: string,
  viewerId: string | null,
): Promise<{ post: Post; relatedPosts: Post[]; profiles: Profile[] } | null> {
  if (!isUuid(postId)) return null;
  const hidden = viewerId ? await loadHiddenAuthorIds(supabase, false) : null;
  const rows = await selectPosts(supabase, viewerId, {
    authorIds: null,
    cursor: null,
    limit: 1,
    mute: false,
    hidden,
    ids: [postId],
  });
  const [post] = await mapRows(supabase, rows, viewerId);
  if (!post) return null;
  const relatedPosts = await loadQuoted(supabase, [post], viewerId, false, hidden);
  const profiles = await loadProfiles(supabase, [
    post.authorId,
    ...relatedPosts.map((item) => item.authorId),
  ]);
  return { post, relatedPosts, profiles };
}
