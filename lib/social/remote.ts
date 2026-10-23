import type { SupabaseClient } from "@supabase/supabase-js";
import { captchaRetryMessage } from "@/lib/auth/captcha";
import { emailConfirmRedirect } from "@/lib/auth/safe-next";
import { EMAIL_NOT_CONFIRMED, isEmailNotConfirmed } from "@/lib/auth/signup-fields";
import { removeUploadedMedia, uploadMedia } from "@/lib/supabase/media";
import {
  loadMessageRows,
  offerSendError,
  offersColumnMissing,
  parseCardPreview,
} from "@/lib/offers/open-to-offers";
import { olderThanCursor, pageAfter, type PageCursor } from "./page-cursor";
import { loadViewerShell, mapMessageRows } from "./scoped-reads";
import type {
  AuthResult,
  CardMessagePreview,
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
import { isTestAccount } from "../test-accounts";
import { ilikeExact, TAKEN_USERNAME, usernameTakenMessage } from "./username-taken";
import { validateQuoteContent } from "./quotes";
import { pingWantMatch } from "@/lib/wants/ping";
import {
  draftPostPhotos,
  metaColumnMissing,
  metaWithImages,
  noteMultiPhotoMissing,
  type PostWrite,
} from "./post-photos";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { canNotify, supabaseSafety } from "@/lib/safety/can-notify";
import { applyAuthorSafety, loadHiddenAuthorIds, withAuthorSafety } from "@/lib/safety/filters";

/** Swappable so a shared-card post can be tested without hitting the network. */
export const postWantAlerts = {
  ping: pingWantMatch,
};

/** Public columns only — used by @mention autocomplete. */
const MENTION_PROFILE_SELECT = "id, username, display_name, avatar_url";

/** One DM page. Older rows stay reachable through the created_at + id cursor. */
export const MESSAGE_PAGE_SIZE = 80;

export type MessagePage = {
  messages: ReturnType<typeof mapMessageRows>;
  hasMore: boolean;
  cursor: PageCursor | null;
  error: string | null;
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

function messagePageFrom(result: {
  data: unknown;
  error: { code?: string; message?: string } | null;
}): MessagePage {
  if (result.error) {
    if (missingTable(result.error)) return { messages: [], hasMore: false, cursor: null, error: null };
    return {
      messages: [],
      hasMore: false,
      cursor: null,
      error: result.error.message ?? "Could not load messages.",
    };
  }
  const rows = (Array.isArray(result.data) ? result.data : []) as Parameters<typeof mapMessageRows>[0][number][];
  const tail = pageAfter(rows, MESSAGE_PAGE_SIZE);
  return { messages: mapMessageRows(rows), hasMore: tail.hasMore, cursor: tail.cursor, error: null };
}

async function loadMessagePage(
  supabase: SupabaseClient,
  viewerId: string,
  filter: string,
  cursor: PageCursor | null,
) {
  const hidden = await loadHiddenAuthorIds(supabase, false);
  const older = cursor ? olderThanCursor(cursor) : null;
  return loadMessageRows((columns) => {
    let query = supabase
      .from("messages")
      .select(columns)
      .or(filter)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (older) query = query.or(older);
    query = applyAuthorSafety(query, viewerId, hidden, { authorColumn: "sender_id" });
    query = applyAuthorSafety(query, viewerId, hidden, { authorColumn: "receiver_id" });
    return query;
  });
}

export async function loadRecentMessages(
  supabase: SupabaseClient,
  viewerId: string,
  cursor?: PageCursor | null,
) {
  return loadMessagePage(
    supabase,
    viewerId,
    `sender_id.eq.${viewerId},receiver_id.eq.${viewerId}`,
    cursor ?? null,
  );
}

/** Newest messages with anyone, for the inbox. */
export async function loadInboxPage(
  supabase: SupabaseClient,
  viewerId: string,
  cursor: PageCursor | null,
): Promise<MessagePage> {
  return messagePageFrom(await loadRecentMessages(supabase, viewerId, cursor));
}

/** One page of a single conversation, newest first. */
export async function loadThreadPage(
  supabase: SupabaseClient,
  viewerId: string,
  partnerId: string,
  cursor: PageCursor | null,
): Promise<MessagePage> {
  const pair = `and(sender_id.eq.${viewerId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${viewerId})`;
  return messagePageFrom(await loadMessagePage(supabase, viewerId, pair, cursor));
}

/** Viewer shell only. Page data is loaded by the screen that shows it. */
export async function loadSupabaseSocial(supabase: SupabaseClient): Promise<SocialSnapshot> {
  return loadViewerShell(supabase);
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
): Promise<AuthResult & { commentId?: string }> {
  const text = body.trim().slice(0, COMMENT_LIMIT);
  if (!text) return { error: "Write a comment." };
  if (
    postAuthorId &&
    postAuthorId !== authorId &&
    (await supabaseSafety(supabase).isBlocked(authorId, postAuthorId))
  ) {
    return { error: BLOCKED_INTERACTION };
  }
  const inserted = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      user_id: authorId,
      body: text,
    })
    .select("id")
    .maybeSingle();
  const error = inserted.error;
  const commentId = typeof inserted.data?.id === "string" ? inserted.data.id : undefined;
  if (error) {
    if (missingTable(error)) {
      return { error: SETUP_FAILED };
    }
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }

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
        preview: previewText(text),
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
  return notice ? { notice, commentId } : { commentId };
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
  preview?: CardMessagePreview | null,
): Promise<AuthResult & { messageId?: string }> {
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
  const inserted = await supabase.from("messages").insert(row).select("id").maybeSingle();
  const error = inserted.error;
  if (error) {
    if (missingTable(error)) return { error: SETUP_FAILED };
    if (cardPreview && offersColumnMissing(error)) {
      return { error: "Card previews aren't available yet." };
    }
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }
  const messageId = typeof inserted.data?.id === "string" ? inserted.data.id : undefined;
  return { messageId };
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
  return (data as { id: string; username: string; display_name: string; avatar_url: string | null }[]).map(
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
 * Notifications have no comment id. After the reply is gone, drop only the
 * deleter's own comment notice and reply-mention notices (metadata.source =
 * reply) on that post whose preview is this reply.
 *
 * "Delete notifications you sent" (auth.uid() = actor_id) already allows this.
 * Migrations never drop it. A rejected cleanup, including RLS, is ignored so
 * the reply stays deleted.
 */
async function deleteOwnReplyPreviewNotifications(
  supabase: SupabaseClient,
  actorId: string,
  postId: string,
  body: string,
) {
  const preview = previewText(body);
  if (!preview) return;
  const run = async (query: PromiseLike<unknown>) => {
    try {
      await query;
    } catch {
      // The reply is already deleted.
    }
  };
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
  const { data, error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", authorId)
    .select("id, post_id, body");
  if (error) {
    return {
      error: rlsBlocked(error) ? "You can only delete your own replies." : error.message,
    };
  }
  // PostgREST returns zero rows, not an error, when RLS hides the delete.
  if (!Array.isArray(data) || data.length === 0) {
    return { error: "Could not delete that reply." };
  }
  const deleted = data[0] as { id: string; post_id?: string | null; body?: string | null };
  if (deleted.post_id) {
    await deleteOwnReplyPreviewNotifications(
      supabase,
      authorId,
      deleted.post_id,
      deleted.body ?? "",
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
