import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadMedia } from "@/lib/supabase/media";
import { mapPublicCard } from "./cards";
import type {
  AuthResult,
  FollowEdge,
  DirectMessage,
  Notification,
  NotificationKind,
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
import { mentionUsernames, type MentionCandidate } from "./mentions";
import { normalizeUsername, usernameError } from "./local-db";

/** Public columns only — used by @mention autocomplete. */
const MENTION_PROFILE_SELECT = "id, username, display_name, avatar_url, accent";

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
  created_at: string;
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
  actor_id: string;
  kind: NotificationKind;
  post_id: string | null;
  preview: string | null;
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

function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.user_id,
    body: row.content ?? "",
    imageDataUrl: row.image_url,
    card: row.card,
    createdAt: row.created_at,
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

export async function loadSupabaseSocial(supabase: SupabaseClient): Promise<SocialSnapshot> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const [profilesRes, postsRes, followsRes, cardsRes, commentsRes, notificationsRes, messagesRes, repostsRes] =
    await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("follows").select("*"),
      supabase.from("public_cards").select("*"),
      supabase.from("comments").select("*").order("created_at", { ascending: true }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      supabase.from("messages").select("*").order("created_at", { ascending: true }),
      supabase.from("reposts").select("*").order("created_at", { ascending: false }),
    ]);
  const failure = profilesRes.error || postsRes.error || followsRes.error || cardsRes.error;
  if (failure) throw new Error(failure.message);
  if (commentsRes.error && !missingTable(commentsRes.error)) throw new Error(commentsRes.error.message);
  if (notificationsRes.error && !missingTable(notificationsRes.error)) {
    throw new Error(notificationsRes.error.message);
  }
  if (messagesRes.error && !missingTable(messagesRes.error)) throw new Error(messagesRes.error.message);
  if (repostsRes.error && !missingTable(repostsRes.error)) throw new Error(repostsRes.error.message);

  const profiles = ((profilesRes.data ?? []) as ProfileRow[]).map((row) =>
    mapProfile(row, row.id === session?.user.id ? (session.user.email ?? "") : ""),
  );
  const posts = ((postsRes.data ?? []) as PostRow[]).map(mapPost);
  const reposts = ((repostsRes.data ?? []) as RepostRow[]).map(
    (row): PostRepost => ({
      postId: row.post_id,
      userId: row.user_id,
      createdAt: row.created_at,
    }),
  );
  const knownPostIds = new Set(posts.map((post) => post.id));
  const missingPostIds = [...new Set(reposts.map((repost) => repost.postId))].filter(
    (id) => !knownPostIds.has(id),
  );
  if (missingPostIds.length > 0) {
    const extra = await supabase.from("posts").select("*").in("id", missingPostIds);
    if (extra.error && !missingTable(extra.error)) throw new Error(extra.error.message);
    for (const row of (extra.data ?? []) as PostRow[]) posts.push(mapPost(row));
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
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { username, display_name: displayName } },
  });
  if (error) return { error: error.message };
  if (data.session && data.user) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      username,
      display_name: displayName,
      bio: "",
      avatar_url: null,
      cover_url: null,
      accent: "#7c5cff",
    });
    if (profileError) return { error: profileError.message };
  }
  if (!data.session) {
    return { notice: "Check your email to confirm the account, then log in." };
  }
  return {};
}

export async function remoteSignIn(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };
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
  const { error } = await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: followingId,
  });
  if (error) return { error: error.message };
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
    return { error: error.message };
  }

  if (!input.authorId || input.authorId === input.userId) return {};
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
  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    user_id: authorId,
    body: text,
  });
  if (error) {
    if (missingTable(error)) {
      return { error: "Comments are not set up yet. Run supabase/schema.sql in the Supabase SQL editor." };
    }
    return { error: error.message };
  }

  let recipientId = postAuthorId;
  if (!recipientId) {
    const { data } = await supabase.from("posts").select("user_id").eq("id", postId).maybeSingle();
    recipientId = (data?.user_id as string | undefined) ?? null;
  }
  if (!recipientId || recipientId === authorId) return {};

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
  const { error } = await supabase.from("messages").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content: text,
  });
  if (error) {
    if (missingTable(error)) {
      return { error: "Messages are not set up yet. Run supabase/schema.sql in the Supabase SQL editor." };
    }
    return { error: error.message };
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
  input: { body: string; imageDataUrl: string | null; card: PublicCard | null },
): Promise<AuthResult> {
  const body = input.body.trim();
  if (!body && !input.imageDataUrl && !input.card) {
    return { error: "Write something, add a photo, or attach a card." };
  }
  if (body.length > 280) return { error: "Keep it to 280 characters." };
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
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Could not save that post." };
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

async function syncMentionNotifications(
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
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username")
      .or(handles.map((name) => `username.ilike.${name}`).join(","));
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

  const add = recipientIds.filter((id) => !already.has(id));
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
 * Search all public profiles for @mention autocomplete.
 * Only selects public columns; query is sanitized to [a-z0-9_].
 */
export async function searchProfilesForMention(
  supabase: SupabaseClient,
  query: string,
  limit = 24,
): Promise<MentionCandidate[]> {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  let req = supabase
    .from("profiles")
    .select(MENTION_PROFILE_SELECT)
    .order("username", { ascending: true })
    .limit(limit);
  if (q) {
    req = req.or(
      `username.ilike.${q}%,username.ilike.%${q}%,display_name.ilike.${q}%,display_name.ilike.%${q}%`,
    );
  }
  const { data, error } = await req;
  if (error || !data) return [];
  return (data as ProfileRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarDataUrl: row.avatar_url,
    accent: row.accent ?? "#7c5cff",
  }));
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
