export const COLLECTION_SNAPSHOT_GAP_MS = 10_000;

const lastSnapshot = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();

/** One collection snapshot per user per window. A burst shares the in-flight write. */
export function allowCollectionSnapshot(userId: string, now = Date.now()): boolean {
  const last = lastSnapshot.get(userId) ?? 0;
  if (now - last < COLLECTION_SNAPSHOT_GAP_MS) return false;
  lastSnapshot.set(userId, now);
  return true;
}

/**
 * Run write at most once per user inside the gap. Parallel callers, including
 * a bulk delete, await the same snapshot instead of writing again.
 */
export async function runOncePerUser(
  userId: string,
  write: () => Promise<void>,
  now = Date.now(),
): Promise<void> {
  const pending = inflight.get(userId);
  if (pending) return pending;
  if (!allowCollectionSnapshot(userId, now)) return;
  const job = write();
  const tracked = job.finally(() => {
    if (inflight.get(userId) === tracked) inflight.delete(userId);
  });
  inflight.set(userId, tracked);
  return tracked;
}
