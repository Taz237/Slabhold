import type { VouchHint, VouchRating, VouchSummary } from "./rules";

/** One vouch on someone's vouches page. */
export type VouchRow = {
  id: string;
  rating: VouchRating;
  note: string;
  createdAt: string;
  editedAt: string | null;
  /** The subject's public reply. Null when there is none, or a moderator hid it. */
  reply: string | null;
  replyAt: string | null;
  replyEditedAt: string | null;
  voucher: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    accent: string | null;
    createdAt: string | null;
    /** Vouches this person has themselves. */
    vouchTotal: number;
  };
  /** The two logged a confirmed deal in the deal log. Never a price. */
  hasLoggedDeal: boolean;
};

/** Where the next page starts: the last row of this one. */
export type VouchCursor = { createdAt: string; id: string };

export type VouchPage = { rows: VouchRow[]; next: VouchCursor | null };

/** Whether the signed-in reader can vouch for someone, and the vouch they already left. */
export type VouchStatus = {
  canVouch: boolean;
  /** Why not, as the database's code. Null when they can. */
  reason: VouchHint | null;
  mine: { id: string; rating: VouchRating; note: string } | null;
};

export type VouchWriteResult = { ok: true; id?: string } | { ok: false; error: string; hint: VouchHint | null };

/** Where vouches come from and go: Supabase, or this device in local mode. */
export type VouchBackend = {
  /** Counts for these profiles (any number: the backend asks in batches). A profile left out has none. */
  summaries(userIds: readonly string[]): Promise<Map<string, VouchSummary>>;
  list(subjectId: string, options?: { rating?: VouchRating | null; before?: VouchCursor | null; limit?: number }): Promise<VouchPage>;
  status(subjectId: string): Promise<VouchStatus>;
  upsert(subjectId: string, rating: VouchRating, note: string): Promise<VouchWriteResult>;
  remove(subjectId: string): Promise<VouchWriteResult>;
  /** An empty reply removes it. */
  reply(vouchId: string, text: string): Promise<VouchWriteResult>;
};
