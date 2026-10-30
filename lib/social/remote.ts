import type { SupabaseClient } from "@supabase/supabase-js";
import { captchaRetryMessage } from "@/lib/auth/captcha";
import { emailConfirmRedirect } from "@/lib/auth/safe-next";
import { EMAIL_NOT_CONFIRMED, isEmailNotConfirmed } from "@/lib/auth/signup-fields";
import { removeUploadedMedia, uploadMedia } from "@/lib/supabase/media";
import { sanitizeAttachedCard } from "./card-posts";
import { applyViewerLikes, likesMigratedFlag, loadViewerLikes, readLikeCount } from "./likes";
import { loadMailDayViews } from "./mail-day";
import {
  loadMessageRows,
  mapDirectMessage,
  offerSendError,
  offersColumnMissing,
  parseCardPreview,
} from "@/lib/offers/open-to-offers";
import { mapPublicCard } from "./cards";
import type {
  AuthResult,
  CardMessagePreview,
  FollowEdge,
  Notification,
  NotificationKind,
  MailDayCardView,
  Post,
  PostComment,
  PostRepost,
  Profile,
  ProfilePatch,
  PublicCard,
  SignUpInput,
  SocialSnapshot,
} from "./types";
import { COMMENT_LIMIT, MESSAGE_LIMIT } from "./types";
import { mentionIlikeOr, type MentionCandidate } from "./mentions";
import {
  isReplyMentionMetadata,
  mentionsToNotify,
  notifyReplyMentions,
} from "./reply-mentions";
import { isReservedUsername, normalizeUsername, usernameChangeError, usernameError } from "./local-db";
import { followOfficialUpdates } from "./official-updates";
import {
  noteReplyImagesMissing,
  replyImageColumnMissing,
  replyImagesFromValue,
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
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { canNotify, supabaseSafety } from "@/lib/safety/can-notify";
import { applyAuthorSafety, loadHiddenAuthorIds, withAuthorSafety } from "@/lib/safety/filters";
import { needsSuggestionHeadroom, suggestionExtraRange } from "./follow-suggestions";

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

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  image_urls?: unknown;
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  kind: NotificationKind;
  post_id: string | null;
  preview: string | null;
  href?: string | null;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
  kind?: string | null;
  card_preview?: unknown;
};

/** Row from public.public_cards — no paid_price / purchase_date / notes / cert_number. */
type PublicCardRow = {
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

export async function loadSupabaseSocial(supabase: SupabaseClient): Promise<SocialSnapshot> {
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

  const loadMessages = () =>
    loadMessageRows((columns) => {
      let query = supabase.from("messages").select(columns).order("created_at", { ascending: true });
      query = guard(query, blockedHidden, { authorColumn: "sender_id" });
      query = guard(query, blockedHidden, { authorColumn: "receiver_id" });
      return query;
    });

  const [profilesRes, postsRes, homePostsRes, followsRes, cardsRes, commentsRes, notificationsRes, messagesRes, repostsRes, homeRepostsRes, myBlocksRes, myMutesRes] =
    await Promise.all([
      loadProfileRows((columns) =>
        guard(
          supabase.from("profiles").select<string, ProfileRow>(columns).order("created_at", { ascending: true }),
          blockedHidden,
          { authorColumn: "id" },
        ),
      ),
      guard(
        supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100),
        blockedHidden,
      ),
      guard(
        supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100),
        mutedHidden,
        { mute: true },
      ),
      supabase.from("follows").select("*"),
      supabase.from("public_cards").select("*"),
      guard(
        supabase.from("comments").select("*").order("created_at", { ascending: true }),
        mutedHidden,
        { mute: true },
      ),
      // A visitor with no session has no inbox; RLS would return nothing.
      viewerId
        ? guard(
            supabase.from("notifications").select("*").order("created_at", { ascending: false }),
            mutedHidden,
            { authorColumn: "actor_id", mute: true, keepNullAuthor: true },
          )
        : Promise.resolve({ data: [], error: null }),
      viewerId ? loadMessages() : Promise.resolve({ data: [], error: null }),
      guard(
        supabase.from("reposts").select("*").order("created_at", { ascending: false }),
        blockedHidden,
      ),
      guard(
        supabase.from("reposts").select("*").order("created_at", { ascending: false }),
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
    profilesRes.error || postsRes.error || homePostsRes.error || followsRes.error || cardsRes.error;
  if (failure) throw new Error(failure.message);
  if (commentsRes.error && !missingTable(commentsRes.error)) throw new Error(commentsRes.error.message);
  if (notificationsRes.error && !missingTable(notificationsRes.error)) {
    throw new Error(notificationsRes.error.message);
  }
  if (messagesRes.error && !missingTable(messagesRes.error)) throw new Error(messagesRes.error.message);
  if (repostsRes.error && !missingTable(repostsRes.error)) throw new Error(repostsRes.error.message);
  if (homeRepostsRes.error && !missingTable(homeRepostsRes.error)) {
    throw new Error(homeRepostsRes.error.message);
  }
  if (myBlocksRes.error && !missingTable(myBlocksRes.error)) throw new Error(myBlocksRes.error.message);
  if (myMutesRes.error && !missingTable(myMutesRes.error)) throw new Error(myMutesRes.error.message);

  const profiles = ((profilesRes.data ?? []) as ProfileRow[]).map((row) =>
    mapProfile(row, row.id === session?.user.id ? (session.user.email ?? "") : ""),
  );
  if (needsSuggestionHeadroom(profiles.length)) {
    const { from, to } = suggestionExtraRange(profiles.length);
    const extraRes = await loadProfileRows((columns) =>
      guard(
        supabase
          .from("profiles")
          .select<string, ProfileRow>(columns)
          .order("created_at", { ascending: true })
          .range(from, to),
        blockedHidden,
        { authorColumn: "id" },
      ),
    );
    if (extraRes.error) throw new Error(extraRes.error.message);
    const known = new Set(profiles.map((profile) => profile.id));
    for (const row of (extraRes.data ?? []) as ProfileRow[]) {
      if (known.has(row.id)) continue;
      known.add(row.id);
      profiles.push(
        mapProfile(row, row.id === session?.user.id ? (session.user.email ?? "") : ""),
      );
    }
  }
  let posts = await mapPostRows(supabase, (postsRes.data ?? []) as PostRow[], viewerId);
  const reposts = ((repostsRes.data ?? []) as RepostRow[]).map(
    (row): PostRepost => ({
      postId: row.post_id,
      userId: row.user_id,
      createdAt: row.created_at,
    }),
  );
  const knownPostIds = new Set(posts.map((post) => post.id));
  const missingFromReposts = [...new Set(reposts.map((repost) => repost.postId))].filter(
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
  const publicCards = ((cardsRes.data ?? []) as PublicCardRow[]).map((row) =>
    mapPublicCard(row),
  );
  const comments = ((commentsRes.data ?? []) as CommentRow[]).map((row): PostComment => {
    const images = replyImagesFromValue(row.image_urls);
    return {
      id: row.id,
      postId: row.post_id,
      authorId: row.user_id,
      body: row.body,
      ...(images.length ? { images } : {}),
      createdAt: row.created_at,
    };
  });
  const notifications = ((notificationsRes.data ?? []) as NotificationRow[]).map(
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
  const messages = ((messagesRes.data ?? []) as unknown as MessageRow[]).map((row) => mapDirectMessage(row));
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
  const blockedIds = ((myBlocksRes.data ?? []) as { blocked_id: string }[]).map(
    (row) => row.blocked_id,
  );
  const mutedIds = ((myMutesRes.data ?? []) as { muted_id: string }[]).map((row) => row.muted_id);
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
    publicCards,
    homePosts: stampedHome,
    homeReposts,
    blockedIds,
    mutedIds,
    safetyAccounts,
  };
}

export async function remoteSignUp(
  supabase: SupabaseClient,
  input: SignUpInput,
): Promise<AuthResult> {
  const username = normalizeUsername(input.username);
  const nameError = usernameError(username);
  if (nameError) return { error: nameError };
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
      data: { username, display_name: displayName },
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
    // writes the same follow, and a later login does not try again.
    // Test and QA handles are skipped here and in that trigger.
    if (!isTestAccount(username)) {
      await followOfficialUpdates(supabase, data.user.id);
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
): Promise<AuthResult> {
  const text = body.trim().slice(0, COMMENT_LIMIT);
  const photos = draftPostPhotos({ images: images ?? [] });
  if (!text && photos.length === 0) return { error: "Write a comment." };
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
  const row: { post_id: string; user_id: string; body: string; image_urls?: string[] } = {
    post_id: postId,
    user_id: authorId,
    body: text,
  };
  if (uploaded.urls.length) row.image_urls = uploaded.urls;
  const { error } = await supabase.from("comments").insert(row);
  if (error) {
    await discardPostImages(supabase, uploaded.createdPaths);
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
        preview: replyNoticePreview(text, noticeImages),
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

export async function remoteSendMessage(
  supabase: SupabaseClient,
  senderId: string,
  receiverId: string,
  content: string,
  preview?: CardMessagePreview | null,
): Promise<AuthResult> {
  const text = content.trim().slice(0, MESSAGE_LIMIT);
  const cardPreview = preview ? parseCardPreview(preview) : null;
  if (!text && !cardPreview) return { error: "Write a message." };
  const muted = cardPreview ? await senderMuted(supabase, senderId, receiverId) : false;
  const blocked = await supabaseSafety(supabase).isBlocked(senderId, receiverId);
  const refused = offerSendError({
    senderId,
    receiverId,
    blocked,
    muted,
    preview: cardPreview,
  });
  if (refused) return { error: refused };
  const row: Record<string, unknown> = {
    sender_id: senderId,
    receiver_id: receiverId,
    content: text,
  };
  if (cardPreview) {
    row.kind = "card_preview";
    row.card_preview = { cardId: cardPreview.cardId };
  }
  const { error } = await supabase.from("messages").insert(row);
  if (error) {
    if (missingTable(error)) return { error: SETUP_FAILED };
    if (cardPreview && offersColumnMissing(error)) {
      return { error: "Card previews aren't available yet." };
    }
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }
  return {};
}

async function senderMuted(
  supabase: SupabaseClient,
  senderId: string,
  receiverId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("mutes")
    .select("muted_id")
    .eq("muter_id", senderId)
    .eq("muted_id", receiverId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function remoteMarkThreadRead(
  supabase: SupabaseClient,
  userId: string,
  partnerId: string,
): Promise<AuthResult> {
  const { error } = await supabase
    .from("messages")
    .update({ read: true })
    .eq("receiver_id", userId)
    .eq("sender_id", partnerId)
    .eq("read", false);
  if (error && !missingTable(error)) return { error: error.message };
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

export async function remoteCreatePost(
  supabase: SupabaseClient,
  authorId: string,
  input: PostWrite,
): Promise<AuthResult & { postId?: string }> {
  const body = input.body.trim();
  const photos = draftPostPhotos(input);
  const quotedPostId = input.quotedPostId?.trim() || null;
  if (quotedPostId) {
    const quoteError = validateQuoteContent({
      body,
      imageDataUrl: photos[0] ?? null,
      card: input.card,
    });
    if (quoteError) return { error: quoteError };
  } else if (!body && photos.length === 0 && !input.card) {
    return { error: "Write something, add a photo, or attach a card." };
  }
  if (body.length > 280) return { error: "Keep it to 280 characters." };

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
  const card = await storedCard(supabase, authorId, input.card);
  if (card.error) {
    await discardPostImages(supabase, uploaded.createdPaths);
    return { error: card.error };
  }
  const base = {
    user_id: authorId,
    content: body,
    image_url: uploaded.urls[0] ?? null,
    card: card.card,
    quoted_post_id: quotedPostId,
  };
  const meta = metaWithImages(null, uploaded.urls);
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
    await discardPostImages(supabase, uploaded.createdPaths);
    if (card.createdPath) await removeUploadedMedia(supabase, "card-photos", card.createdPath);
    return {
      error: rlsBlocked(error) ? BLOCKED_INTERACTION : (error?.message ?? "Could not save that post."),
    };
  }

  // Adding a card already alerts once. Skip the post alert for that share.
  if (input.card && !input.shareOfNewCard) postWantAlerts.ping("post", created.id);

  // Quote notifications are created by a DB trigger on posts insert.
  // Mentions stay client-side so edit/sync can add/remove them.
  const mentionProblem = await syncMentionNotifications(supabase, authorId, created.id, body);
  if (mentionProblem) return { notice: mentionProblem, postId: created.id };
  return { postId: created.id };
}

export async function remoteUpdatePost(
  supabase: SupabaseClient,
  authorId: string,
  postId: string,
  input: { body: string; imageDataUrl: string | null; images?: readonly string[] | null },
): Promise<AuthResult> {
  const body = input.body.trim();
  if (body.length > 280) return { error: "Keep it to 280 characters." };
  const photos = draftPostPhotos(input);
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
  const base = { content: body, image_url: uploaded.urls[0] ?? null };
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

export async function remoteDeletePost(supabase: SupabaseClient, authorId: string, postId: string) {
  const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", authorId);
  if (error) return { error: error.message };
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
  const removed = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", authorId)
    .select("id, post_id, body, image_urls");
  let data = removed.data;
  let error = removed.error;
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
  const deleted = data[0] as {
    id: string;
    post_id?: string | null;
    body?: string | null;
    image_urls?: unknown;
  };
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
): Promise<{ card: PublicCard | null; error?: string; createdPath?: string }> {
  if (!card) return { card: null };
  const photo = await uploadMedia(supabase, "card-photos", userId, card.photoDataUrl);
  if (photo.error) return { card: null, error: photo.error };
  return { card: { ...card, photoDataUrl: photo.url }, createdPath: photo.createdPath };
}
