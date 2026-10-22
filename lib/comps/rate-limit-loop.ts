export const RATE_LIMIT_BURST_ATTEMPTS = 8;

export type BucketRow = {
  table: "comps_rate_limits" | "anon_rate_limits";
  subjectColumn: "user_id" | "subject";
  subject: string;
  bucket: string;
  windowStart: string;
};

/** `count` is null when the bucket row does not exist yet. */
export type BucketRead = {
  count: number | null;
  error?: string;
};

export type BucketWrite =
  | { ok: true }
  | { ok: false; conflict: boolean; error?: string };

export type BucketStore = {
  read(row: BucketRow): Promise<BucketRead>;
  insert(row: BucketRow, count: number): Promise<BucketWrite>;
  update(row: BucketRow, from: number, to: number): Promise<BucketWrite>;
};

export type ConsumeBucketOptions = {
  /** Called only between lost-write retries. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  attempts?: number;
};

/** Small jittered pause before retry `retry` (1-based). */
export function lostWriteBackoffMs(retry: number, random: () => number = Math.random): number {
  const jitter = Math.floor(Math.max(0, random()) * 8);
  return 4 * retry + jitter;
}

/**
 * After every lost-write retry is used up. Want checks and Trawl stay blocked.
 * Card values (including anonymous), comps, and any other bucket are allowed
 * so a burst under the limit is not turned away.
 */
export function allowsAfterLostWrite(bucket: string): boolean {
  return bucket !== "want_match" && bucket !== "trawl";
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Read a bucket and write the next count only while the read is still current.
 * A read error or a non-conflict write error allows the request. A count that
 * is already at the limit blocks it. Lost writes retry with a short jittered
 * pause. The last lost write blocks want_match and trawl, and allows card
 * values, comps, and anonymous card values.
 */
export async function consumeBucketWithStore(
  store: BucketStore,
  row: BucketRow,
  limit: number,
  options: ConsumeBucketOptions = {},
): Promise<boolean> {
  const attempts = options.attempts ?? RATE_LIMIT_BURST_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(lostWriteBackoffMs(attempt, random));

    const read = await store.read(row);
    if (read.error) return true;

    const current = read.count ?? 0;
    if (current >= limit) return false;

    const write =
      read.count == null
        ? await store.insert(row, current + 1)
        : await store.update(row, current, current + 1);
    if (write.ok || !write.conflict) return true;
  }

  return allowsAfterLostWrite(row.bucket);
}
