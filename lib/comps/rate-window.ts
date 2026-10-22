/** Seconds left in the aligned window that contains `now`. At least 1. */
export function alignedRetryAfterSeconds(windowMs: number, now = Date.now()): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) return 1;
  const start = Math.floor(now / windowMs) * windowMs;
  const remainingMs = start + windowMs - now;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}
