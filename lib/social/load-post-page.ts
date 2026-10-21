import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAuthorSafety } from "@/lib/safety/filters";
import { isUuid } from "@/lib/value/card-value-access";
import { sanitizeAttachedCard } from "./card-posts";
import { loadMailDayViews } from "./mail-day";
import type {
  DirectMessage,
  MailDayCardView,
  Notification,
  Post,
  PostComment,
  PostRepost,
  Profile,
  SocialSnapshot,
} from "./types";

const POST_SELECT =
  "id, user_id, content, image_url, card, quoted_post_id, created_at, post_type, show_paid, meta";
const PROFILE_SELECT =
  "id, username, display_name, bio, avatar_url, cover_url, accent, created_at";

/** Newest quotes of this post. Bounded so the quotes lane does not scan the home window. */
export const POST_PAGE_QUOTE_LIMIT = 100;

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

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type RepostRow = {
  user_id: string;
  post_id: string;
  created_at: string;
};

type QueryError = { code?: string; message?: string } | null;

type QueryResult = {
  data: unknown;
  error: QueryError;
  count?: number | null;
};

type PageQuery = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => PageQuery;
  eq: (column: string, value: string | boolean) => PageQuery;
  in: (column: string, values: readonly string[]) => PageQuery;
  order: (column: string, options: { ascending: boolean }) => PageQuery;
  limit: (count: number) => PageQuery;
  not: (column: string, operator: string, value: string) => PageQuery;
  or: (filters: string) => PageQuery;
  then: PromiseLike<QueryResult>["then"];
};

export type LoadedPostPage = {
  found: boolean;
  snapshot: SocialSnapshot;
};

/** `/posts/[id]` only. Other post routes stay on the full snapshot. */
export function postPageId(pathname: string): string | null {
  const match = /^\/posts\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return id || null;
  } catch {
    return match[1];
  }
}

function missingTable(error: QueryError) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function from(supabase: SupabaseClient, table: string): PageQuery {
  return supabase.from(table) as unknown as PageQuery;
}

function guard(query: PageQuery, viewerId: string | null, hiddenIds: readonly string[]) {
  return applyAuthorSafety(query, viewerId, hiddenIds);
}

function mapPost(row: PostRow, mailDayCards: MailDayCardView[]): Post {
  const card = sanitizeAttachedCard(row.card);
  const first = mailDayCards[0];
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

function mapProfile(row: ProfileRow, email = ""): Profile {
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
  };
}

async function read(query: PageQuery): Promise<QueryResult> {
  const result = await query;
  if (result.error && !missingTable(result.error)) {
    throw new Error(result.error.message ?? "Could not load that post.");
  }
  return result;
}

async function loadIdList(
  supabase: SupabaseClient,
  table: string,
  column: string,
): Promise<string[]> {
  const result = await read(from(supabase, table).select(column));
  if (result.error) return [];
  const ids: string[] = [];
  for (const row of (result.data ?? []) as Record<string, unknown>[]) {
    const id = row[column];
    if (typeof id === "string" && id) ids.push(id);
  }
  return ids;
}

async function loadUnreadCount(
  supabase: SupabaseClient,
  table: "notifications" | "messages",
  column: "recipient_id" | "receiver_id",
  viewerId: string,
): Promise<number> {
  const result = await read(
    from(supabase, table)
      .select("id", { count: "exact", head: true })
      .eq(column, viewerId)
      .eq("read", false),
  );
  if (result.error) return 0;
  return result.count ?? 0;
}

async function loadViewer(
  supabase: SupabaseClient,
  viewerId: string,
  email: string,
  blocked: ReadonlySet<string>,
): Promise<Profile | null> {
  if (!isUuid(viewerId) || blocked.has(viewerId)) return null;
  const result = await read(
    from(supabase, "profiles").select(PROFILE_SELECT).in("id", [viewerId]),
  );
  if (result.error) return null;
  const row = ((result.data ?? []) as ProfileRow[]).find((profile) => profile.id === viewerId);
  return row ? mapProfile(row, email) : null;
}

async function loadPostRows(
  supabase: SupabaseClient,
  viewerId: string | null,
  blockedIds: readonly string[],
  ids: readonly string[],
): Promise<PostRow[]> {
  const unique = [...new Set(ids.filter((id) => isUuid(id)))];
  if (unique.length === 0) return [];
  const result = await read(
    guard(from(supabase, "posts").select(POST_SELECT).in("id", unique), viewerId, blockedIds),
  );
  if (result.error) return [];
  return ((result.data ?? []) as PostRow[]).filter((row) => unique.includes(row.id));
}

function emptySnapshot(
  user: Profile | null,
  blockedIds: string[],
  mutedIds: string[],
  unreadNotificationCount: number | undefined,
  unreadMessageCount: number | undefined,
): SocialSnapshot {
  return {
    user,
    profiles: user ? [user] : [],
    posts: [],
    follows: [],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [] as Notification[],
    messages: [] as DirectMessage[],
    publicCards: [],
    homePosts: [],
    homeReposts: [],
    blockedIds,
    mutedIds,
    safetyAccounts: [],
    unreadNotificationCount,
    unreadMessageCount,
  };
}

/**
 * Everything `/posts/[id]` renders, and nothing from the home window.
 * Likes stay in the on-device activity store. The notification and message
 * badges are counts, not the full lists.
 */
export async function loadPostPage(
  supabase: SupabaseClient,
  postId: string,
): Promise<LoadedPostPage> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const viewerId = session?.user.id ?? null;
  const email = session?.user.email ?? "";

  let blockedIds: string[] = [];
  let mutedIds: string[] = [];
  let unreadNotificationCount: number | undefined;
  let unreadMessageCount: number | undefined;
  if (viewerId) {
    [blockedIds, mutedIds, unreadNotificationCount, unreadMessageCount] = await Promise.all([
      loadIdList(supabase, "blocks", "blocked_id"),
      loadIdList(supabase, "mutes", "muted_id"),
      loadUnreadCount(supabase, "notifications", "recipient_id", viewerId),
      loadUnreadCount(supabase, "messages", "receiver_id", viewerId),
    ]);
  }

  const blocked = new Set(blockedIds);
  const commentHidden = [...new Set([...blockedIds, ...mutedIds])];
  const hiddenComments = new Set(commentHidden);

  if (!isUuid(postId)) {
    const user = viewerId ? await loadViewer(supabase, viewerId, email, blocked) : null;
    return {
      found: false,
      snapshot: {
        ...emptySnapshot(user, blockedIds, mutedIds, unreadNotificationCount, unreadMessageCount),
        profiles: user ? [user] : [],
      },
    };
  }

  const [postResult, quoteResult] = await Promise.all([
    read(
      guard(from(supabase, "posts").select(POST_SELECT).eq("id", postId), viewerId, blockedIds),
    ),
    read(
      guard(
        from(supabase, "posts")
          .select(POST_SELECT)
          .eq("quoted_post_id", postId)
          .order("created_at", { ascending: false })
          .limit(POST_PAGE_QUOTE_LIMIT),
        viewerId,
        blockedIds,
      ),
    ),
  ]);

  const postRow = ((postResult.data ?? []) as PostRow[]).find((row) => row.id === postId) ?? null;
  const found = Boolean(postRow && !blocked.has(postRow.user_id));
  const quoteRows = ((quoteResult.error ? [] : quoteResult.data ?? []) as PostRow[]).filter(
    (row) => row.quoted_post_id === postId && !blocked.has(row.user_id),
  );

  let relatedRows: PostRow[] = [];
  if (found && postRow?.quoted_post_id) {
    relatedRows = (
      await loadPostRows(supabase, viewerId, blockedIds, [postRow.quoted_post_id])
    ).filter((row) => !blocked.has(row.user_id));
    const known = new Set([postRow.id, ...relatedRows.map((row) => row.id)]);
    const nestedIds = relatedRows
      .map((row) => row.quoted_post_id)
      .filter((id): id is string => typeof id === "string" && !known.has(id));
    if (nestedIds.length > 0) {
      const nested = (
        await loadPostRows(supabase, viewerId, blockedIds, nestedIds)
      ).filter((row) => !blocked.has(row.user_id) && !known.has(row.id));
      relatedRows.push(...nested);
    }
  }

  const visibleRows = found && postRow ? [postRow, ...quoteRows, ...relatedRows] : [];
  const engagementIds = found && postRow ? [postRow.id, ...quoteRows.map((row) => row.id)] : [];

  let commentRows: CommentRow[] = [];
  let repostRows: RepostRow[] = [];
  if (engagementIds.length > 0) {
    const [commentsResult, repostsResult] = await Promise.all([
      read(
        guard(
          from(supabase, "comments")
            .select("id, post_id, user_id, body, created_at")
            .in("post_id", engagementIds)
            .order("created_at", { ascending: true }),
          viewerId,
          commentHidden,
        ),
      ),
      read(
        guard(
          from(supabase, "reposts")
            .select("user_id, post_id, created_at")
            .in("post_id", engagementIds)
            .order("created_at", { ascending: false }),
          viewerId,
          blockedIds,
        ),
      ),
    ]);
    if (!commentsResult.error) {
      commentRows = ((commentsResult.data ?? []) as CommentRow[]).filter(
        (row) => engagementIds.includes(row.post_id) && !hiddenComments.has(row.user_id),
      );
    }
    if (!repostsResult.error) {
      repostRows = ((repostsResult.data ?? []) as RepostRow[]).filter(
        (row) => engagementIds.includes(row.post_id) && !blocked.has(row.user_id),
      );
    }
  }

  const views = await loadMailDayViews(
    supabase,
    visibleRows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      post_type: row.post_type,
      show_paid: row.show_paid,
      meta: row.meta,
      card: sanitizeAttachedCard(row.card),
    })),
    viewerId,
  );
  const posts = visibleRows.map((row) => mapPost(row, views.get(row.id) ?? []));

  const profileIds = [
    ...posts.map((post) => post.authorId),
    ...commentRows.map((row) => row.user_id),
    ...(viewerId ? [viewerId] : []),
  ];
  const uniqueProfiles = [...new Set(profileIds.filter((id) => isUuid(id)))];
  let profiles: Profile[] = [];
  if (uniqueProfiles.length > 0) {
    const result = await read(
      from(supabase, "profiles").select(PROFILE_SELECT).in("id", uniqueProfiles),
    );
    if (!result.error) {
      profiles = ((result.data ?? []) as ProfileRow[])
        .filter((row) => uniqueProfiles.includes(row.id) && !blocked.has(row.id))
        .map((row) => mapProfile(row, row.id === viewerId ? email : ""));
    }
  }

  const user = viewerId ? (profiles.find((profile) => profile.id === viewerId) ?? null) : null;
  const comments = commentRows.map(
    (row): PostComment => ({
      id: row.id,
      postId: row.post_id,
      authorId: row.user_id,
      body: row.body,
      createdAt: row.created_at,
    }),
  );
  const reposts = repostRows.map(
    (row): PostRepost => ({
      postId: row.post_id,
      userId: row.user_id,
      createdAt: row.created_at,
    }),
  );

  return {
    found,
    snapshot: {
      user,
      profiles,
      posts,
      follows: [],
      likes: [],
      reposts,
      comments,
      notifications: [],
      messages: [],
      publicCards: [],
      homePosts: [],
      homeReposts: [],
      blockedIds,
      mutedIds,
      safetyAccounts: [],
      unreadNotificationCount,
      unreadMessageCount,
    },
  };
}

/**
 * Fold one post page into a snapshot that already has the home feed.
 * Follows, notification rows, and message rows stay put. Home rows stay, minus blocked and muted authors.
 */
export function mergePostPageIntoSnapshot(
  existing: SocialSnapshot,
  page: SocialSnapshot,
  focusPostId: string,
): SocialSnapshot {
  const touched = new Set(page.posts.map((post) => post.id));
  touched.add(focusPostId);
  const pageHasFocus = page.posts.some((post) => post.id === focusPostId);
  const posts = new Map(existing.posts.map((post) => [post.id, post]));
  if (!pageHasFocus) posts.delete(focusPostId);
  for (const post of page.posts) posts.set(post.id, post);
  const blockedIds = new Set(page.blockedIds ?? []);
  const mutedIds = new Set(page.mutedIds ?? []);
  const hiddenOnHome = (authorId: string) => blockedIds.has(authorId) || mutedIds.has(authorId);
  const profiles = new Map(existing.profiles.map((profile) => [profile.id, profile]));
  for (const profile of page.profiles) {
    if ((page.blockedIds ?? []).includes(profile.id)) continue;
    profiles.set(profile.id, profile);
  }
  for (const blockedId of page.blockedIds ?? []) profiles.delete(blockedId);
  return {
    ...existing,
    user: page.user ?? existing.user,
    profiles: [...profiles.values()],
    posts: [...posts.values()].filter((post) => !blockedIds.has(post.authorId)),
    homePosts: existing.homePosts?.filter((post) => !hiddenOnHome(post.authorId)),
    homeReposts: existing.homeReposts?.filter((repost) => !hiddenOnHome(repost.userId)),
    comments: [
      ...existing.comments.filter((comment) => !touched.has(comment.postId)),
      ...page.comments,
    ],
    reposts: [
      ...existing.reposts.filter((repost) => !touched.has(repost.postId)),
      ...page.reposts,
    ],
    blockedIds: page.blockedIds ?? existing.blockedIds,
    mutedIds: page.mutedIds ?? existing.mutedIds,
    unreadNotificationCount:
      existing.notifications.length === 0 ? page.unreadNotificationCount : undefined,
    unreadMessageCount:
      (existing.messages ?? []).length === 0 ? page.unreadMessageCount : undefined,
  };
}
