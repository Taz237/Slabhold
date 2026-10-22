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
  /** From public_cards.created_at when known. Not a value. */
  createdAt?: string;
  grade?: string;
  parallel?: string;
  /** Season label when it differs from year, e.g. "2023-24". */
  yearLabel?: string;
  conditionType?: "raw" | "graded";
  grader?: string;
  purchasePrice?: number | null;
  /** From public_cards.is_rookie. Absent until that row is loaded. */
  isRookie?: boolean;
};

export type OwnedCard = PublicCard & { ownerId: string };

export type MailDayInfo = {
  source: string | null;
  photos: string[];
  /** Set only when this viewer is allowed to see the cost. */
  paid: number | null;
  isPublic: boolean;
  showValue: boolean;
};

/** One card on a Mail Day post, already filtered for this viewer. */
export type MailDayCardView = {
  card: PublicCard;
  photos: string[];
  source: string | null;
  paid: number | null;
  isPublic: boolean;
  showValue: boolean;
};

export type Post = {
  id: string;
  authorId: string;
  body: string;
  imageDataUrl: string | null;
  card: PublicCard | null;
  /** Original post this quote references, if any. */
  quotedPostId: string | null;
  createdAt: string;
  postType?: "post" | "mail_day";
  showPaid?: boolean;
  mailDay?: MailDayInfo | null;
  /** Every card on a Mail Day post. Empty for a normal post. */
  mailDayCards?: MailDayCardView[];
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

export type NotificationKind =
  | "like"
  | "comment"
  | "follow"
  | "repost"
  | "mention"
  | "quote"
  | "want_alert";

export type Notification = {
  id: string;
  recipientId: string;
  actorId: string | null;
  kind: NotificationKind;
  postId: string | null;
  preview: string | null;
  /** Card, post, or listing path for want alerts. */
  href?: string | null;
  /** Reply mentions set `{ source: "reply" }` so a post edit does not delete them. */
  metadata?: Record<string, unknown> | null;
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
  /** Feed/search posts. Muted authors are already excluded in SQL. */
  homePosts?: Post[];
  /** Feed reposts. Muted reposters are already excluded in SQL. */
  homeReposts?: PostRepost[];
  /** Accounts the viewer blocked. */
  blockedIds?: string[];
  /** Accounts the viewer muted. */
  mutedIds?: string[];
  /** Profiles for the block and mute lists, including people hidden from the feed. */
  safetyAccounts?: Profile[];
};

export type SignUpInput = {
  email: string;
  password: string;
  username: string;
  displayName: string;
  /** Where to return after email confirmation. */
  next?: string;
  /** Cloudflare Turnstile token. Omitted when the site key is not set. */
  captchaToken?: string;
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
  /** Password was right, but the address is still unconfirmed. */
  unconfirmed?: boolean;
};

export const POST_LIMIT = 280;
export const COMMENT_LIMIT = 280;
export const MESSAGE_LIMIT = 1000;
