import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlike } from "@/lib/db/escape-ilike";
import { captchaRetryMessage } from "@/lib/auth/captcha";
import { emailConfirmRedirect } from "@/lib/auth/safe-next";
import { EMAIL_NOT_CONFIRMED, isEmailNotConfirmed } from "@/lib/auth/signup-fields";
import { removeUploadedMedia, uploadMedia } from "@/lib/supabase/media";
import { sanitizeAttachedCard } from "./card-posts";
import { applyViewerLikes, likesMigratedFlag, loadViewerLikes, readLikeCount } from "./likes";
import { loadMailDayViews } from "./mail-day";
import type {
  AuthResult,
  FollowEdge,
  MailDayCardView,
  Post,
  PostRepost,
  Profile,
  ProfilePatch,
  PublicCard,
  SignUpInput,
  SocialSnapshot,
} from "./types";
import { COMMENT_LIMIT } from "./types";
import { mentionIlikeOr, type MentionCandidate } from "./mentions";
import {
  isReplyMentionMetadata,
  mentionsToNotify,
  notifyReplyMentions,
} from "./reply-mentions";
import { isReservedUsername, normalizeUsername, usernameChangeError, usernameError } from "./usernames";
import { followSlabholdOnSignup } from "./signup-auto-follow";
import {
  noteReplyImagesMissing,
  replyImageColumnMissing,
  replyImagesKnownMissing,
  replyNoticePreview,
  replyNotificationImages,
  REPLY_PHOTOS_UNAVAILABLE,
} from "./reply-images";
import { isTestAccount } from "../test-accounts";
import { ilikeExact, TAKEN_USERNAME, usernameTakenMessage } from "./username-taken";
import { validateQuoteContent } from "./quotes";
import { pingWantMatch } from "@/lib/wants/ping";
import {
  draftPostPhotos,
  mappedPostImages,
  metaColumnMissing,
  metaWithImages,
  noteMultiPhotoMissing,
  type PostWrite,
} from "./post-photos";
import { GIFS_UNAVAILABLE, gifColumnMissing, gifForSave, type PostGif } from "./gifs";
import { postExtrasFromRow } from "./post-extras";
import { POLL_QUESTION_REQUIRED, pollChoices, pollDraftProblem, type PollDraft } from "./poll-draft";
import { remoteCreatePollPost, settleEndedPolls } from "./poll-remote";
import {
  VIDEO_BUCKET,
  VIDEOS_UNAVAILABLE,
  noteVideoMissing,
  postVideoPaths,
  sanitizeVideo,
  videoColumnMissing,
  videoKnownMissing,
  type PostVideo,
} from "./videos";
import {
  notePostExtrasMissing,
  THREAD_MAX,
  threadColumnMissing,
  THREADS_UNAVAILABLE,
  threadSlots,
} from "./threads";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { contentProblem, usernameProblem } from "@/lib/safety/content-filter";
import { canNotify, supabaseSafety } from "@/lib/safety/can-notify";
import { applyAuthorSafety, loadHiddenAuthorIds, withAuthorSafety } from "@/lib/safety/filters";
import { signupSourceData } from "@/lib/invites/signup-source";
import { loadPostEngagement } from "./load-feed-page";
import {
  loadMessagePage,
  loadNotificationPage,
  loadUnreadMessages,
  loadUnreadNotifications,
  mergeById,
} from "./inbox-pages";

/** Swappable so a shared-card post can be tested without hitting the network. */
export const postWantAlerts = {
  ping: pingWantMatch,
};

/** Public columns only — used by @mention autocomplete. */
const MENTION_PROFILE_SELECT = "id, username, display_name, avatar_url";

/**
 * Profile columns the social snapshot reads. Never "*": that would send every
 * account's pinned_badges and show_badges to every viewer.
 */
export const SOCIAL_PROFILE_COLUMNS =
  "id, username, display_name, bio, avatar_url, cover_url, accent, created_at, is_test, pinned_post_id";
const SOCIAL_PROFILE_COLUMNS_BASE = "id, username, display_name, bio, avatar_url, cover_url, accent, created_at";

/** A database without is_test or pinned_post_id yet falls back to the base columns. */
async function loadProfileRows<R extends { error: { code?: string; message?: string } | null }>(
  run: (columns: string) => PromiseLike<R>,
): Promise<R> {
  const probe = await run(SOCIAL_PROFILE_COLUMNS);
  const error = probe.error;
  if (!error || !(error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? ""))) {
    return probe;
  }
  return run(SOCIAL_PROFILE_COLUMNS_BASE);
}

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

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  card: PublicCard | null;
  quoted_post_id?: string | null;
  created_at: string;
  hidden_at?: string | null;
  post_type?: string | null;
  show_paid?: boolean | null;
  meta?: unknown;
  like_count?: number | null;
  gif?: unknown;
  video?: unknown;
  thread_id?: string | null;
  thread_position?: number | null;
};

type FollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

type RepostRow = {
  user_id: string;
  post_id: string;
  created_at: string;
};

/** Row from public.public_cards — no paid_price / purchase_date / notes / cert_number. */
export type PublicCardRow = {
  id: string;
  user_id: string;
  player: string;
  year: number;
  set: string;
  grade: string | null;
  parallel: string | null;
  estimated_value: number | null;
  image_url: string | null;
  card_number: string | null;
  sport: string | null;
  accent: string | null;
  is_public: boolean | null;
  created_at: string;
  updated_at: string | null;
  year_label?: string | null;
  set_name?: string | null;
};

function previewText(value: string) {
  const text = value.trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/** Shown when a social table or constraint is missing. */
const SETUP_FAILED = "Something went wrong on our side. Please try again.";

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function rlsBlocked(error: { message?: string } | null) {
  return /row-level security|violates row-level/i.test(error?.message ?? "");
}

async function allowNotice(
  supabase: SupabaseClient,
  actorId: string,
  recipientId: string,
) {
  return canNotify(supabaseSafety(supabase), actorId, recipientId);
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
    ...likeCountField(row.like_count),
    ...postExtrasFromRow(row),
  };
}

function likeCountField(value: unknown): { likeCount: number } | Record<string, never> {
  const likeCount = readLikeCount(value);
  return typeof likeCount === "number" ? { likeCount } : {};
}

async function mapPostRows(
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

/**
 * Profiles by id, mapped exactly as the site snapshot maps them. `email` is
 * the signed-in viewer's, set on their own profile only.
 */
export async function loadSocialProfiles(
  supabase: SupabaseClient,
  ids: readonly string[],
  viewer: { id: string; email: string } | null = null,
): Promise<Profile[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  const { data, error } = await loadProfileRows((columns) =>
    supabase.from("profiles").select<string, ProfileRow>(columns).in("id", unique),
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProfileRow[]).map((row) =>
    mapProfile(row, viewer && row.id === viewer.id ? viewer.email : ""),
  );
}

/** Ids per profiles query, so the URL stays well under PostgREST's limit. */
const PROFILE_ID_CHUNK = 150;

/**
 * Profiles by id or username, with the same filter the old site-wide list
 * used: people the viewer blocked, or who blocked the viewer, are left out,
 * so their pages still read "not found". `email` is set on the viewer's own.
 */
export async function loadVisibleProfiles(
  supabase: SupabaseClient,
  input: { ids?: readonly string[]; usernames?: readonly string[] },
  viewer: { id: string; email: string } | null,
  blockedHidden: readonly string[],
): Promise<Profile[]> {
  const ids = [...new Set(input.ids ?? [])].filter(Boolean);
  const usernames = [...new Set((input.usernames ?? []).map((name) => name.trim().toLowerCase()))].filter(Boolean);
  const reads: Promise<ProfileRow[]>[] = [];
  const run = (filter: (query: ReturnType<typeof profileQuery>) => ReturnType<typeof profileQuery>) =>
    loadProfileRows((columns) =>
      applyAuthorSafety(filter(profileQuery(supabase, columns)), viewer?.id ?? null, blockedHidden, {
        authorColumn: "id",
      }),
    ).then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data ?? []) as ProfileRow[];
    });
  for (let start = 0; start < ids.length; start += PROFILE_ID_CHUNK) {
    const chunk = ids.slice(start, start + PROFILE_ID_CHUNK);
    reads.push(run((query) => query.in("id", chunk)));
  }
  if (usernames.length > 0) reads.push(run((query) => query.in("username", usernames)));
  const seen = new Set<string>();
  const out: Profile[] = [];
  for (const row of (await Promise.all(reads)).flat()) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(mapProfile(row, viewer && row.id === viewer.id ? viewer.email : ""));
  }
  return out;
}

function profileQuery(supabase: SupabaseClient, columns: string) {
  return supabase.from("profiles").select<string, ProfileRow>(columns);
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
    pinnedPostId: typeof row.pinned_post_id === "string" ? row.pinned_post_id : null,
    ...(row.is_test === true ? { isTest: true } : {}),
  };
}

/** Posts and reposts the snapshot reads for the timeline: the newest of each. */
const SNAPSHOT_TIMELINE_LIMIT = 100;
/** Post ids per replies/reposts read, so the URL stays well under PostgREST's limit. */
const ENGAGEMENT_CHUNK = 100;

/**
 * The signed-in (or visiting) reader's starting state, with every read
 * bounded: the newest posts and reposts, replies and reposts for those posts
 * only, the viewer's own follows, blocks, mutes and inbox pages, and profiles
 * for the people those rows name. Nothing is read as a whole table.
 */
export async function loadSocialSnapshot(supabase: SupabaseClient): Promise<SocialSnapshot> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const viewerId = session?.user.id ?? null;
  const [blockedHidden, mutedHidden] = viewerId
    ? await Promise.all([
        loadHiddenAuthorIds(supabase, false),
        loadHiddenAuthorIds(supabase, true),
      ])
    : [[], []];
  const guard = <Q extends Parameters<typeof applyAuthorSafety>[0]>(
    query: Q,
    ids: readonly string[],
    options?: Parameters<typeof applyAuthorSafety>[3],
  ) => applyAuthorSafety(query, viewerId, ids, options);

  // Newest page plus every unread row: the lists page from here, the badges stay exact.
  const loadNotes = (viewer: string) =>
    Promise.all([
      loadNotificationPage(supabase, viewer, { cursor: null, mutedHidden }),
      loadUnreadNotifications(supabase, viewer, mutedHidden),
    ]);
  const loadMessages = (viewer: string) =>
    Promise.all([
      loadMessagePage(supabase, viewer, { cursor: null, blockedHidden }),
      loadUnreadMessages(supabase, viewer, blockedHidden),
    ]);

  const [postsRes, homePostsRes, followsRes, notesInbox, messagesInbox, repostsRes, homeRepostsRes, myBlocksRes, myMutesRes] =
    await Promise.all([
      guard(
        supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100),
        blockedHidden,
      ),
      guard(
        supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100),
        mutedHidden,
        { mute: true },
      ),
      // The viewer's own edges. Anyone else's counts and lists are read on their screens.
      viewerId
        ? supabase.from("follows").select("*").or(`follower_id.eq.${viewerId},following_id.eq.${viewerId}`)
        : Promise.resolve({ data: [], error: null }),
      // A visitor with no session has no inbox; RLS would return nothing.
      // First, any of the viewer's polls that ended get their "poll ended" notice.
      viewerId ? settleEndedPolls(supabase).then(() => loadNotes(viewerId)) : Promise.resolve(null),
      viewerId ? loadMessages(viewerId) : Promise.resolve(null),
      guard(
        supabase.from("reposts").select("*").order("created_at", { ascending: false }).limit(SNAPSHOT_TIMELINE_LIMIT),
        blockedHidden,
      ),
      guard(
        supabase.from("reposts").select("*").order("created_at", { ascending: false }).limit(SNAPSHOT_TIMELINE_LIMIT),
        mutedHidden,
        { mute: true },
      ),
      viewerId
        ? supabase.from("blocks").select("blocked_id")
        : Promise.resolve({ data: [], error: null }),
      viewerId
        ? supabase.from("mutes").select("muted_id")
        : Promise.resolve({ data: [], error: null }),
    ]);
  const failure =
    postsRes.error || homePostsRes.error || followsRes.error;
  if (failure) throw new Error(failure.message);
  if (repostsRes.error && !missingTable(repostsRes.error)) throw new Error(repostsRes.error.message);
  if (homeRepostsRes.error && !missingTable(homeRepostsRes.error)) {
    throw new Error(homeRepostsRes.error.message);
  }
  if (myBlocksRes.error && !missingTable(myBlocksRes.error)) throw new Error(myBlocksRes.error.message);
  if (myMutesRes.error && !missingTable(myMutesRes.error)) throw new Error(myMutesRes.error.message);

  let posts = await mapPostRows(supabase, (postsRes.data ?? []) as PostRow[], viewerId);
  const timelineReposts = ((repostsRes.data ?? []) as RepostRow[]).map(
    (row): PostRepost => ({
      postId: row.post_id,
      userId: row.user_id,
      createdAt: row.created_at,
    }),
  );
  const knownPostIds = new Set(posts.map((post) => post.id));
  const missingFromReposts = [...new Set(timelineReposts.map((repost) => repost.postId))].filter(
    (id) => !knownPostIds.has(id),
  );
  const missingQuoted = [
    ...new Set(
      posts
        .map((post) => post.quotedPostId)
        .filter((id): id is string => Boolean(id) && !knownPostIds.has(id!)),
    ),
  ];
  const missingPostIds = [...new Set([...missingFromReposts, ...missingQuoted])];
  if (missingPostIds.length > 0) {
    const extra = await guard(
      supabase.from("posts").select("*").in("id", missingPostIds),
      blockedHidden,
    );
    if (extra.error && !missingTable(extra.error)) throw new Error(extra.error.message);
    for (const mapped of await mapPostRows(supabase, (extra.data ?? []) as PostRow[], viewerId)) {
      posts.push(mapped);
      knownPostIds.add(mapped.id);
    }
    // One more hop for nested quote targets referenced by freshly loaded quotes.
    const nestedMissing = [
      ...new Set(
        posts
          .map((post) => post.quotedPostId)
          .filter((id): id is string => Boolean(id) && !knownPostIds.has(id!)),
      ),
    ];
    if (nestedMissing.length > 0) {
      const nested = await guard(
        supabase.from("posts").select("*").in("id", nestedMissing),
        blockedHidden,
      );
      if (nested.error && !missingTable(nested.error)) throw new Error(nested.error.message);
      posts.push(
        ...(await mapPostRows(supabase, (nested.data ?? []) as PostRow[], viewerId)),
      );
    }
    posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const follows = ((followsRes.data ?? []) as FollowRow[]).map(
    (row): FollowEdge => ({
      followerId: row.follower_id,
      followingId: row.following_id,
      createdAt: row.created_at,
    }),
  );
  const inbox: SocialSnapshot["inbox"] = viewerId
    ? {
        notifications: notesInbox?.[0] ?? { rows: [], next: null },
        unreadNotifications: notesInbox?.[1] ?? [],
        messages: messagesInbox?.[0] ?? { rows: [], next: null },
        unreadMessages: messagesInbox?.[1] ?? [],
      }
    : undefined;
  const notifications = inbox ? mergeById(inbox.notifications.rows, inbox.unreadNotifications, "newest") : [];
  const messages = inbox ? mergeById(inbox.messages.rows, inbox.unreadMessages, "oldest") : [];
  const homePosts = await mapPostRows(
    supabase,
    (homePostsRes.data ?? []) as PostRow[],
    viewerId,
  );
  const homeReposts = ((homeRepostsRes.data ?? []) as RepostRow[]).map(
    (row): PostRepost => ({
      postId: row.post_id,
      userId: row.user_id,
      createdAt: row.created_at,
    }),
  );
  // Replies and reposts for the posts loaded here only. A post loaded later
  // (another page, a card's posts) brings its own (rememberPosts).
  const engagedIds = [...new Set([...posts, ...homePosts].map((post) => post.id))];
  const engagement = await Promise.all(
    Array.from({ length: Math.ceil(engagedIds.length / ENGAGEMENT_CHUNK) }, (_, index) =>
      loadPostEngagement(
        supabase,
        engagedIds.slice(index * ENGAGEMENT_CHUNK, (index + 1) * ENGAGEMENT_CHUNK),
        viewerId ?? "",
        { muted: mutedHidden, blocked: blockedHidden },
      ),
    ),
  );
  const comments = engagement.flatMap((part) => part.comments);
  const repostKey = (repost: PostRepost) => `${repost.postId}:${repost.userId}`;
  const reposts = [
    ...new Map(
      [...timelineReposts, ...engagement.flatMap((part) => part.reposts)].map((repost) => [repostKey(repost), repost]),
    ).values(),
  ];
  const blockedIds = ((myBlocksRes.data ?? []) as { blocked_id: string }[]).map(
    (row) => row.blocked_id,
  );
  const mutedIds = ((myMutesRes.data ?? []) as { muted_id: string }[]).map((row) => row.muted_id);
  // Only the people these rows name, never the whole profiles table: authors,
  // repliers, reposters, notification actors, inbox partners, the viewer's follows.
  const named = new Set<string>(viewerId ? [viewerId] : []);
  for (const post of [...posts, ...homePosts]) named.add(post.authorId);
  for (const comment of comments) named.add(comment.authorId);
  for (const repost of [...reposts, ...homeReposts]) named.add(repost.userId);
  for (const note of notifications) if (note.actorId) named.add(note.actorId);
  for (const message of messages) {
    named.add(message.senderId);
    named.add(message.receiverId);
  }
  for (const edge of follows) {
    named.add(edge.followerId);
    named.add(edge.followingId);
  }
  const profiles = await loadVisibleProfiles(
    supabase,
    { ids: [...named] },
    session?.user ? { id: session.user.id, email: session.user.email ?? "" } : null,
    blockedHidden,
  );
  const safetyIds = [...new Set([...blockedIds, ...mutedIds])];
  let safetyAccounts: Profile[] = profiles.filter((profile) => safetyIds.includes(profile.id));
  const missingSafety = safetyIds.filter((id) => !safetyAccounts.some((profile) => profile.id === id));
  if (missingSafety.length > 0) {
    const extraProfiles = await loadProfileRows((columns) =>
      supabase.from("profiles").select<string, ProfileRow>(columns).in("id", missingSafety),
    );
    if (extraProfiles.error) throw new Error(extraProfiles.error.message);
    safetyAccounts = [
      ...safetyAccounts,
      ...((extraProfiles.data ?? []) as ProfileRow[]).map((row) => mapProfile(row)),
    ];
  }

  const viewerLikes = await loadViewerLikes(supabase, viewerId, [
    ...posts.map((post) => post.id),
    ...homePosts.map((post) => post.id),
  ]);
  const migrated = likesMigratedFlag(viewerId);
  posts = applyViewerLikes(posts, viewerLikes, viewerId, migrated);
  const stampedHome = applyViewerLikes(homePosts, viewerLikes, viewerId, migrated);

  return {
    user: profiles.find((profile) => profile.id === session?.user.id) ?? null,
    profiles,
    posts,
    follows,
    likes: viewerLikes ?? [],
    likesReady: viewerLikes !== null,
    reposts,
    comments,
    notifications,
    messages,
    // Read per screen through the public card cache (lib/social/public-card-cache.ts).
    publicCards: [],
    homePosts: stampedHome,
    homeReposts,
    blockedIds,
    mutedIds,
    safetyAccounts,
    ...(inbox ? { inbox } : {}),
  };
}

export async function remoteSignUp(
  supabase: SupabaseClient,
  input: SignUpInput,
): Promise<AuthResult> {
  const username = normalizeUsername(input.username);
  const nameError = usernameError(username);
  if (nameError) return { error: nameError };
  const wordProblem = usernameProblem(username) ?? contentProblem(input.displayName);
  if (wordProblem) return { error: wordProblem };
  if (input.password.length < 6) return { error: "Use at least 6 characters." };
  const displayName = input.displayName.trim() || username;
  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", ilikeExact(username))
    .limit(1);
  if (lookupError) return { error: lookupError.message };
  if ((existing?.length ?? 0) > 0) return { error: TAKEN_USERNAME };
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      // The signup source rides along in user metadata. The handle and name always win.
      data: { ...signupSourceData(input.source), username, display_name: displayName },
      emailRedirectTo:
        typeof window === "undefined"
          ? undefined
          : emailConfirmRedirect(window.location.origin, input.next),
      captchaToken: input.captchaToken,
    },
  });
  if (error) return { error: usernameTakenMessage(error) ?? captchaRetryMessage(error) ?? error.message };
  let session = data.session;
  if (!session) {
    const { data: stored } = await supabase.auth.getSession();
    session = stored.session;
  }
  if (session && data.user) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      username,
      display_name: displayName,
      bio: "",
      avatar_url: null,
      cover_url: null,
      accent: "#7c5cff",
    });
    if (profileError) return { error: usernameTakenMessage(profileError) ?? profileError.message };
    // Creation only. Login, profile edits, and unfollow must not call this.
    // Email-confirm signups have no session yet; the profile insert trigger
    // (private.follow_slabhold_on_signup) writes the same follow to @slabhold,
    // and a later login does not try again.
    // Test and QA handles are skipped here and in that trigger.
    if (!isTestAccount(username)) {
      await followSlabholdOnSignup(supabase, data.user.id);
    }
  }
  if (!session) {
    return { notice: "Check your email to confirm the account, then log in." };
  }
  return {};
}

export async function remoteSignIn(
  supabase: SupabaseClient,
  email: string,
  password: string,
  captchaToken?: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
    options: { captchaToken },
  });
  if (error) {
    const captcha = captchaRetryMessage(error);
    if (captcha) return { error: captcha };
    if (isEmailNotConfirmed(error)) return { error: EMAIL_NOT_CONFIRMED, unconfirmed: true };
    return { error: error.message };
  }
  return {};
}

export async function remoteSignOut(supabase: SupabaseClient) {
  await supabase.auth.signOut();
}

export async function remoteUpdateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: ProfilePatch,
): Promise<AuthResult> {
  const username = normalizeUsername(patch.username);
  const wordProblem =
    usernameProblem(username) ?? contentProblem(patch.displayName) ?? contentProblem(patch.bio);
  if (wordProblem) return { error: wordProblem };
  let currentUsername: string | null = null;
  if (isReservedUsername(username)) {
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    if (error) return { error: error.message };
    currentUsername = typeof data?.username === "string" ? data.username : null;
  }
  const nameError = usernameChangeError(username, userId, currentUsername);
  if (nameError) return { error: nameError };
  if (!patch.displayName.trim()) return { error: "Add a display name." };
  const [avatar, cover] = await Promise.all([
    uploadMedia(supabase, "avatars", userId, patch.avatarDataUrl),
    uploadMedia(supabase, "covers", userId, patch.coverDataUrl),
  ]);
  if (avatar.error) return { error: avatar.error };
  if (cover.error) return { error: cover.error };
  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      display_name: patch.displayName.trim(),
      bio: patch.bio.trim().slice(0, 160),
      avatar_url: avatar.url,
      cover_url: cover.url,
    })
    .eq("id", userId);
  if (error) return { error: usernameTakenMessage(error) ?? error.message };
  return {};
}

export async function remoteToggleFollow(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string,
  following: boolean,
): Promise<AuthResult> {
  if (followerId === followingId) return {};
  if (following) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    if (error) return { error: error.message };
    const { error: noteError } = await supabase
      .from("notifications")
      .delete()
      .eq("actor_id", followerId)
      .eq("recipient_id", followingId)
      .eq("kind", "follow");
    if (noteError && !missingTable(noteError)) return { error: noteError.message };
    return {};
  }
  if (await supabaseSafety(supabase).isBlocked(followerId, followingId)) {
    return { error: BLOCKED_INTERACTION };
  }
  const { error } = await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: followingId,
  });
  if (error) return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  if (!(await allowNotice(supabase, followerId, followingId))) return {};
  const { error: noteError } = await supabase.from("notifications").insert({
    recipient_id: followingId,
    actor_id: followerId,
    kind: "follow",
    post_id: null,
    preview: null,
  });
  if (noteError && noteError.code !== "23505" && !missingTable(noteError)) {
    return { notice: noteError.message };
  }
  return {};
}

export async function remoteFollowAll(
  supabase: SupabaseClient,
  followerId: string,
  followingIds: readonly string[],
): Promise<AuthResult> {
  const ids = [...new Set(followingIds.filter((id) => id && id !== followerId))];
  if (ids.length === 0) return {};
  const safety = supabaseSafety(supabase);
  const checks = await Promise.all(
    ids.map(async (id) => ({ id, blocked: await safety.isBlocked(followerId, id) })),
  );
  const allowed = checks.filter((row) => !row.blocked).map((row) => row.id);
  if (allowed.length === 0) return { error: BLOCKED_INTERACTION };
  const { error } = await supabase.from("follows").upsert(
    allowed.map((id) => ({ follower_id: followerId, following_id: id })),
    { onConflict: "follower_id,following_id", ignoreDuplicates: true },
  );
  if (error) return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  const notes: {
    recipient_id: string;
    actor_id: string;
    kind: "follow";
    post_id: null;
    preview: null;
  }[] = [];
  for (const id of allowed) {
    if (await allowNotice(supabase, followerId, id)) {
      notes.push({
        recipient_id: id,
        actor_id: followerId,
        kind: "follow",
        post_id: null,
        preview: null,
      });
    }
  }
  if (notes.length > 0) {
    const { error: noteError } = await supabase.from("notifications").insert(notes);
    if (noteError && noteError.code !== "23505" && !missingTable(noteError)) {
      return { notice: noteError.message };
    }
  }
  return {};
}

export async function remoteToggleRepost(
  supabase: SupabaseClient,
  input: {
    userId: string;
    postId: string;
    authorId: string | null;
    preview: string;
    reposted: boolean;
  },
): Promise<AuthResult> {
  if (input.reposted) {
    const { error } = await supabase
      .from("reposts")
      .delete()
      .eq("user_id", input.userId)
      .eq("post_id", input.postId);
    if (error) {
      if (missingTable(error)) {
        return { error: SETUP_FAILED };
      }
      return { error: error.message };
    }
    if (input.authorId && input.authorId !== input.userId) {
      const { error: noteError } = await supabase
        .from("notifications")
        .delete()
        .eq("actor_id", input.userId)
        .eq("post_id", input.postId)
        .eq("kind", "repost");
      if (noteError && !missingTable(noteError)) return { notice: noteError.message };
    }
    return {};
  }

  const { error } = await supabase.from("reposts").insert({
    user_id: input.userId,
    post_id: input.postId,
  });
  if (error) {
    if (missingTable(error)) {
      return { error: SETUP_FAILED };
    }
    if (error.code === "23505") return {};
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }

  if (!input.authorId || input.authorId === input.userId) return {};
  if (!(await allowNotice(supabase, input.userId, input.authorId))) return {};
  const { error: noteError } = await supabase.from("notifications").insert({
    recipient_id: input.authorId,
    actor_id: input.userId,
    kind: "repost",
    post_id: input.postId,
    preview: previewText(input.preview),
  });
  if (noteError && noteError.code !== "23505" && !missingTable(noteError)) {
    return { notice: noteError.message };
  }
  return {};
}

export async function remoteAddComment(
  supabase: SupabaseClient,
  authorId: string,
  postId: string,
  body: string,
  postAuthorId: string | null,
  images?: readonly string[] | null,
  gifInput?: PostGif | null,
  videoInput?: PostVideo | null,
): Promise<AuthResult> {
  const text = body.trim().slice(0, COMMENT_LIMIT);
  const gif = gifForSave(gifInput);
  const video = gif ? null : sanitizeVideo(videoInput, authorId);
  if (videoInput && !gif && !video) return { error: "Couldn't attach that video. Remove it and try again." };
  // A reply has photos, a GIF or a video, never a mix.
  const photos = gif || video ? [] : draftPostPhotos({ images: images ?? [] });
  if (!text && photos.length === 0 && !gif && !video) return { error: "Write a comment." };
  const textProblem = contentProblem(text);
  if (textProblem) return { error: textProblem };
  if (photos.length > 0 && replyImagesKnownMissing()) return { error: REPLY_PHOTOS_UNAVAILABLE };
  if (
    postAuthorId &&
    postAuthorId !== authorId &&
    (await supabaseSafety(supabase).isBlocked(authorId, postAuthorId))
  ) {
    return { error: BLOCKED_INTERACTION };
  }
  const uploaded = photos.length
    ? await uploadPostImages(supabase, authorId, photos)
    : { urls: [] as string[], createdPaths: [] as string[] };
  if (uploaded.error) return { error: uploaded.error };
  const row: {
    post_id: string;
    user_id: string;
    body: string;
    image_urls?: string[];
    gif?: PostGif;
    video?: PostVideo;
  } = {
    post_id: postId,
    user_id: authorId,
    body: text,
  };
  if (uploaded.urls.length) row.image_urls = uploaded.urls;
  if (gif) row.gif = gif;
  if (video) row.video = video;
  const { error } = await supabase.from("comments").insert(row);
  if (error) {
    await discardPostImages(supabase, uploaded.createdPaths);
    if (gif && gifColumnMissing(error)) {
      notePostExtrasMissing();
      return { error: GIFS_UNAVAILABLE };
    }
    if (video && videoColumnMissing(error)) {
      noteVideoMissing();
      return { error: VIDEOS_UNAVAILABLE };
    }
    if (replyImageColumnMissing(error)) {
      noteReplyImagesMissing();
      return { error: REPLY_PHOTOS_UNAVAILABLE };
    }
    if (missingTable(error)) return { error: SETUP_FAILED };
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }

  const noticeImages = replyNotificationImages(uploaded.urls);
  let notice: string | undefined;
  try {
    let recipientId = postAuthorId;
    if (!recipientId) {
      const { data } = await supabase.from("posts").select("user_id").eq("id", postId).maybeSingle();
      recipientId = (data?.user_id as string | undefined) ?? null;
    }
    const notifyAuthor =
      recipientId !== null &&
      recipientId !== authorId &&
      (await allowNotice(supabase, authorId, recipientId));
    if (notifyAuthor && recipientId) {
      const { error: noteError } = await supabase.from("notifications").insert({
        recipient_id: recipientId,
        actor_id: authorId,
        kind: "comment",
        post_id: postId,
        preview: replyNoticePreview(text, noticeImages) ?? (gif ? "GIF" : video ? "Video" : null),
      });
      if (noteError && !missingTable(noteError)) notice = noteError.message;
    }
    await notifyReplyMentions(supabase, {
      actorId: authorId,
      postId,
      body: text,
      skipRecipientId: notifyAuthor ? recipientId : null,
    });
  } catch {
    // The reply is already saved. A notification failure must not fail it.
  }
  return notice ? { notice } : {};
}

export async function remoteSyncLikeNotification(
  supabase: SupabaseClient,
  input: {
    actorId: string;
    recipientId: string;
    postId: string;
    preview: string;
    liked: boolean;
  },
): Promise<AuthResult> {
  if (input.actorId === input.recipientId) return {};
  if (!input.liked) {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("actor_id", input.actorId)
      .eq("post_id", input.postId)
      .eq("kind", "like");
    if (error && !missingTable(error)) return { error: error.message };
    return {};
  }
  // Post likes are inserted by private.sync_like. Clients cannot insert
  // kind=like, including a heart on a reply.
  return {};
}

export async function remoteMarkNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  ids?: readonly string[],
): Promise<AuthResult> {
  if (ids && ids.length === 0) return {};
  let query = supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", userId)
    .eq("read", false);
  if (ids) query = query.in("id", [...ids]);
  const { error } = await query;
  if (error && !missingTable(error)) return { error: error.message };
  return {};
}

async function discardPostImages(supabase: SupabaseClient, paths: readonly string[]) {
  await Promise.all(paths.map((path) => removeUploadedMedia(supabase, "post-images", path)));
}

async function uploadPostImages(
  supabase: SupabaseClient,
  authorId: string,
  photos: readonly string[],
): Promise<{ urls: string[]; createdPaths: string[]; error?: string }> {
  const urls: string[] = [];
  const createdPaths: string[] = [];
  for (const value of photos) {
    const image = await uploadMedia(supabase, "post-images", authorId, value);
    if (image.error || !image.url) {
      await discardPostImages(supabase, createdPaths);
      return { urls: [], createdPaths: [], error: image.error ?? "Could not upload that photo." };
    }
    urls.push(image.url);
    if (image.createdPath) createdPaths.push(image.createdPath);
  }
  return { urls, createdPaths };
}

type PreparedPost = {
  row: {
    user_id: string;
    content: string;
    image_url: string | null;
    card: PublicCard | null;
    quoted_post_id: string | null;
  };
  meta: Record<string, unknown> | null;
  gif: PostGif | null;
  video: PostVideo | null;
  body: string;
  hasCard: boolean;
  shareOfNewCard: boolean;
  imagePaths: string[];
  cardPath: string | null;
};

/** Check one post and upload what it carries. Nothing is inserted here. */
async function preparePost(
  supabase: SupabaseClient,
  authorId: string,
  input: PostWrite,
): Promise<{ error: string } | { post: PreparedPost }> {
  const body = input.body.trim();
  const gif = gifForSave(input.gif);
  // Only a video this author uploaded to the post-videos bucket. A GIF wins over a video.
  const video = gif ? null : sanitizeVideo(input.video, authorId);
  if (input.video && !gif && !video) return { error: "Couldn't attach that video. Remove it and try again." };
  // A post has photos, a GIF or a video, never a mix.
  const photos = gif || video ? [] : draftPostPhotos(input);
  const quotedPostId = input.quotedPostId?.trim() || null;
  if (quotedPostId) {
    const quoteError = validateQuoteContent({
      body,
      imageDataUrl: photos[0] ?? gif?.still ?? video?.poster ?? null,
      card: input.card,
    });
    if (quoteError) return { error: quoteError };
  } else if (!body && photos.length === 0 && !input.card && !gif && !video) {
    return { error: "Write something, add a photo, or attach a card." };
  }
  if (body.length > 280) return { error: "Keep it to 280 characters." };
  const bodyProblem = contentProblem(body);
  if (bodyProblem) return { error: bodyProblem };

  if (quotedPostId) {
    const { data: quoted, error: quotedError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", quotedPostId)
      .maybeSingle();
    if (quotedError) return { error: quotedError.message };
    if (!quoted) return { error: "That post is unavailable." };
  }

  const uploaded = await uploadPostImages(supabase, authorId, photos);
  if (uploaded.error) return { error: uploaded.error };
  const card = await storedCard(supabase, authorId, input.card, { reuseCardPhoto: Boolean(input.shareOfNewCard) });
  if (card.error) {
    await discardPostImages(supabase, uploaded.createdPaths);
    return { error: card.error };
  }
  return {
    post: {
      row: {
        user_id: authorId,
        content: body,
        // A video post keeps its poster here too, so link previews and share images show it.
        image_url: video ? video.poster : (uploaded.urls[0] ?? null),
        card: card.card,
        quoted_post_id: quotedPostId,
      },
      meta: metaWithImages(null, uploaded.urls),
      gif,
      video,
      body,
      hasCard: Boolean(input.card),
      shareOfNewCard: Boolean(input.shareOfNewCard),
      imagePaths: uploaded.createdPaths,
      cardPath: card.createdPath ?? null,
    },
  };
}

/** A save that failed leaves nothing behind: its photos, card photo and video go. */
async function discardPrepared(supabase: SupabaseClient, posts: readonly PreparedPost[]) {
  for (const post of posts) {
    await discardPostImages(supabase, post.imagePaths);
    if (post.cardPath) await removeUploadedMedia(supabase, "card-photos", post.cardPath);
    await removeStoredVideo(supabase, post.video);
  }
}

/**
 * `videoRemoved`: the save failed after the video was uploaded, and its files
 * were deleted with the rest. The composer drops its tile so it is added again.
 */
export async function remoteCreatePost(
  supabase: SupabaseClient,
  authorId: string,
  input: PostWrite,
): Promise<AuthResult & { postId?: string; videoRemoved?: boolean }> {
  if (input.poll) return remoteCreatePoll(supabase, authorId, input.body, input.poll);
  const prepared = await preparePost(supabase, authorId, input);
  if ("error" in prepared) return { error: prepared.error };
  const { post } = prepared;
  // The gif and video keys are only sent with a GIF or a video, so posts save
  // as before on a database that has no such column yet.
  const base = {
    ...post.row,
    ...(post.gif ? { gif: post.gif } : {}),
    ...(post.video ? { video: post.video } : {}),
  };
  const meta = post.meta;
  let created: { id: string } | null = null;
  let error: { message?: string; code?: string } | null = null;
  if (meta) {
    const withMeta = await supabase.from("posts").insert({ ...base, meta }).select("id").single();
    created = withMeta.data;
    error = withMeta.error;
    if (error && metaColumnMissing(error)) {
      noteMultiPhotoMissing();
      const retry = await supabase.from("posts").insert(base).select("id").single();
      created = retry.data;
      error = retry.error;
    }
  } else {
    const inserted = await supabase.from("posts").insert(base).select("id").single();
    created = inserted.data;
    error = inserted.error;
  }
  if (error || !created) {
    await discardPrepared(supabase, [post]);
    const removed = post.video ? { videoRemoved: true } : {};
    if (post.gif && gifColumnMissing(error)) {
      notePostExtrasMissing();
      return { error: GIFS_UNAVAILABLE };
    }
    if (post.video && videoColumnMissing(error)) {
      noteVideoMissing();
      return { error: VIDEOS_UNAVAILABLE, ...removed };
    }
    return {
      error: rlsBlocked(error) ? BLOCKED_INTERACTION : (error?.message ?? "Could not save that post."),
      ...removed,
    };
  }

  // Adding a card already alerts once. Skip the post alert for that share.
  if (post.hasCard && !post.shareOfNewCard) postWantAlerts.ping("post", created.id);

  // Quote notifications are created by a DB trigger on posts insert.
  // Mentions stay client-side so edit/sync can add/remove them.
  const mentionProblem = await syncMentionNotifications(supabase, authorId, created.id, post.body);
  if (mentionProblem) return { notice: mentionProblem, postId: created.id };
  return { postId: created.id };
}

/** A poll post: text and a poll, nothing else (like X). Saved in one call. */
async function remoteCreatePoll(
  supabase: SupabaseClient,
  authorId: string,
  text: string,
  poll: PollDraft,
): Promise<AuthResult & { postId?: string }> {
  const body = text.trim();
  if (!body) return { error: POLL_QUESTION_REQUIRED };
  if (body.length > 280) return { error: "Keep it to 280 characters." };
  const problem = pollDraftProblem(poll) ?? contentProblem(body) ?? pollChoices(poll).map(contentProblem).find(Boolean);
  if (problem) return { error: problem };
  const created = await remoteCreatePollPost(supabase, body, poll);
  if (created.error || !created.postId) {
    return { error: rlsBlocked({ message: created.error }) ? BLOCKED_INTERACTION : (created.error ?? "Could not save that post.") };
  }
  const mentionProblem = await syncMentionNotifications(supabase, authorId, created.postId, body);
  if (mentionProblem) return { notice: mentionProblem, postId: created.postId };
  return { postId: created.postId };
}

/**
 * A thread: 2 to 10 posts saved in one insert, so they all land or none do.
 * `postIds` come back first to last. One post is saved as a normal post.
 */
export async function remoteCreateThread(
  supabase: SupabaseClient,
  authorId: string,
  inputs: readonly PostWrite[],
  /** Swappable so a test gets a known thread id. */
  newThreadId: () => string = () => crypto.randomUUID(),
): Promise<AuthResult & { postIds?: string[] }> {
  if (inputs.length === 0) return { error: "Write something, add a photo, or attach a card." };
  if (inputs.length > THREAD_MAX) return { error: "A thread can have up to 10 posts." };
  if (inputs.length === 1) {
    const single = await remoteCreatePost(supabase, authorId, inputs[0]!);
    return { error: single.error, notice: single.notice, postIds: single.postId ? [single.postId] : undefined };
  }

  const prepared: PreparedPost[] = [];
  for (const input of inputs) {
    const next = await preparePost(supabase, authorId, input);
    if ("error" in next) {
      await discardPrepared(supabase, prepared);
      const place = prepared.length + 1;
      return { error: `Post ${place} of ${inputs.length}: ${next.error}` };
    }
    prepared.push(next.post);
  }

  const slots = threadSlots(prepared.length, newThreadId());
  // Every row carries the same keys: one insert, in thread order.
  // The video key goes on every row only when one of them has a video.
  const anyVideo = prepared.some((post) => post.video);
  const rows = prepared.map((post, index) => ({
    ...post.row,
    meta: post.meta,
    gif: post.gif,
    ...(anyVideo ? { video: post.video } : {}),
    thread_id: slots[index]!.threadId,
    thread_position: slots[index]!.threadPosition,
  }));
  const { data, error } = await supabase.from("posts").insert(rows).select("id, thread_position");
  if (error || !data || data.length !== rows.length) {
    await discardPrepared(supabase, prepared);
    if (anyVideo && videoColumnMissing(error)) {
      noteVideoMissing();
      return { error: VIDEOS_UNAVAILABLE };
    }
    if (threadColumnMissing(error) || gifColumnMissing(error)) {
      notePostExtrasMissing();
      return { error: THREADS_UNAVAILABLE };
    }
    return {
      error: rlsBlocked(error) ? BLOCKED_INTERACTION : (error?.message ?? "Could not save that thread."),
    };
  }
  const saved = [...(data as { id: string; thread_position: number | null }[])].sort(
    (a, b) => (a.thread_position ?? 0) - (b.thread_position ?? 0),
  );
  const postIds = saved.map((row) => row.id);

  let notice: string | undefined;
  for (const [index, post] of prepared.entries()) {
    const postId = postIds[index]!;
    if (post.hasCard && !post.shareOfNewCard) postWantAlerts.ping("post", postId);
    const mentionProblem = await syncMentionNotifications(supabase, authorId, postId, post.body);
    if (mentionProblem) notice = mentionProblem;
  }
  return notice ? { notice, postIds } : { postIds };
}

export async function remoteUpdatePost(
  supabase: SupabaseClient,
  authorId: string,
  postId: string,
  input: {
    body: string;
    imageDataUrl: string | null;
    images?: readonly string[] | null;
    /** Left out: the GIF stays as it is. Null takes it off. */
    gif?: PostGif | null;
  },
): Promise<AuthResult> {
  const body = input.body.trim();
  if (body.length > 280) return { error: "Keep it to 280 characters." };
  const bodyProblem = contentProblem(body);
  if (bodyProblem) return { error: bodyProblem };
  const gif = input.gif === undefined ? undefined : gifForSave(input.gif);
  // An edit never changes a video. Read it from the row, so image_url stays
  // exactly its poster (the only picture a video post may keep) and no photo
  // is added beside it.
  const videoImage = videoPostImageUrl(await storedVideoValue(supabase, "posts", postId, authorId));
  const hasVideo = videoImage !== undefined;
  const photos = gif || hasVideo ? [] : draftPostPhotos(input);
  const uploaded = await uploadPostImages(supabase, authorId, photos);
  if (uploaded.error) return { error: uploaded.error };
  const forgetUploads = async (message: string): Promise<AuthResult> => {
    await discardPostImages(supabase, uploaded.createdPaths);
    return { error: message };
  };
  const prior = await supabase
    .from("posts")
    .select("meta")
    .eq("id", postId)
    .eq("user_id", authorId)
    .maybeSingle();
  const base: { content: string; image_url: string | null; gif?: PostGif | null } = {
    content: body,
    image_url: hasVideo ? videoImage : (uploaded.urls[0] ?? null),
  };
  // Only sent when the editor changed it, so an edit saves on a database with no gif column.
  if (gif !== undefined) base.gif = gif;
  if (prior.error && metaColumnMissing(prior.error)) {
    noteMultiPhotoMissing();
    const { error } = await supabase
      .from("posts")
      .update(base)
      .eq("id", postId)
      .eq("user_id", authorId);
    if (error) return forgetUploads(error.message);
  } else {
    if (prior.error) return forgetUploads(prior.error.message);
    const meta = metaWithImages(prior.data?.meta, uploaded.urls);
    const { error } = await supabase
      .from("posts")
      .update({ ...base, meta })
      .eq("id", postId)
      .eq("user_id", authorId);
    if (error && metaColumnMissing(error)) {
      noteMultiPhotoMissing();
      const retry = await supabase
        .from("posts")
        .update(base)
        .eq("id", postId)
        .eq("user_id", authorId);
      if (retry.error) return forgetUploads(retry.error.message);
    } else if (error) {
      return forgetUploads(error.message);
    }
  }
  const mentionProblem = await syncMentionNotifications(supabase, authorId, postId, body);
  if (mentionProblem) return { notice: mentionProblem };
  return {};
}

export async function syncMentionNotifications(
  supabase: SupabaseClient,
  actorId: string,
  postId: string,
  body: string,
): Promise<string | null> {
  const handles = mentionsToNotify(body);
  const existing = await supabase
    .from("notifications")
    .select("recipient_id, metadata")
    .eq("actor_id", actorId)
    .eq("post_id", postId)
    .eq("kind", "mention");
  if (existing.error) {
    if (missingTable(existing.error)) return null;
    return existing.error.message;
  }

  const already = new Set<string>();
  const postMentionRecipients = new Set<string>();
  for (const row of (existing.data ?? []) as { recipient_id: string; metadata?: unknown }[]) {
    if (!row.recipient_id) continue;
    already.add(row.recipient_id);
    // Reply rows are marked metadata.source = "reply". Editing the post must not remove them.
    if (!isReplyMentionMetadata(row.metadata)) postMentionRecipients.add(row.recipient_id);
  }
  const recipientIds: string[] = [];
  if (handles.length > 0) {
    const { query: profileQuery } = await withAuthorSafety(
      supabase,
      supabase
        .from("profiles")
        .select("id, username")
        .or(handles.map((name) => `username.ilike.${name}`).join(",")),
      actorId,
      { authorColumn: "id" },
    );
    const { data, error } = await profileQuery;
    if (error) return error.message;
    const byName = new Map(
      ((data ?? []) as { id: string; username: string }[]).map((row) => [
        row.username.toLowerCase(),
        row.id,
      ]),
    );
    const seen = new Set<string>();
    for (const name of handles) {
      const id = byName.get(name);
      if (!id || id === actorId || seen.has(id)) continue;
      seen.add(id);
      recipientIds.push(id);
    }
  }

  const next = new Set(recipientIds);
  const remove = [...postMentionRecipients].filter((id) => !next.has(id));
  if (remove.length > 0) {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("actor_id", actorId)
      .eq("post_id", postId)
      .eq("kind", "mention")
      .is("metadata", null)
      .in("recipient_id", remove);
    if (error && !missingTable(error)) return error.message;
  }

  const candidates = recipientIds.filter((id) => !already.has(id));
  const add: string[] = [];
  for (const recipientId of candidates) {
    if (await allowNotice(supabase, actorId, recipientId)) add.push(recipientId);
  }
  if (add.length === 0) return null;
  const { error } = await supabase.from("notifications").insert(
    add.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: actorId,
      kind: "mention",
      post_id: postId,
      preview: previewText(body),
    })),
  );
  if (!error || error.code === "23505" || missingTable(error)) return null;
  return "Your post was saved, but we couldn't notify everyone you mentioned.";
}

/**
 * PostgREST `.or()` for people search on the query's longest word. Keeps
 * accented letters (names like "Dončić"); drops the characters that would
 * change the filter itself, and escapes LIKE wildcards.
 */
export function peopleIlikeOr(words: readonly string[]): string | null {
  const longest = [...words].map((word) => word.trim()).sort((a, b) => b.length - a.length)[0] ?? "";
  const word = longest.replace(/^@+/, "").replace(/[,()"'\\.:*]/g, "").slice(0, 40);
  if (!word) return null;
  const pattern = `%${escapeIlike(word)}%`;
  return `username.ilike.${pattern},display_name.ilike.${pattern}`;
}

/**
 * People search on the server: handle or name contains the query's longest
 * word (the rest is matched by the caller, all words, as before). People the
 * viewer blocked or who blocked them are left out. Never reads the whole table.
 */
export async function searchPeople(
  supabase: SupabaseClient,
  words: readonly string[],
  limit = 40,
): Promise<Profile[]> {
  const orFilter = peopleIlikeOr(words);
  if (!orFilter) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  const viewer = sessionData.session?.user ?? null;
  const hidden = viewer ? await loadHiddenAuthorIds(supabase, false) : [];
  const { data, error } = await loadProfileRows((columns) =>
    applyAuthorSafety(profileQuery(supabase, columns).or(orFilter).limit(limit), viewer?.id ?? null, hidden, {
      authorColumn: "id",
    }),
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProfileRow[]).map((row) =>
    mapProfile(row, viewer && row.id === viewer.id ? (viewer.email ?? "") : ""),
  );
}

/**
 * Search public profiles for @mention autocomplete by username / display_name.
 * Empty query returns [] — callers should show followed users locally instead.
 */
export async function searchProfilesForMention(
  supabase: SupabaseClient,
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<MentionCandidate[]> {
  const orFilter = mentionIlikeOr(query);
  if (!orFilter) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  const { query: req } = await withAuthorSafety(
    supabase,
    supabase
      .from("profiles")
      .select(MENTION_PROFILE_SELECT)
      .or(orFilter)
      .limit(limit),
    sessionData.session?.user.id ?? null,
    { authorColumn: "id" },
  );
  if (signal) {
    req.abortSignal(signal);
  }
  const { data, error } = await req;
  if (error || !data) return [];
  return (data as Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url">[]).map(
    (row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarDataUrl: row.avatar_url,
      accent: "#7c5cff",
    }),
  );
}

function pinError(error: { code?: string; message?: string } | null): string | undefined {
  if (!error) return undefined;
  if (error.code === "42501") return "Hidden posts can't be pinned.";
  if (/can only pin your own post/i.test(error.message ?? "")) {
    return "You can only pin your own post.";
  }
  return error.message || "Could not update your pin.";
}

export async function remotePinPost(supabase: SupabaseClient, postId: string): Promise<AuthResult> {
  const { error } = await supabase.rpc("pin_post", { post_id: postId });
  const message = pinError(error);
  return message ? { error: message } : {};
}

export async function remoteUnpinPost(supabase: SupabaseClient): Promise<AuthResult> {
  const { error } = await supabase.rpc("unpin_post");
  const message = pinError(error);
  return message ? { error: message } : {};
}

/** The video column of one of this author's rows, exactly as stored. Undefined when it can't be read. */
async function storedVideoValue(
  supabase: SupabaseClient,
  table: "posts" | "comments",
  id: string,
  authorId: string,
): Promise<unknown> {
  if (videoKnownMissing()) return undefined;
  try {
    const { data, error } = await supabase
      .from(table)
      .select("video")
      .eq("id", id)
      .eq("user_id", authorId)
      .maybeSingle();
    if (error) {
      if (videoColumnMissing(error)) noteVideoMissing();
      return undefined;
    }
    return (data as { video?: unknown } | null)?.video ?? null;
  } catch {
    return undefined;
  }
}

/** The video a post or reply stores, read before it is deleted. Null when it has none. */
async function storedVideo(
  supabase: SupabaseClient,
  table: "posts" | "comments",
  id: string,
  authorId: string,
): Promise<PostVideo | null> {
  return sanitizeVideo(await storedVideoValue(supabase, table, id, authorId), authorId);
}

/**
 * What an edit writes to posts.image_url for a post that has a video: the
 * stored poster, character for character (the database only allows that or
 * null). Undefined when the post has no video.
 */
export function videoPostImageUrl(stored: unknown): string | null | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  const poster = (stored as { poster?: unknown }).poster;
  return typeof poster === "string" ? poster : null;
}

/** Best effort: the post is gone either way. A file left behind is only storage. */
export async function removeStoredVideo(supabase: SupabaseClient, video: PostVideo | null) {
  const paths = postVideoPaths(video);
  if (!paths.length) return;
  try {
    await supabase.storage.from(VIDEO_BUCKET).remove(paths);
  } catch {
    // Ignored. The delete already succeeded.
  }
}

export async function remoteDeletePost(supabase: SupabaseClient, authorId: string, postId: string) {
  const video = await storedVideo(supabase, "posts", postId, authorId);
  const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", authorId);
  if (error) return { error: error.message };
  // Deleting a post deletes its video and poster from storage.
  await removeStoredVideo(supabase, video);
  return {};
}

/**
 * Notifications have no comment id. The likes insert rule only allows mention
 * metadata {"source":"reply"}, so a comment id cannot be stored.
 *
 * Text replies match the stamped preview. A photo-only reply is stamped with
 * preview NULL. Deleting one drops only the newest NULL comment notice for
 * this actor and post, not every NULL preview.
 *
 * "Delete notifications you sent" (auth.uid() = actor_id) already allows this.
 * Migrations never drop it. A rejected cleanup, including RLS, is ignored so
 * the reply stays deleted.
 */
/** Rows already stored on the comment. Render filtering is for display, not cleanup. */
function storedReplyImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function deleteOwnReplyPreviewNotifications(
  supabase: SupabaseClient,
  actorId: string,
  postId: string,
  body: string,
  images?: readonly string[] | null,
) {
  const run = async (query: PromiseLike<unknown>) => {
    try {
      await query;
    } catch {
      // The reply is already deleted.
    }
  };
  const text = body.trim();
  if (!text) {
    if (!images || images.length === 0) return;
    let id: string | null = null;
    try {
      const found = await supabase
        .from("notifications")
        .select("id")
        .eq("actor_id", actorId)
        .eq("post_id", postId)
        .eq("kind", "comment")
        .is("preview", null)
        .order("created_at", { ascending: false })
        .limit(1);
      id = Array.isArray(found.data) ? (found.data[0] as { id?: string } | undefined)?.id ?? null : null;
    } catch {
      return;
    }
    if (!id) return;
    await run(supabase.from("notifications").delete().eq("id", id).eq("actor_id", actorId));
    return;
  }
  const preview = replyNoticePreview(text, images);
  if (!preview) return;
  await run(
    supabase
      .from("notifications")
      .delete()
      .eq("actor_id", actorId)
      .eq("post_id", postId)
      .eq("kind", "comment")
      .eq("preview", preview),
  );
  await run(
    supabase
      .from("notifications")
      .delete()
      .eq("actor_id", actorId)
      .eq("post_id", postId)
      .eq("kind", "mention")
      .eq("metadata->>source", "reply")
      .eq("preview", preview),
  );
}

export async function remoteDeleteComment(
  supabase: SupabaseClient,
  authorId: string,
  commentId: string,
) {
  // The deleted row comes back with its video, so the file can go too.
  const withVideo = !videoKnownMissing();
  const removed = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", authorId)
    .select((withVideo ? "id, post_id, body, image_urls, video" : "id, post_id, body, image_urls") as string);
  let data = removed.data;
  let error = removed.error;
  if (error && withVideo && videoColumnMissing(error)) {
    noteVideoMissing();
    const retry = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", authorId)
      .select("id, post_id, body, image_urls");
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error && replyImageColumnMissing(error)) {
    noteReplyImagesMissing();
    const retry = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", authorId)
      .select("id, post_id, body");
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) {
    return {
      error: rlsBlocked(error) ? "You can only delete your own replies." : error.message,
    };
  }
  // PostgREST returns zero rows, not an error, when RLS hides the delete.
  if (!Array.isArray(data) || data.length === 0) {
    return { error: "Could not delete that reply." };
  }
  const deleted = data[0] as unknown as {
    id: string;
    post_id?: string | null;
    body?: string | null;
    image_urls?: unknown;
    video?: unknown;
  };
  await removeStoredVideo(supabase, sanitizeVideo(deleted.video, authorId));
  if (deleted.post_id) {
    await deleteOwnReplyPreviewNotifications(
      supabase,
      authorId,
      deleted.post_id,
      deleted.body ?? "",
      storedReplyImages(deleted.image_urls),
    );
  }
  return {};
}

async function storedCard(
  supabase: SupabaseClient,
  userId: string,
  card: PublicCard | null,
  { reuseCardPhoto = false }: { reuseCardPhoto?: boolean } = {},
): Promise<{ card: PublicCard | null; error?: string; createdPath?: string }> {
  if (!card) return { card: null };
  // The post for a card just added: its save already uploaded the photo. Attach that one.
  if (reuseCardPhoto && card.photoDataUrl?.startsWith("data:")) {
    const { data } = await supabase
      .from("cards")
      .select("image_url")
      .eq("id", card.id)
      .eq("user_id", userId)
      .maybeSingle();
    const stored = (data as { image_url?: string | null } | null)?.image_url;
    if (stored) return { card: { ...card, photoDataUrl: stored } };
  }
  const photo = await uploadMedia(supabase, "card-photos", userId, card.photoDataUrl);
  if (photo.error) return { card: null, error: photo.error };
  return { card: { ...card, photoDataUrl: photo.url }, createdPath: photo.createdPath };
}
