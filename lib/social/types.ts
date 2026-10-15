export type Profile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
  accent: string;
  createdAt: string;
};

export type PublicCard = {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber: string;
  sport: string;
  photoDataUrl: string | null;
  accent: string;
  estimatedSellPrice: number;
};

export type OwnedCard = PublicCard & { ownerId: string };

export type Post = {
  id: string;
  authorId: string;
  body: string;
  imageDataUrl: string | null;
  card: PublicCard | null;
  createdAt: string;
};

export type FollowEdge = {
  followerId: string;
  followingId: string;
  createdAt: string;
};

export type PostLike = {
  postId: string;
  userId: string;
  createdAt: string;
};

export type PostRepost = {
  postId: string;
  userId: string;
  createdAt: string;
};

export type PostComment = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type NotificationKind = "like" | "comment" | "follow";

export type Notification = {
  id: string;
  recipientId: string;
  actorId: string;
  kind: NotificationKind;
  postId: string | null;
  preview: string | null;
  createdAt: string;
  read: boolean;
};

export type DirectMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  read: boolean;
};

export type SocialSnapshot = {
  user: Profile | null;
  profiles: Profile[];
  posts: Post[];
  follows: FollowEdge[];
  likes: PostLike[];
  reposts: PostRepost[];
  comments: PostComment[];
  notifications: Notification[];
  messages: DirectMessage[];
  publicCards: OwnedCard[];
};

export type SignUpInput = {
  email: string;
  password: string;
  username: string;
  displayName: string;
};

export type ProfilePatch = {
  username: string;
  displayName: string;
  bio: string;
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
};

export type AuthResult = {
  error?: string;
  notice?: string;
};

export const POST_LIMIT = 280;
export const COMMENT_LIMIT = 280;
export const MESSAGE_LIMIT = 1000;
