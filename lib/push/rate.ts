/** Pushes one person may get. Past this, events wait for the next trailing summary. */
export const RECIPIENT_PER_MINUTE = 6;
export const RECIPIENT_PER_HOUR = 60;

/** POST /api/push/flush per signed-in caller. */
export const FLUSH_BUCKET = "push_flush";
export const FLUSH_LIMIT = 30;
export const FLUSH_WINDOW_MS = 60 * 1000;

/** POST /api/push/test per signed-in caller. */
export const TEST_BUCKET = "push_test";
export const TEST_LIMIT = 1;
export const TEST_WINDOW_MS = 60 * 1000;

export type SentCounts = { lastMinute: number; lastHour: number };

export function recipientAllows(counts: SentCounts): boolean {
  return counts.lastMinute < RECIPIENT_PER_MINUTE && counts.lastHour < RECIPIENT_PER_HOUR;
}

export type ConsumeLimit = (
  userId: string,
  bucket: string,
  windowMs: number,
  limit: number,
) => Promise<boolean>;

export function consumeFlushLimit(consume: ConsumeLimit, userId: string): Promise<boolean> {
  return consume(userId, FLUSH_BUCKET, FLUSH_WINDOW_MS, FLUSH_LIMIT);
}

export function consumeTestLimit(consume: ConsumeLimit, userId: string): Promise<boolean> {
  return consume(userId, TEST_BUCKET, TEST_WINDOW_MS, TEST_LIMIT);
}
