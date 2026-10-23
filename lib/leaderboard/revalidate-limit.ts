export const VALUE_BOARD_REVALIDATE_GAP_MS = 10_000;

const lastRevalidate = new Map<string, number>();

/** One cache flush per user per window. The opt-in write still happens when this is false. */
export function allowValueBoardRevalidate(userId: string, now = Date.now()): boolean {
  const last = lastRevalidate.get(userId) ?? 0;
  if (now - last < VALUE_BOARD_REVALIDATE_GAP_MS) return false;
  lastRevalidate.set(userId, now);
  return true;
}

/**
 * Opt-out always drops the cached board. The 10s limit applies only when
 * turning the board on.
 */
export function shouldFlushAfterOptIn(optedIn: boolean, userId: string, now = Date.now()): boolean {
  if (optedIn !== true) return true;
  return allowValueBoardRevalidate(userId, now);
}
