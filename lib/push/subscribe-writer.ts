import { timingSafeEqual } from "node:crypto";
import type { SubscriptionWriter } from "./handlers";

/** Most devices one account keeps. The oldest goes first. */
export const MAX_DEVICES = 10;

export type StoredSubscription = { user_id: string; p256dh: string; auth: string };

export type SubscriptionRowInput = Parameters<SubscriptionWriter["upsert"]>[0];

/** The few push_subscriptions queries the writer needs, through the service role. */
export type SubscriptionTable = {
  find(endpoint: string): Promise<{ row: StoredSubscription | null; error: string | null }>;
  /** `duplicate`: another write took the endpoint between our read and this insert. */
  insert(row: SubscriptionRowInput & { failure_count: 0; created_at: string }): Promise<{
    error: string | null;
    duplicate?: boolean;
  }>;
  /** Updates only while the row still belongs to `userId`. */
  update(
    endpoint: string,
    userId: string,
    patch: Omit<SubscriptionRowInput, "user_id" | "endpoint"> & { failure_count: 0; created_at: string },
  ): Promise<{ error: string | null; count: number }>;
  /** Deletes only the exact row we read: this endpoint, this owner, this auth secret. */
  deleteOwned(endpoint: string, userId: string, auth: string): Promise<{ error: string | null; count: number }>;
  /** This user's subscription ids, newest first. */
  idsNewestFirst(userId: string): Promise<string[]>;
  deleteIds(ids: readonly string[]): Promise<void>;
  /** Sign-out and the Settings switch: only the caller's own row. */
  remove(userId: string, endpoint: string): Promise<{ error: string | null }>;
  now?: () => string;
};

/** Constant-time for equal lengths; different lengths are simply unequal. */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Holds both of the browser's own keys for this endpoint (from PushSubscription.toJSON()). */
function provesPossession(stored: StoredSubscription, row: SubscriptionRowInput): boolean {
  // Both compared every time, so the answer takes the same path either way.
  const p256dh = sameSecret(stored.p256dh, row.p256dh);
  const auth = sameSecret(stored.auth, row.auth);
  return p256dh && auth;
}

/**
 * Subscribe without letting an endpoint jump accounts. A new endpoint is
 * inserted; the caller's own is refreshed in place. Someone else's moves only
 * when the request carries that subscription's p256dh and auth keys, which
 * only the browser holding it has: the shared-device case, where the last
 * user's sign-out didn't reach us. Otherwise the row stays put and the caller
 * gets a conflict.
 */
export function createSubscriptionWriter(table: SubscriptionTable, maxDevices = MAX_DEVICES): SubscriptionWriter {
  const now = table.now ?? (() => new Date().toISOString());

  async function write(row: SubscriptionRowInput, attemptsLeft: number): Promise<{ error: string | null; conflict?: boolean }> {
    const found = await table.find(row.endpoint);
    if (found.error) return { error: found.error };
    const stored = found.row;
    const fresh = { failure_count: 0 as const, created_at: now() };

    if (!stored) {
      const inserted = await table.insert({ ...row, ...fresh });
      if (inserted.duplicate && attemptsLeft > 0) return write(row, attemptsLeft - 1);
      return { error: inserted.error };
    }

    if (stored.user_id === row.user_id) {
      const updated = await table.update(row.endpoint, row.user_id, {
        p256dh: row.p256dh,
        auth: row.auth,
        platform: row.platform,
        user_agent: row.user_agent,
        ...fresh,
      });
      if (updated.error) return { error: updated.error };
      if (updated.count === 0 && attemptsLeft > 0) return write(row, attemptsLeft - 1);
      return { error: null };
    }

    if (!provesPossession(stored, row)) return { error: null, conflict: true };

    const removed = await table.deleteOwned(row.endpoint, stored.user_id, stored.auth);
    if (removed.error) return { error: removed.error };
    // Someone changed the row since we read it: read once more and decide again.
    if (removed.count === 0) return attemptsLeft > 0 ? write(row, attemptsLeft - 1) : { error: "busy" };
    const inserted = await table.insert({ ...row, ...fresh });
    if (inserted.duplicate && attemptsLeft > 0) return write(row, attemptsLeft - 1);
    return { error: inserted.error };
  }

  return {
    async upsert(row) {
      const result = await write(row, 1);
      if (result.error || result.conflict) return result;
      const extra = (await table.idsNewestFirst(row.user_id)).slice(maxDevices);
      if (extra.length) await table.deleteIds(extra);
      return { error: null };
    },
    remove: (userId, endpoint) => table.remove(userId, endpoint),
  };
}
