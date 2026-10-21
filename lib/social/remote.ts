import type { SupabaseClient } from "@supabase/supabase-js";
import { captchaRetryMessage } from "@/lib/auth/captcha";
import { emailConfirmRedirect } from "@/lib/auth/safe-next";
import { uploadMedia } from "@/lib/supabase/media";
import { sanitizeAttachedCard } from "./card-posts";
import { loadMailDayViews } from "./mail-day";
import { mapPublicCard } from "./cards";
import type {
  AuthResult,
  FollowEdge,
  DirectMessage,
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
import { mentionIlikeOr, mentionUsernames, type MentionCandidate } from "./mentions";
import { normalizeUsername, usernameError } from "./local-db";
import { ilikeExact, TAKEN_USERNAME, usernameTakenMessage } from "./username-taken";
import { validateQuoteContent } from "./quotes";
import { pingWantMatch } from "@/lib/wants/ping";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { canNotify, supabaseSafety } from "@/lib/safety/can-notify";
import { applyAuthorSafety, loadHiddenAuthorIds, withAuthorSafety } from "@/lib/safety/filters";

/** Public columns only — used by @mention autocomplete. */
const MENTION_PROFILE_SELECT = "id, username, display_name, avatar_url";

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

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  card: PublicCard | null;
  quoted_post_id?: string | null;
  created_at: string;
  post_type?: string | null;
  show_paid?: boolean | null;
  meta?: unknown;
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
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  kind: NotificationKind;
  post_id: string | null;
  preview: string | null;
  href?: string | null;
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

  let messagesQuery = supabase.from("messages").select("*").order("created_at", { ascending: true });
  messagesQuery = guard(messagesQuery, blockedHidden, { authorColumn: "sender_id" });
  messagesQuery = guard(messagesQuery, blockedHidden, { authorColumn: "receiver_id" });

  const [profilesRes, postsRes, homePostsRes, followsRes, cardsRes, commentsRes, notificationsRes, messagesRes, repostsRes, homeRepostsRes, myBlocksRes, myMutesRes] =
    await Promise.all([
      guard(supabase.from("profiles").select("*"), blockedHidden, { authorColumn: "id" }),
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
      guard(
        supabase.from("notifications").select("*").order("created_at", { ascending: false }),
        mutedHidden,
        { authorColumn: "actor_id", mute: true, keepNullAuthor: true },
      ),
      messagesQuery,
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
  const posts = await mapPostRows(supabase, (postsRes.data ?? []) as PostRow[], viewerId);
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
  const comments = ((commentsRes.data ?? []) as CommentRow[]).map(
    (row): PostComment => ({
      id: row.id,
      postId: row.post_id,
      authorId: row.user_id,
      body: row.body,
      createdAt: row.created_at,
    }),
  );
  const notifications = ((notificationsRes.data ?? []) as NotificationRow[]).map(
    (row): Notification => ({
      id: row.id,
      recipientId: row.recipient_id,
      actorId: row.actor_id,
      kind: row.kind,
      postId: row.post_id,
      preview: row.preview,
      href: row.href ?? null,
      createdAt: row.created_at,
      read: row.read,
    }),
  );
  const messages = ((messagesRes.data ?? []) as MessageRow[]).map(
    (row): DirectMessage => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      content: row.content,
      createdAt: row.created_at,
      read: row.read,
    }),
  );
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
    const extraProfiles = await supabase
      .from("profiles")
      .select("*")
      .in("id", missingSafety);
    if (extraProfiles.error) throw new Error(extraProfiles.error.message);
    safetyAccounts = [
      ...safetyAccounts,
      ...((extraProfiles.data ?? []) as ProfileRow[]).map((row) => mapProfile(row)),
    ];
  }

  return {
    user: profiles.find((profile) => profile.id === session?.user.id) ?? null,
    profiles,
    posts,
    follows,
    likes: [],
    reposts,
    comments,
    notifications,
    messages,
    publicCards,
    homePosts,
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
  if (error) return { error: captchaRetryMessage(error) ?? error.message };
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
  const nameError = usernameError(username);
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
        return { error: "Reposts are not set up yet. Run supabase/schema.sql in the Supabase SQL editor." };
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
      return { error: "Reposts are not set up yet. Run supabase/schema.sql in the Supabase SQL editor." };
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
): Promise<AuthResult> {
  const text = body.trim().slice(0, COMMENT_LIMIT);
  if (!text) return { error: "Write a comment." };
  if (
    postAuthorId &&
    postAuthorId !== authorId &&
    (await supabaseSafety(supabase).isBlocked(authorId, postAuthorId))
  ) {
    return { error: BLOCKED_INTERACTION };
  }
  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    user_id: authorId,
    body: text,
  });
  if (error) {
    if (missingTable(error)) {
      return { error: "Comments are not set up yet. Run supabase/schema.sql in the Supabase SQL editor." };
    }
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }

  let recipientId = postAuthorId;
  if (!recipientId) {
    const { data } = await supabase.from("posts").select("user_id").eq("id", postId).maybeSingle();
    recipientId = (data?.user_id as string | undefined) ?? null;
  }
  if (!recipientId || recipientId === authorId) return {};
  if (!(await allowNotice(supabase, authorId, recipientId))) return {};

  const { error: noteError } = await supabase.from("notifications").insert({
    recipient_id: recipientId,
    actor_id: authorId,
    kind: "comment",
    post_id: postId,
    preview: previewText(text),
  });
  if (noteError && !missingTable(noteError)) return { notice: noteError.message };
  return {};
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
  if (!(await allowNotice(supabase, input.actorId, input.recipientId))) return {};
  const { error } = await supabase.from("notifications").insert({
    recipient_id: input.recipientId,
    actor_id: input.actorId,
    kind: "like",
    post_id: input.postId,
    preview: previewText(input.preview),
  });
  if (error && error.code !== "23505" && !missingTable(error)) return { error: error.message };
  return {};
}

export async function remoteSendMessage(
  supabase: SupabaseClient,
  senderId: string,
  receiverId: string,
  content: string,
): Promise<AuthResult> {
  const text = content.trim().slice(0, MESSAGE_LIMIT);
  if (!text) return { error: "Write a message." };
  if (senderId === receiverId) return { error: "You can't message yourself." };
  if (await supabaseSafety(supabase).isBlocked(senderId, receiverId)) {
    return { error: BLOCKED_INTERACTION };
  }
  const { error } = await supabase.from("messages").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content: text,
  });
  if (error) {
    if (missingTable(error)) {
      return { error: "Messages are not set up yet. Run supabase/schema.sql in the Supabase SQL editor." };
    }
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }
  return {};
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
): Promise<AuthResult> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", userId)
    .eq("read", false);
  if (error && !missingTable(error)) return { error: error.message };
  return {};
}

export async function remoteCreatePost(
  supabase: SupabaseClient,
  authorId: string,
  input: {
    body: string;
    imageDataUrl: string | null;
    card: PublicCard | null;
    quotedPostId?: string | null;
  },
): Promise<AuthResult> {
  const body = input.body.trim();
  const quotedPostId = input.quotedPostId?.trim() || null;
  if (quotedPostId) {
    const quoteError = validateQuoteContent({
      body,
      imageDataUrl: input.imageDataUrl,
      card: input.card,
    });
    if (quoteError) return { error: quoteError };
  } else if (!body && !input.imageDataUrl && !input.card) {
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

  const image = await uploadMedia(supabase, "post-images", authorId, input.imageDataUrl);
  if (image.error) return { error: image.error };
  const card = await storedCard(supabase, authorId, input.card);
  if (card.error) return { error: card.error };
  const { data: created, error } = await supabase
    .from("posts")
    .insert({
      user_id: authorId,
      content: body,
      image_url: image.url,
      card: card.card,
      quoted_post_id: quotedPostId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return {
      error: rlsBlocked(error) ? BLOCKED_INTERACTION : (error?.message ?? "Could not save that post."),
    };
  }

  if (input.card) pingWantMatch("post", created.id);

  // Quote notifications are created by a DB trigger on posts insert.
  // Mentions stay client-side so edit/sync can add/remove them.
  const mentionProblem = await syncMentionNotifications(supabase, authorId, created.id, body);
  if (mentionProblem) return { notice: mentionProblem };
  return {};
}

export async function remoteUpdatePost(
  supabase: SupabaseClient,
  authorId: string,
  postId: string,
  input: { body: string; imageDataUrl: string | null },
): Promise<AuthResult> {
  const body = input.body.trim();
  if (body.length > 280) return { error: "Keep it to 280 characters." };
  const image = await uploadMedia(supabase, "post-images", authorId, input.imageDataUrl);
  if (image.error) return { error: image.error };
  const { error } = await supabase
    .from("posts")
    .update({ content: body, image_url: image.url })
    .eq("id", postId)
    .eq("user_id", authorId);
  if (error) return { error: error.message };
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
  const handles = mentionUsernames(body);
  const existing = await supabase
    .from("notifications")
    .select("recipient_id")
    .eq("actor_id", actorId)
    .eq("post_id", postId)
    .eq("kind", "mention");
  if (existing.error) {
    if (missingTable(existing.error)) return null;
    return existing.error.message;
  }

  const already = new Set((existing.data ?? []).map((row) => row.recipient_id as string));
  let recipientIds: string[] = [];
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
    const wanted = new Set(handles);
    recipientIds = ((data ?? []) as { id: string; username: string }[])
      .filter((row) => row.id !== actorId && wanted.has(row.username.toLowerCase()))
      .map((row) => row.id);
  }

  const next = new Set(recipientIds);
  const remove = [...already].filter((id) => !next.has(id));
  if (remove.length > 0) {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("actor_id", actorId)
      .eq("post_id", postId)
      .eq("kind", "mention")
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
  if (error.code === "23514" || /notifications_kind/i.test(error.message ?? "")) {
    return "Your post was saved. Re-run supabase/schema.sql so mention notifications can be delivered.";
  }
  return error.message;
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

export async function remoteDeletePost(supabase: SupabaseClient, authorId: string, postId: string) {
  const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", authorId);
  if (error) return { error: error.message };
  return {};
}

async function storedCard(
  supabase: SupabaseClient,
  userId: string,
  card: PublicCard | null,
): Promise<{ card: PublicCard | null; error?: string }> {
  if (!card) return { card: null };
  const photo = await uploadMedia(supabase, "card-photos", userId, card.photoDataUrl);
  if (photo.error) return { card: null, error: photo.error };
  return { card: { ...card, photoDataUrl: photo.url } };
}
