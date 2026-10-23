import { offerSendError, parseCardPreview } from "@/lib/offers/open-to-offers";
import type {
  CardMessagePreview,
  DirectMessage,
  FollowEdge,
  Notification,
  Post,
  PostComment,
  PostLike,
  PostRepost,
  Profile,
  ProfilePatch,
  PublicCard,
  SignUpInput,
  SocialSnapshot,
} from "./types";
import {
  isReplyMentionMetadata,
  mentionsToNotify,
  REPLY_MENTION_METADATA,
  replyMentionCandidates,
} from "./reply-mentions";
import { draftPostPhotos } from "./post-photos";
import { decidePin, pinnedPostIdAfterDelete } from "./profile-tabs";
import { replyNoticePreview } from "./reply-images";
import { shouldNotifyQuoteAuthor, validateQuoteContent } from "./quotes";
import { COMMENT_LIMIT, MESSAGE_LIMIT } from "./types";
import { isOfficialUpdatesAccount } from "./official-updates";

const STORAGE_KEY = "cardflip.social.v1";

type StoredUser = Profile & { passwordHash: string };

export type LocalDb = {
  users: StoredUser[];
  sessionUserId: string | null;
  follows: FollowEdge[];
  posts: Post[];
  likes: PostLike[];
  reposts: PostRepost[];
  comments: PostComment[];
  notifications: Notification[];
  messages: DirectMessage[];
  collections: Record<string, PublicCard[]>;
};

const USERNAME = /^[a-z0-9_]{3,20}$/;

/**
 * Handles a new account cannot claim. Keep this list identical to the
 * reserved array in supabase/migrations/20261022223000_reserve_profile_usernames.sql.
 */
export const RESERVED_USERNAMES = [
  "grokbotreview",
  "slabholdupdates",
  "slabhold",
  "slabholdapp",
  "slabhold_updates",
  "slabholdteam",
  "slabholdsupport",
  "slabholdofficial",
  "admin",
  "administrator",
  "support",
  "help",
  "moderator",
  "mod",
  "official",
  "staff",
  "team",
] as const;

/** Stems that also reserve lookalikes such as slabholdupdates1 and grokbotreview_. */
export const UPDATES_HANDLE_STEMS = ["grokbotreview", "slabholdupdates"] as const;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

/** Lowercase handle with `_`, `.`, `-`, and trailing digits removed. */
export function reservedHandleStem(value: string) {
  return normalizeUsername(value).replace(/[_.-]/g, "").replace(/\d+$/, "");
}

export function isUpdatesHandleVariant(value: string) {
  return (UPDATES_HANDLE_STEMS as readonly string[]).includes(reservedHandleStem(value));
}

export function isReservedUsername(value: string) {
  const handle = normalizeUsername(value);
  if ((RESERVED_USERNAMES as readonly string[]).includes(handle)) return true;
  return isUpdatesHandleVariant(value);
}

export function usernameError(value: string) {
  if (!USERNAME.test(value)) {
    return "Usernames are 3–20 characters: letters, numbers, underscores.";
  }
  if (isReservedUsername(value)) return "That username is taken.";
  return null;
}

/** Existing holders may keep a reserved name. Only the updates id may newly take a variant. */
export function usernameChangeError(next: string, userId?: string | null, current?: string | null) {
  const error = usernameError(next);
  if (!error || !isReservedUsername(next)) return error;
  if (normalizeUsername(current ?? "") === normalizeUsername(next)) return null;
  if (isOfficialUpdatesAccount(userId) && isUpdatesHandleVariant(next)) return null;
  return error;
}

async function hashPassword(password: string) {
  const data = new TextEncoder().encode(`cardflip.v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function previewText(value: string) {
  const text = value.trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export function notificationsFromActivity(db: LocalDb): Notification[] {
  const notes: Notification[] = [];
  for (const like of db.likes ?? []) {
    const post = db.posts.find((item) => item.id === like.postId);
    if (!post || post.authorId === like.userId) continue;
    notes.push({
      id: `note-like-${like.postId}-${like.userId}`,
      recipientId: post.authorId,
      actorId: like.userId,
      kind: "like",
      postId: post.id,
      preview: previewText(post.body),
      createdAt: like.createdAt,
      read: false,
    });
  }
  for (const comment of db.comments ?? []) {
    const post = db.posts.find((item) => item.id === comment.postId);
    if (!post || post.authorId === comment.authorId) continue;
    notes.push({
      id: `note-comment-${comment.id}`,
      recipientId: post.authorId,
      actorId: comment.authorId,
      kind: "comment",
      postId: post.id,
      preview: replyNoticePreview(comment.body, comment.images),
      ...(comment.images?.length ? { metadata: { images: [...comment.images] } } : {}),
      createdAt: comment.createdAt,
      read: false,
    });
  }
  for (const repost of db.reposts ?? []) {
    const post = db.posts.find((item) => item.id === repost.postId);
    if (!post || post.authorId === repost.userId) continue;
    notes.push({
      id: `note-repost-${repost.postId}-${repost.userId}`,
      recipientId: post.authorId,
      actorId: repost.userId,
      kind: "repost",
      postId: post.id,
      preview: previewText(post.body),
      createdAt: repost.createdAt,
      read: false,
    });
  }
  for (const edge of db.follows) {
    if (edge.followerId === edge.followingId) continue;
    notes.push({
      id: `note-follow-${edge.followerId}-${edge.followingId}`,
      recipientId: edge.followingId,
      actorId: edge.followerId,
      kind: "follow",
      postId: null,
      preview: null,
      createdAt: edge.createdAt,
      read: false,
    });
  }
  return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function addNotification(
  db: LocalDb,
  note: Omit<Notification, "id" | "read">,
): Notification[] {
  if (note.actorId === note.recipientId) return db.notifications ?? [];
  return [
    {
      ...note,
      id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      read: false,
    },
    ...(db.notifications ?? []),
  ];
}

function toProfile(user: StoredUser): Profile {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarDataUrl: user.avatarDataUrl ?? null,
    coverDataUrl: user.coverDataUrl ?? null,
    accent: user.accent,
    createdAt: user.createdAt,
    pinnedPostId: user.pinnedPostId ?? null,
  };
}

export function snapshotFromLocal(db: LocalDb): SocialSnapshot {
  const session = db.users.find((user) => user.id === db.sessionUserId) ?? null;
  const publicCards = Object.entries(db.collections).flatMap(([ownerId, cards]) =>
    cards.map((card) => ({ ...card, ownerId })),
  );
  return {
    user: session ? toProfile(session) : null,
    profiles: db.users.map(toProfile),
    posts: [...db.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    follows: db.follows,
    likes: db.likes ?? [],
    reposts: db.reposts ?? [],
    comments: db.comments ?? [],
    notifications: db.notifications ?? [],
    messages: db.messages ?? [],
    publicCards,
  };
}

async function createSeed(): Promise<LocalDb> {
  const passwordHash = await hashPassword("demo1234");
  const maya: StoredUser = {
    id: "user-maya",
    email: "maya@cardflip.app",
    username: "waxroom",
    displayName: "Maya Chen",
    bio: "Chasing rookies and clean flips.",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt: hoursAgo(24 * 40),
    passwordHash,
  };
  const jordan: StoredUser = {
    id: "user-jordan",
    email: "jordan@cardflip.app",
    username: "flipcity",
    displayName: "Jordan Hale",
    bio: "Buy the dip. Sell the hype.",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#f43f5e",
    createdAt: hoursAgo(24 * 30),
    passwordHash,
  };
  const sam: StoredUser = {
    id: "user-sam",
    email: "sam@cardflip.app",
    username: "boxbreak",
    displayName: "Sam Ortiz",
    bio: "WNBA and baseball. That's the book.",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#fbbf24",
    createdAt: hoursAgo(24 * 20),
    passwordHash,
  };

  const wemby: PublicCard = {
    id: "maya-wemby",
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 185,
    grade: "PSA 10",
    parallel: "Silver",
    purchasePrice: 140,
  };
  const mahomes: PublicCard = {
    id: "jordan-mahomes",
    playerName: "Patrick Mahomes",
    year: 2017,
    setBrand: "Panini Prizm",
    cardNumber: "269",
    sport: "Football",
    photoDataUrl: null,
    accent: "#f43f5e",
    estimatedSellPrice: 255,
    grade: "PSA 9",
    parallel: "Base",
    purchasePrice: 180,
  };
  /** Same card as Maya's Wemby, different grade — powers the Owned by demo. */
  const jordanWemby: PublicCard = {
    id: "jordan-wemby",
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#f43f5e",
    estimatedSellPrice: 160,
    grade: "PSA 9",
    parallel: "Silver",
    purchasePrice: 110,
  };
  const clark: PublicCard = {
    id: "sam-clark",
    playerName: "Caitlin Clark",
    year: 2024,
    setBrand: "Panini Prizm WNBA",
    cardNumber: "101",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#fbbf24",
    estimatedSellPrice: 265,
    grade: "Raw",
    parallel: "Silver",
    purchasePrice: 90,
  };

  const posts: Post[] = [
    {
      id: "post-maya-1",
      authorId: maya.id,
      body: "Raw Wemby Prizm still feels like the hold. Corners are sharp. Waiting on a grading window.",
      imageDataUrl: null,
      card: wemby,
      quotedPostId: null,
      createdAt: hoursAgo(2),
    },
    {
      id: "post-jordan-1",
      authorId: jordan.id,
      body: "Moved a Mahomes Prizm for a small loss. Cash is back in the stack for football.",
      imageDataUrl: null,
      card: mahomes,
      quotedPostId: null,
      createdAt: hoursAgo(5),
    },
    {
      id: "post-sam-1",
      authorId: sam.id,
      body: "Clark Prizm comps are still sticky. Not listing mine.",
      imageDataUrl: null,
      card: clark,
      quotedPostId: null,
      createdAt: hoursAgo(8),
    },
    {
      id: "post-maya-2",
      authorId: maya.id,
      body: "If you're buying rookies this week, buy the card you'd still want if the market went quiet.",
      imageDataUrl: null,
      card: null,
      quotedPostId: null,
      createdAt: hoursAgo(26),
    },
    {
      id: "post-jordan-2",
      authorId: jordan.id,
      body: "Centering is the whole game on modern Prizm. 60/40 is a pass for me now.",
      imageDataUrl: null,
      card: null,
      quotedPostId: null,
      createdAt: hoursAgo(50),
    },
  ];

  const db: LocalDb = {
    users: [maya, jordan, sam],
    sessionUserId: null,
    follows: [
      { followerId: maya.id, followingId: jordan.id, createdAt: hoursAgo(10) },
      { followerId: maya.id, followingId: sam.id, createdAt: hoursAgo(10) },
      { followerId: jordan.id, followingId: maya.id, createdAt: hoursAgo(12) },
      { followerId: sam.id, followingId: maya.id, createdAt: hoursAgo(14) },
      { followerId: sam.id, followingId: jordan.id, createdAt: hoursAgo(14) },
    ],
    posts,
    likes: [
      { postId: "post-maya-1", userId: jordan.id, createdAt: hoursAgo(1) },
    ],
    reposts: [],
    comments: [
      {
        id: "comment-seed-maya-1",
        postId: "post-maya-1",
        authorId: sam.id,
        body: "Corners look clean. I'd hold it too.",
        createdAt: hoursAgo(1.5),
      },
    ],
    notifications: [],
    messages: [],
    collections: {
      [maya.id]: [wemby],
      [jordan.id]: [mahomes, jordanWemby],
      [sam.id]: [clark],
    },
  };
  return { ...db, notifications: notificationsFromActivity(db) };
}

export async function loadOrCreateLocalDb(): Promise<LocalDb> {
  if (typeof window === "undefined") return createSeed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = await createSeed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as LocalDb;
    if (!parsed?.users || !parsed.posts || !parsed.follows) {
      const seeded = await createSeed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    parsed.likes = parsed.likes ?? [];
    parsed.reposts = parsed.reposts ?? [];
    parsed.comments = parsed.comments ?? [];
    parsed.messages = parsed.messages ?? [];
    parsed.posts = parsed.posts.map((post) => ({
      ...post,
      quotedPostId: post.quotedPostId ?? null,
    }));
    if (!Array.isArray(parsed.notifications)) {
      parsed.notifications = notificationsFromActivity(parsed);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return createSeed();
  }
}

export function saveLocalDb(db: LocalDb) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export async function localSignUp(db: LocalDb, input: SignUpInput): Promise<{ db: LocalDb; error?: string }> {
  const email = input.email.trim().toLowerCase();
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim() || username;
  if (!email.includes("@")) return { db, error: "Enter a valid email." };
  if (input.password.length < 6) return { db, error: "Use at least 6 characters." };
  const nameError = usernameError(username);
  if (nameError) return { db, error: nameError };
  if (db.users.some((user) => user.email === email)) return { db, error: "That email is already in use." };
  if (db.users.some((user) => user.username === username)) {
    return { db, error: "That username is taken." };
  }
  const user: StoredUser = {
    id: `user-${Date.now().toString(36)}`,
    email,
    username,
    displayName,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#2dd4bf",
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(input.password),
  };
  return {
    db: {
      ...db,
      users: [...db.users, user],
      sessionUserId: user.id,
      collections: { ...db.collections, [user.id]: [] },
    },
  };
}

export async function localSignIn(
  db: LocalDb,
  email: string,
  password: string,
): Promise<{ db: LocalDb; error?: string }> {
  const match = db.users.find((user) => user.email === email.trim().toLowerCase());
  if (!match) return { db, error: "No account for that email." };
  const passwordHash = await hashPassword(password);
  if (passwordHash !== match.passwordHash) return { db, error: "Wrong password." };
  return { db: { ...db, sessionUserId: match.id } };
}

export function localSignOut(db: LocalDb): LocalDb {
  return { ...db, sessionUserId: null };
}

export function localUpdateProfile(
  db: LocalDb,
  patch: ProfilePatch,
): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "Log in first." };
  const username = normalizeUsername(patch.username);
  const current = db.users.find((user) => user.id === db.sessionUserId);
  const nameError = usernameChangeError(username, db.sessionUserId, current?.username);
  if (nameError) return { db, error: nameError };
  const displayName = patch.displayName.trim();
  if (!displayName) return { db, error: "Add a display name." };
  if (db.users.some((user) => user.username === username && user.id !== db.sessionUserId)) {
    return { db, error: "That username is taken." };
  }
  return {
    db: {
      ...db,
      users: db.users.map((user) =>
        user.id === db.sessionUserId
          ? {
              ...user,
              username,
              displayName,
              bio: patch.bio.trim().slice(0, 160),
              avatarDataUrl: patch.avatarDataUrl,
              coverDataUrl: patch.coverDataUrl,
            }
          : user,
      ),
    },
  };
}

export function localToggleFollow(db: LocalDb, followingId: string): LocalDb {
  if (!db.sessionUserId || db.sessionUserId === followingId) return db;
  const exists = db.follows.some(
    (edge) => edge.followerId === db.sessionUserId && edge.followingId === followingId,
  );
  if (exists) {
    return {
      ...db,
      follows: db.follows.filter(
        (edge) => !(edge.followerId === db.sessionUserId && edge.followingId === followingId),
      ),
      notifications: (db.notifications ?? []).filter(
        (note) =>
          !(
            note.kind === "follow" &&
            note.actorId === db.sessionUserId &&
            note.recipientId === followingId
          ),
      ),
    };
  }
  const createdAt = new Date().toISOString();
  const next: LocalDb = {
    ...db,
    follows: [
      ...db.follows,
      { followerId: db.sessionUserId, followingId, createdAt },
    ],
  };
  return {
    ...next,
    notifications: addNotification(next, {
      recipientId: followingId,
      actorId: db.sessionUserId,
      kind: "follow",
      postId: null,
      preview: null,
      createdAt,
    }),
  };
}

export function localToggleLike(db: LocalDb, postId: string): LocalDb {
  if (!db.sessionUserId) return db;
  const likes = db.likes ?? [];
  const existing = likes.some(
    (like) => like.postId === postId && like.userId === db.sessionUserId,
  );
  const post = db.posts.find((item) => item.id === postId);
  if (existing) {
    return {
      ...db,
      likes: likes.filter((like) => !(like.postId === postId && like.userId === db.sessionUserId)),
      notifications: (db.notifications ?? []).filter(
        (note) =>
          !(note.kind === "like" && note.actorId === db.sessionUserId && note.postId === postId),
      ),
    };
  }
  const createdAt = new Date().toISOString();
  const next: LocalDb = {
    ...db,
    likes: [...likes, { postId, userId: db.sessionUserId, createdAt }],
  };
  if (!post) return next;
  return {
    ...next,
    notifications: addNotification(next, {
      recipientId: post.authorId,
      actorId: db.sessionUserId,
      kind: "like",
      postId,
      preview: previewText(post.body),
      createdAt,
    }),
  };
}

export function localToggleRepost(db: LocalDb, postId: string): LocalDb {
  if (!db.sessionUserId) return db;
  const reposts = db.reposts ?? [];
  const existing = reposts.some(
    (repost) => repost.postId === postId && repost.userId === db.sessionUserId,
  );
  const post = db.posts.find((item) => item.id === postId);
  if (existing) {
    return {
      ...db,
      reposts: reposts.filter(
        (repost) => !(repost.postId === postId && repost.userId === db.sessionUserId),
      ),
      notifications: (db.notifications ?? []).filter(
        (note) =>
          !(note.kind === "repost" && note.actorId === db.sessionUserId && note.postId === postId),
      ),
    };
  }
  const createdAt = new Date().toISOString();
  const next: LocalDb = {
    ...db,
    reposts: [...reposts, { postId, userId: db.sessionUserId, createdAt }],
  };
  if (!post) return next;
  return {
    ...next,
    notifications: addNotification(next, {
      recipientId: post.authorId,
      actorId: db.sessionUserId,
      kind: "repost",
      postId,
      preview: previewText(post.body),
      createdAt,
    }),
  };
}

export function localAddComment(
  db: LocalDb,
  postId: string,
  body: string,
  images?: readonly string[] | null,
): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "Log in to comment." };
  const text = body.trim().slice(0, COMMENT_LIMIT);
  const photos = draftPostPhotos({ images: images ?? [] });
  if (!text && photos.length === 0) return { db, error: "Write a comment." };
  if (!db.posts.some((post) => post.id === postId)) return { db, error: "That post is gone." };
  const comment: PostComment = {
    id: `comment-${Date.now().toString(36)}`,
    postId,
    authorId: db.sessionUserId,
    body: text,
    ...(photos.length ? { images: photos } : {}),
    createdAt: new Date().toISOString(),
  };
  const next: LocalDb = { ...db, comments: [...(db.comments ?? []), comment] };
  const post = db.posts.find((item) => item.id === postId);
  if (!post) return { db: next };
  let notifications = addNotification(next, {
    recipientId: post.authorId,
    actorId: db.sessionUserId,
    kind: "comment",
    postId,
    preview: replyNoticePreview(text, photos),
    ...(photos.length ? { metadata: { images: photos } } : {}),
    createdAt: comment.createdAt,
  });
  const mentioned = replyMentionCandidates({
    actorId: db.sessionUserId,
    body: text,
    profiles: db.users.map((user) => ({ id: user.id, username: user.username })),
    skipRecipientId: post.authorId !== db.sessionUserId ? post.authorId : null,
  });
  for (const recipientId of mentioned) {
    notifications = addNotification(
      { ...next, notifications },
      {
        recipientId,
        actorId: db.sessionUserId,
        kind: "mention",
        postId,
        preview: replyNoticePreview(text, photos),
        metadata: photos.length ? { ...REPLY_MENTION_METADATA, images: photos } : REPLY_MENTION_METADATA,
        createdAt: comment.createdAt,
      },
    );
  }
  return { db: { ...next, notifications } };
}

export function localSendMessage(
  db: LocalDb,
  receiverId: string,
  content: string,
  preview?: CardMessagePreview | null,
): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "Log in to send a message." };
  const text = content.trim().slice(0, MESSAGE_LIMIT);
  const cardPreview = preview ? parseCardPreview(preview) : null;
  const refused = offerSendError({
    senderId: db.sessionUserId,
    receiverId,
    blocked: false,
    muted: false,
    preview: cardPreview,
  });
  if (refused) return { db, error: refused };
  if (!text && !cardPreview) return { db, error: "Write a message." };
  if (!db.users.some((user) => user.id === receiverId)) return { db, error: "That collector is gone." };
  const message: DirectMessage = {
    id: `msg-${Date.now().toString(36)}`,
    senderId: db.sessionUserId,
    receiverId,
    content: text,
    createdAt: new Date().toISOString(),
    read: false,
    kind: cardPreview ? "card_preview" : "text",
    cardPreview: cardPreview ? { cardId: cardPreview.cardId } : null,
  };
  return { db: { ...db, messages: [...(db.messages ?? []), message] } };
}

export function localMarkThreadRead(db: LocalDb, partnerId: string): LocalDb {
  if (!db.sessionUserId) return db;
  return {
    ...db,
    messages: (db.messages ?? []).map((message) =>
      message.senderId === partnerId && message.receiverId === db.sessionUserId
        ? { ...message, read: true }
        : message,
    ),
  };
}

export function localCreatePost(
  db: LocalDb,
  input: {
    body: string;
    imageDataUrl: string | null;
    images?: readonly string[] | null;
    card: PublicCard | null;
    quotedPostId?: string | null;
    shareOfNewCard?: boolean;
  },
): { db: LocalDb; error?: string; postId?: string } {
  if (!db.sessionUserId) return { db, error: "Log in to post." };
  const body = input.body.trim();
  const photos = draftPostPhotos(input);
  const quotedPostId = input.quotedPostId?.trim() || null;
  if (quotedPostId) {
    const quoteError = validateQuoteContent({
      body,
      imageDataUrl: photos[0] ?? null,
      card: input.card,
    });
    if (quoteError) return { db, error: quoteError };
    const original = db.posts.find((item) => item.id === quotedPostId);
    if (!original) return { db, error: "That post is unavailable." };
  } else if (!body && photos.length === 0 && !input.card) {
    return { db, error: "Write something, add a photo, or attach a card." };
  }
  if (body.length > 280) return { db, error: "Keep it to 280 characters." };
  const createdAt = new Date().toISOString();
  const post: Post = {
    id: `post-${Date.now().toString(36)}`,
    authorId: db.sessionUserId,
    body,
    imageDataUrl: photos[0] ?? null,
    images: photos,
    card: input.card,
    quotedPostId,
    createdAt,
  };
  let notifications = withMentionNotifications(
    db,
    db.sessionUserId,
    post.id,
    body,
    createdAt,
  );
  if (quotedPostId) {
    const original = db.posts.find((item) => item.id === quotedPostId);
    if (
      original &&
      shouldNotifyQuoteAuthor(db.sessionUserId, original.authorId)
    ) {
      notifications = [
        {
          id: `note-quote-${post.id}`,
          recipientId: original.authorId,
          actorId: db.sessionUserId,
          kind: "quote",
          postId: post.id,
          preview: previewText(body || "Quoted your post"),
          createdAt,
          read: false,
        },
        ...notifications,
      ];
    }
  }
  return {
    db: {
      ...db,
      posts: [post, ...db.posts],
      notifications,
    },
    postId: post.id,
  };
}

export function localUpdatePost(
  db: LocalDb,
  postId: string,
  input: { body: string; imageDataUrl: string | null; images?: readonly string[] | null },
): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "Log in to edit." };
  const post = db.posts.find((item) => item.id === postId);
  if (!post) return { db, error: "That post is gone." };
  if (post.authorId !== db.sessionUserId) return { db, error: "You can only edit your own posts." };
  const body = input.body.trim();
  const photos = draftPostPhotos(input);
  if (!body && photos.length === 0 && !post.card) {
    return { db, error: "Write something or add a photo." };
  }
  if (body.length > 280) return { db, error: "Keep it to 280 characters." };
  return {
    db: {
      ...db,
      posts: db.posts.map((item) =>
        item.id === postId
          ? { ...item, body, imageDataUrl: photos[0] ?? null, images: photos }
          : item,
      ),
      notifications: withMentionNotifications(
        db,
        db.sessionUserId,
        postId,
        body,
        new Date().toISOString(),
      ),
    },
  };
}

function withMentionNotifications(
  db: LocalDb,
  actorId: string,
  postId: string,
  body: string,
  createdAt: string,
): Notification[] {
  const wanted = new Set(mentionsToNotify(body));
  const recipientIds = new Set(
    db.users
      .filter((person) => person.id !== actorId && wanted.has(person.username))
      .map((person) => person.id),
  );
  const current = db.notifications ?? [];
  const kept = current.flatMap((note) => {
    if (note.kind !== "mention" || note.postId !== postId || note.actorId !== actorId) return [note];
    if (isReplyMentionMetadata(note.metadata)) return [note];
    if (!recipientIds.has(note.recipientId)) return [];
    return [{ ...note, preview: previewText(body) }];
  });
  const already = new Set(
    kept
      .filter((note) => note.kind === "mention" && note.postId === postId && note.actorId === actorId)
      .map((note) => note.recipientId),
  );
  const added: Notification[] = [];
  for (const recipientId of recipientIds) {
    if (already.has(recipientId)) continue;
    added.push({
      id: `note-mention-${postId}-${recipientId}-${createdAt}`,
      recipientId,
      actorId,
      kind: "mention",
      postId,
      preview: previewText(body),
      createdAt,
      read: false,
    });
  }
  return [...added, ...kept];
}

export function canDeleteReply(viewerId: string | null | undefined, authorId: string) {
  return Boolean(viewerId && viewerId === authorId);
}

/**
 * True when this row is the deleter's comment notice, or a reply mention they
 * sent, on the parent post, and the stored preview is this reply's preview.
 * Notifications have no comment id, so the preview is the match.
 */
function isOwnReplyPreviewNotification(note: Notification, comment: PostComment) {
  if (note.actorId !== comment.authorId) return false;
  if (note.postId !== comment.postId) return false;
  const preview = replyNoticePreview(comment.body, comment.images);
  if (!preview || note.preview !== preview) return false;
  if (note.kind === "comment") return true;
  return note.kind === "mention" && isReplyMentionMetadata(note.metadata);
}

/** Drops the reply and rows tied to it. An error keeps the previous rows. */
export function stateAfterReplyDelete(
  before: {
    comments: PostComment[];
    likes: PostLike[];
    reposts: PostRepost[];
    notifications: Notification[];
  },
  commentId: string,
  result: { error?: string },
) {
  if (result.error) return before;
  const comment = before.comments.find((item) => item.id === commentId);
  return {
    comments: before.comments.filter((item) => item.id !== commentId),
    likes: before.likes.filter((like) => like.postId !== commentId),
    reposts: before.reposts.filter((repost) => repost.postId !== commentId),
    notifications: before.notifications.filter((note) => {
      if (note.postId === commentId) return false;
      if (comment && isOwnReplyPreviewNotification(note, comment)) return false;
      return true;
    }),
  };
}

export function localDeleteComment(db: LocalDb, commentId: string): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "Log in to delete." };
  const comments = db.comments ?? [];
  const comment = comments.find((item) => item.id === commentId);
  if (!comment) return { db, error: "That reply is gone." };
  if (!canDeleteReply(db.sessionUserId, comment.authorId)) {
    return { db, error: "You can only delete your own replies." };
  }
  return {
    db: {
      ...db,
      ...stateAfterReplyDelete(
        {
          comments,
          likes: db.likes ?? [],
          reposts: db.reposts ?? [],
          notifications: db.notifications ?? [],
        },
        commentId,
        {},
      ),
    },
  };
}

export function localPinPost(db: LocalDb, postId: string): { db: LocalDb; error?: string } {
  const actorId = db.sessionUserId;
  if (!actorId) return { db, error: "Log in to pin a post." };
  const post = db.posts.find((item) => item.id === postId) ?? null;
  const decision = decidePin({
    actorId,
    profileId: actorId,
    post: post ? { id: post.id, authorId: post.authorId } : null,
  });
  if (!decision.ok) return { db, error: decision.error };
  return {
    db: {
      ...db,
      users: db.users.map((user) =>
        user.id === actorId ? { ...user, pinnedPostId: decision.pinnedPostId } : user,
      ),
    },
  };
}

export function localUnpinPost(db: LocalDb): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "You can only unpin your own profile." };
  const actorId = db.sessionUserId;
  return {
    db: {
      ...db,
      users: db.users.map((user) =>
        user.id === actorId ? { ...user, pinnedPostId: null } : user,
      ),
    },
  };
}

export function localDeletePost(db: LocalDb, postId: string): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "Log in to delete." };
  const post = db.posts.find((item) => item.id === postId);
  if (!post) return { db, error: "That post is gone." };
  if (post.authorId !== db.sessionUserId) return { db, error: "You can only delete your own posts." };
  return {
    db: {
      ...db,
      users: db.users.map((user) => ({
        ...user,
        pinnedPostId: pinnedPostIdAfterDelete(user.pinnedPostId, postId),
      })),
      posts: db.posts.filter((item) => item.id !== postId),
      comments: (db.comments ?? []).filter((comment) => comment.postId !== postId),
      likes: (db.likes ?? []).filter((like) => like.postId !== postId),
      reposts: (db.reposts ?? []).filter((repost) => repost.postId !== postId),
      notifications: (db.notifications ?? []).filter((note) => note.postId !== postId),
    },
  };
}

export function localMarkNotificationsRead(db: LocalDb, ids?: readonly string[]): LocalDb {
  if (!db.sessionUserId) return db;
  const only = ids ? new Set(ids) : null;
  if (only && only.size === 0) return db;
  return {
    ...db,
    notifications: (db.notifications ?? []).map((note) =>
      note.recipientId === db.sessionUserId && (!only || only.has(note.id))
        ? { ...note, read: true }
        : note,
    ),
  };
}
