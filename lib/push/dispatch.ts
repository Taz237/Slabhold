import { BATCH_WINDOW_MS, batchDecision, distinctValidActors, tailDueAt } from "./group";
import { singlePayload, summaryPayload, type PushActor, type PushPayload } from "./payload";
import { kindEnabled, type NotificationPrefs, type SourceKind } from "./prefs";
import { inQuietHours } from "./quiet-hours";
import { recipientAllows } from "./rate";
import { deliver, type DeliveryResult, type PushSubscriptionRow, type WebPushSender } from "./send";
import type { PushServerConfig } from "./config";

export type OutboxStatus = "pending" | "sent" | "collapsed" | "skipped" | "failed";

/** One row of private.push_outbox. */
export type OutboxRow = {
  id: string;
  recipientId: string;
  actorId: string | null;
  kind: SourceKind;
  postId: string | null;
  notificationId: string | null;
  messageId: string | null;
  createdAt: string;
  status: OutboxStatus;
  /** Sent rows: when. Collapsed rows: when a trailing summary covered them (null until then). */
  sentAt: string | null;
  attempts: number;
  groupKey: string;
};

/** Everything checked at send time, read fresh because the row may be stale. */
export type SendContext = {
  /** The notification or message row is still there (no unlike, unfollow or delete). */
  sourceExists: boolean;
  recipientExists: boolean;
  /** Null when the actor's account is gone. */
  actor: PushActor | null;
  /** The post the notice is about. Null when it was deleted. Unused for follows and DMs. */
  post: { hidden: boolean } | null;
  /** like/repost: the post. reply/mention/quote: the new text. dm: the message. */
  text: string | null;
  messageKind: "text" | "card_preview" | null;
  /** Either person blocked the other. */
  blocked: boolean;
  /** The recipient muted the actor. */
  muted: boolean;
  prefs: NotificationPrefs;
  subscriptionCount: number;
  /** Unread notifications plus unread DMs. */
  badge: number;
};

export type GroupState = {
  /** The newest push (single or summary) for this recipient and group. */
  lastPushAt: string | null;
  sentLastMinute: number;
  sentLastHour: number;
  /** DMs only: unread messages from that sender. */
  dmUnread: number;
};

/** A row in the group over the last day, with whether it would still notify. */
export type GroupRow = OutboxRow & { valid: boolean };

export interface PushStore {
  /** Pending rows by this actor from the last 10 minutes, claimed so no other flush sends them. */
  claimForActor(actorId: string, limit: number): Promise<OutboxRow[]>;
  /** Anyone's pending rows a flush missed, claimed. */
  claimOverdue(limit: number): Promise<OutboxRow[]>;
  context(row: OutboxRow): Promise<SendContext | null>;
  groupState(recipientId: string, groupKey: string, actorId: string | null): Promise<GroupState>;
  groupRows(recipientId: string, groupKey: string): Promise<GroupRow[]>;
  mark(ids: readonly string[], status: OutboxStatus, sentAt: string | null): Promise<void>;
  subscriptions(recipientId: string): Promise<PushSubscriptionRow[]>;
  recordDelivery(result: DeliveryResult, at: string): Promise<void>;
  actors(ids: readonly string[]): Promise<PushActor[]>;
  dueTails(limit: number): Promise<{ recipientId: string; groupKey: string }[]>;
  takeLease(recipientId: string, groupKey: string, seconds: number): Promise<boolean>;
  releaseLease(recipientId: string, groupKey: string): Promise<void>;
  prune(): Promise<void>;
}

export type Dispatcher = {
  store: PushStore;
  sender: WebPushSender;
  config: PushServerConfig;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** A flush only sends rows this fresh. Older pending rows are skipped as stale. */
export const FRESH_MS = 10 * 60 * 1000;
export const LEASE_SECONDS = 30;
export const ACTOR_CLAIM_LIMIT = 25;
export const SWEEP_LIMIT = 50;
export const TAIL_SWEEP_LIMIT = 20;

export type SkipReason =
  | "self"
  | "stale"
  | "recipient_gone"
  | "source_gone"
  | "actor_gone"
  | "blocked"
  | "muted"
  | "post_gone"
  | "post_hidden"
  | "type_off"
  | "quiet_hours"
  | "no_subscriptions";

const POST_KINDS = new Set<SourceKind>(["like", "comment", "repost", "mention", "quote"]);

/** Why this row must not push now, or null when it may. */
export function skipReason(
  row: OutboxRow,
  context: SendContext | null,
  now: number,
  options: { checkStale?: boolean } = {},
): SkipReason | null {
  if (!row.actorId || row.actorId === row.recipientId) return "self";
  if (options.checkStale !== false) {
    const created = Date.parse(row.createdAt);
    if (!Number.isFinite(created) || now - created > FRESH_MS) return "stale";
  }
  if (!context) return "source_gone";
  if (!context.recipientExists) return "recipient_gone";
  if (!context.sourceExists) return "source_gone";
  if (!context.actor) return "actor_gone";
  if (context.blocked) return "blocked";
  if (context.muted) return "muted";
  if (POST_KINDS.has(row.kind)) {
    if (!row.postId || !context.post) return "post_gone";
    if (context.post.hidden) return "post_hidden";
  }
  if (!kindEnabled(context.prefs, row.kind)) return "type_off";
  if (inQuietHours(context.prefs, new Date(now))) return "quiet_hours";
  if (context.subscriptionCount <= 0) return "no_subscriptions";
  return null;
}

export type FlushCounts = {
  claimed: number;
  sent: number;
  collapsed: number;
  skipped: number;
  failed: number;
  summaries: number;
};

export type PendingTail = { recipientId: string; groupKey: string; dueAt: number | null };

function emptyCounts(): FlushCounts {
  return { claimed: 0, sent: 0, collapsed: 0, skipped: 0, failed: 0, summaries: 0 };
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function parseMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

type SendOutcome = "delivered" | "none" | "failed";

async function sendToRecipient(
  dispatcher: Dispatcher,
  recipientId: string,
  payload: PushPayload,
  at: number,
): Promise<SendOutcome> {
  const subscriptions = await dispatcher.store.subscriptions(recipientId);
  if (subscriptions.length === 0) return "none";
  const result = await deliver({
    sender: dispatcher.sender,
    config: dispatcher.config,
    subscriptions,
    payload,
    sleep: dispatcher.sleep,
  });
  await dispatcher.store.recordDelivery(result, iso(at));
  if (result.delivered.length > 0) return "delivered";
  return result.failed.length > 0 ? "failed" : "none";
}

function payloadFor(row: OutboxRow, context: SendContext, ts: number, renotify: boolean): PushPayload {
  return singlePayload({
    kind: row.kind,
    actor: context.actor,
    postId: row.postId,
    text: context.text,
    messageKind: context.messageKind,
    showPreviews: context.prefs.showPreviews,
    badge: context.badge,
    ts,
    renotify,
  });
}

/**
 * A new event. It sends at once unless its group pushed in the last minute,
 * the recipient is over their rate limit, or another sender holds the group.
 * Then it collapses into the trailing summary.
 */
export async function processRow(
  dispatcher: Dispatcher,
  row: OutboxRow,
  counts: FlushCounts = emptyCounts(),
): Promise<PendingTail | null> {
  const { store } = dispatcher;
  const now = dispatcher.now?.() ?? Date.now();
  const context = await store.context(row);
  if (skipReason(row, context, now)) {
    await store.mark([row.id], "skipped", null);
    counts.skipped += 1;
    return null;
  }
  const leaseTaken = await store.takeLease(row.recipientId, row.groupKey, LEASE_SECONDS);
  try {
    const state = await store.groupState(row.recipientId, row.groupKey, row.actorId);
    const lastPushAt = parseMs(state.lastPushAt);
    const rateAllows = recipientAllows({ lastMinute: state.sentLastMinute, lastHour: state.sentLastHour });
    const decision = batchDecision({ now, lastPushAt, leaseTaken, rateAllows });
    if (decision === "collapse") {
      await store.mark([row.id], "collapsed", null);
      counts.collapsed += 1;
      const inWindow = lastPushAt !== null && now - lastPushAt < BATCH_WINDOW_MS;
      const dueAt = inWindow ? tailDueAt(lastPushAt, now) : leaseTaken ? null : now + BATCH_WINDOW_MS;
      return { recipientId: row.recipientId, groupKey: row.groupKey, dueAt };
    }
    const sentAt = dispatcher.now?.() ?? Date.now();
    const outcome = await sendToRecipient(dispatcher, row.recipientId, payloadFor(row, context!, Date.parse(row.createdAt), true), sentAt);
    if (outcome === "delivered") {
      await store.mark([row.id], "sent", iso(sentAt));
      counts.sent += 1;
    } else if (outcome === "failed") {
      await store.mark([row.id], "failed", null);
      counts.failed += 1;
    } else {
      await store.mark([row.id], "skipped", null);
      counts.skipped += 1;
    }
    return null;
  } finally {
    if (leaseTaken) await store.releaseLease(row.recipientId, row.groupKey);
  }
}

export type TailResult =
  | "busy"
  | "empty"
  | "not_due"
  | "rate_limited"
  | "skipped"
  | "sent"
  | "failed";

/** Trailing summaries may fire this much before the window closes, so one function run can carry them. */
export const TAIL_EARLY_MS = 8_000;

/**
 * When a group's window closes: one quiet push that sums up what collapsed,
 * counting only actors still valid now. Holds the group lease so only one
 * tail runs per recipient and group.
 */
export async function runTail(
  dispatcher: Dispatcher,
  recipientId: string,
  groupKey: string,
  counts: FlushCounts = emptyCounts(),
  options: { earlyMs?: number } = {},
): Promise<TailResult> {
  const { store } = dispatcher;
  if (!(await store.takeLease(recipientId, groupKey, LEASE_SECONDS))) return "busy";
  try {
    const rows = await store.groupRows(recipientId, groupKey);
    const fresh = rows
      .filter((row) => row.status === "collapsed" && row.sentAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (fresh.length === 0) return "empty";
    const now = dispatcher.now?.() ?? Date.now();
    const state = await store.groupState(recipientId, groupKey, fresh[0]!.actorId);
    const lastPushAt = parseMs(state.lastPushAt);
    if (lastPushAt !== null && now < lastPushAt + BATCH_WINDOW_MS - (options.earlyMs ?? 0)) return "not_due";
    if (!recipientAllows({ lastMinute: state.sentLastMinute, lastHour: state.sentLastHour })) {
      return "rate_limited";
    }
    const freshIds = fresh.map((row) => row.id);
    const newest = fresh.find((row) => row.valid);
    const context = newest ? await store.context(newest) : null;
    if (!newest || skipReason(newest, context, now, { checkStale: false })) {
      await store.mark(freshIds, "skipped", null);
      counts.skipped += freshIds.length;
      return "skipped";
    }

    let payload: PushPayload;
    if (newest.kind === "dm") {
      if (state.dmUnread <= 0) {
        await store.mark(freshIds, "skipped", null);
        counts.skipped += freshIds.length;
        return "skipped";
      }
      payload =
        state.dmUnread === 1
          ? payloadFor(newest, context!, Date.parse(newest.createdAt), false)
          : summaryPayload({
              kind: "dm",
              lead: context!.actor,
              names: [],
              count: state.dmUnread,
              postId: null,
              badge: context!.badge,
              ts: Date.parse(newest.createdAt),
            });
    } else {
      const actorIds = distinctValidActors(rows);
      if (actorIds.length <= 1) {
        payload = payloadFor(newest, context!, Date.parse(newest.createdAt), false);
      } else {
        const people = new Map((await store.actors(actorIds.slice(0, 2))).map((actor) => [actor.id, actor]));
        const names = actorIds
          .slice(0, 2)
          .map((id) => people.get(id)?.displayName?.trim() || people.get(id)?.username || "Someone");
        payload = summaryPayload({
          kind: newest.kind,
          lead: people.get(actorIds[0]!) ?? context!.actor,
          names,
          count: actorIds.length,
          postId: newest.postId,
          badge: context!.badge,
          ts: Date.parse(newest.createdAt),
        });
      }
    }

    const outcome = await sendToRecipient(dispatcher, recipientId, payload, now);
    if (outcome === "delivered") {
      await store.mark([newest.id], "sent", iso(now));
      const rest = freshIds.filter((id) => id !== newest.id);
      if (rest.length) await store.mark(rest, "collapsed", iso(now));
      counts.summaries += 1;
      return "sent";
    }
    await store.mark(freshIds, outcome === "failed" ? "failed" : "skipped", null);
    if (outcome === "failed") counts.failed += freshIds.length;
    else counts.skipped += freshIds.length;
    return outcome === "failed" ? "failed" : "skipped";
  } finally {
    await store.releaseLease(recipientId, groupKey);
  }
}

/**
 * The caller's own new events, then a small sweep of rows other flushes
 * missed. Returns tails the caller should run once their windows close.
 */
export async function flushForActor(
  dispatcher: Dispatcher,
  actorId: string,
): Promise<{ counts: FlushCounts; tails: PendingTail[] }> {
  const counts = emptyCounts();
  const own = await dispatcher.store.claimForActor(actorId, ACTOR_CLAIM_LIMIT);
  const overdue = await dispatcher.store.claimOverdue(SWEEP_LIMIT);
  const seen = new Set<string>();
  const rows = [...own, ...overdue]
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  counts.claimed = rows.length;
  const tails = new Map<string, PendingTail>();
  for (const row of rows) {
    try {
      const tail = await processRow(dispatcher, row, counts);
      if (!tail) continue;
      const key = `${tail.recipientId}|${tail.groupKey}`;
      const existing = tails.get(key);
      if (!existing || (tail.dueAt ?? Infinity) < (existing.dueAt ?? Infinity)) tails.set(key, tail);
    } catch {
      counts.failed += 1;
      await dispatcher.store.mark([row.id], "failed", null).catch(() => undefined);
    }
  }
  return { counts, tails: [...tails.values()] };
}

/** Overdue trailing summaries, for the flush sweep and the cron safety net. */
export async function sweepTails(dispatcher: Dispatcher, counts: FlushCounts = emptyCounts()) {
  const due = await dispatcher.store.dueTails(TAIL_SWEEP_LIMIT);
  for (const tail of due) {
    try {
      await runTail(dispatcher, tail.recipientId, tail.groupKey, counts);
    } catch {
      counts.failed += 1;
    }
  }
  return counts;
}

/**
 * Wait for each tail's window to close (within `budgetMs`), then send it.
 * Tails that can't close in time are left for the next flush or the cron.
 */
export async function runTailsWhenDue(
  dispatcher: Dispatcher,
  tails: readonly PendingTail[],
  budgetMs: number,
  counts: FlushCounts = emptyCounts(),
) {
  const sleep = dispatcher.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const startedAt = dispatcher.now?.() ?? Date.now();
  await Promise.all(
    tails
      .filter((tail) => tail.dueAt !== null)
      .map(async (tail) => {
        const wait = Math.max(0, tail.dueAt! - startedAt);
        if (wait > budgetMs + TAIL_EARLY_MS) return;
        await sleep(Math.min(wait, budgetMs));
        try {
          await runTail(dispatcher, tail.recipientId, tail.groupKey, counts, { earlyMs: TAIL_EARLY_MS });
        } catch {
          counts.failed += 1;
        }
      }),
  );
  return counts;
}

/** Counts only: never endpoints, keys, ids or text. */
export function logCounts(label: string, counts: FlushCounts) {
  if (counts.claimed + counts.sent + counts.collapsed + counts.skipped + counts.failed + counts.summaries === 0) return;
  console.info(`[push] ${label}`, counts);
}
