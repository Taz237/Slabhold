import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadMedia } from "@/lib/supabase/media";
import { mapPublicCard } from "./cards";
import type {
  AuthResult,
  FollowEdge,
  Post,
  Profile,
  ProfilePatch,
  PublicCard,
  SignUpInput,
  SocialSnapshot,
} from "./types";
import { normalizeUsername, usernameError } from "./local-db";

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

type PublicCardRow = {
  id: string;
  user_id: string;
  player: string;
  year: number;
  set: string;
  grade: string | null;
  parallel: string | null;
  paid_price: number | null;
  estimated_value: number | null;
  image_url: string | null;
  card_number: string | null;
  sport: string | null;
  purchase_date: string | null;
  sell_price: number | null;
  sell_date: string | null;
  notes: string | null;
  accent: string | null;
  is_public: boolean | null;
  created_at: string;
  updated_at: string | null;
};

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
  const [profilesRes, postsRes, followsRes, cardsRes] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("follows").select("*"),
    supabase.from("cards").select("*").eq("is_public", true),
  ]);
  const failure = profilesRes.error || postsRes.error || followsRes.error || cardsRes.error;
  if (failure) throw new Error(failure.message);

  const profiles = ((profilesRes.data ?? []) as ProfileRow[]).map((row) =>
    mapProfile(row, row.id === session?.user.id ? (session.user.email ?? "") : ""),
  );
  const posts = ((postsRes.data ?? []) as PostRow[]).map(
    (row): Post => ({
      id: row.id,
      authorId: row.user_id,
      body: row.content ?? "",
      imageDataUrl: row.image_url,
      card: row.card,
      createdAt: row.created_at,
    }),
  );
  const follows = ((followsRes.data ?? []) as FollowRow[]).map(
    (row): FollowEdge => ({
      followerId: row.follower_id,
      followingId: row.following_id,
      createdAt: row.created_at,
    }),
  );
  const publicCards = ((cardsRes.data ?? []) as PublicCardRow[]).map(mapPublicCard);

  return {
    user: profiles.find((profile) => profile.id === session?.user.id) ?? null,
    profiles,
    posts,
    follows,
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
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
) {
  if (following) {
    await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    return;
  }
  await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: followingId,
  });
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
  const { error } = await supabase.from("posts").insert({
    user_id: authorId,
    content: body,
    image_url: image.url,
    card: card.card,
  });
  if (error) return { error: error.message };
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
  return {};
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
