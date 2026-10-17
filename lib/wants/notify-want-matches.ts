import { money } from "@/lib/format";
import { newYorkDayStartIso } from "./ny-day";

export const WANT_ALERTS_PER_DAY = 20;

export type WantSourceType = "sale" | "post" | "listing";

export type WantMatchEvent = {
  sourceType: WantSourceType;
  sourceId: string;
  cardKey: string;
  cardId?: string | null;
  actorId: string | null;
  actorUsername: string | null;
  /** Short card name, e.g. "Jordan Love PSA 10". */
  label: string;
  /** Fallback link when a per-want link isn't resolved. */
  href: string;
  soldAt?: string | null;
  price?: number | null;
  now?: Date;
};

export type WantRow = {
  id: string;
  userId: string;
  cardKey: string;
  targetPrice: number | null;
  createdAt: string;
  sourceCardId: string | null;
};

export type WantNotificationInsert = {
  recipientId: string;
  actorId: string | null;
  postId: string | null;
  preview: string;
  href: string;
};

export type WantAlertInsert = {
  wantId: string;
  userId: string;
  sourceType: WantSourceType;
  sourceId: string;
  createdAt: string;
};

export type WantAlertDb = {
  wantsForKey(cardKey: string): Promise<WantRow[]>;
  alertsToday(userId: string, sinceIso: string): Promise<number>;
  /** True only when a new dedupe row was inserted. */
  insertAlert(row: WantAlertInsert): Promise<boolean>;
  insertNotification(row: WantNotificationInsert): Promise<void>;
  deleteAlert(wantId: string, sourceType: WantSourceType, sourceId: string): Promise<void>;
  /** Sale links can differ per wanter. Posts and listings ignore this. */
  hrefFor?(want: WantRow, event: WantMatchEvent): Promise<string>;
};

export function wantAlertPreview(event: WantMatchEvent, want: WantRow): string {
  if (event.sourceType === "sale") {
    const sold = `${event.label} sold for ${money(event.price ?? 0)}`;
    if (want.targetPrice == null) return sold;
    const relation = (event.price ?? 0) < want.targetPrice ? "under" : "at";
    return `${sold}, ${relation} your ${money(want.targetPrice)} target`;
  }
  const who = event.actorUsername
    ? `@${event.actorUsername.replace(/^@/, "")}`
    : "Someone";
  if (event.sourceType === "post") return `${who} posted a ${event.label} you want`;
  return `${who} listed a ${event.label} you want`;
}

/** A sale alerts only when it closed after the want and meets the target. */
export function saleQualifies(want: WantRow, event: WantMatchEvent): boolean {
  if (event.sourceType !== "sale") return true;
  if (event.price == null || !Number.isFinite(event.price)) return false;
  if (!event.soldAt) return false;
  const sold = new Date(event.soldAt).getTime();
  const created = new Date(want.createdAt).getTime();
  if (!Number.isFinite(sold) || !Number.isFinite(created) || sold <= created) return false;
  if (want.targetPrice == null) return true;
  return event.price <= want.targetPrice;
}

/**
 * Insert a want_alerts row first. Create the notification only when that insert
 * is new. Skips the actor's own post or listing and stops at the daily cap.
 */
export async function notifyWantMatches(
  event: WantMatchEvent,
  db: WantAlertDb,
): Promise<number> {
  if (!event.cardKey || !event.sourceId) return 0;
  const wants = await db.wantsForKey(event.cardKey);
  const now = event.now ?? new Date();
  const since = newYorkDayStartIso(now);
  let notified = 0;

  for (const want of wants) {
    if (want.cardKey !== event.cardKey) continue;
    if (event.actorId && event.actorId === want.userId) continue;
    if (!saleQualifies(want, event)) continue;

    const today = await db.alertsToday(want.userId, since);
    if (today >= WANT_ALERTS_PER_DAY) continue;

    const inserted = await db.insertAlert({
      wantId: want.id,
      userId: want.userId,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      createdAt: now.toISOString(),
    });
    if (!inserted) continue;

    let href = event.href;
    if (event.sourceType === "post") href = `/posts/${event.sourceId}`;
    else if (event.sourceType === "sale" && db.hrefFor) {
      href = await db.hrefFor(want, event);
    }

    try {
      await db.insertNotification({
        recipientId: want.userId,
        actorId: event.actorId,
        postId: event.sourceType === "post" ? event.sourceId : null,
        preview: wantAlertPreview(event, want),
        href,
      });
      notified += 1;
    } catch {
      await db.deleteAlert(want.id, event.sourceType, event.sourceId);
    }
  }

  return notified;
}
