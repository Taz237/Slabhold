import { money } from "@/lib/format";
import { openOfferAlert, withOpenOfferPreview } from "@/lib/offers/open-to-offers";
import { canNotify, type SafetyRelations } from "@/lib/safety/can-notify";
import { effectiveTarget, targetFlag } from "./effective-target";
import { newYorkDayStartIso } from "./ny-day";

export const WANT_ALERTS_PER_DAY = 20;

/**
 * Per alert type, for one actor and card_key. A listing is not cooled by a
 * card or a post. Sales are outside these windows.
 */
export const WANT_ACTOR_CARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type CooledAlertType = "card" | "listing" | "post";

export type ActorCardAlertQuery = {
  userId: string;
  cardKey: string;
  actorId: string;
  sinceIso: string;
};

export type ActorCardNotification = {
  id: string;
  createdAt: string;
  metadata: unknown;
};

export type InsertedNotification = {
  id: string;
  createdAt: string;
};

export function cooledAlertType(sourceType: WantSourceType): CooledAlertType | null {
  if (sourceType === "card" || sourceType === "listing" || sourceType === "post") {
    return sourceType;
  }
  return null;
}

/** Mail Day shares the post window. Sales do not match. */
export function metadataCooledType(metadata: unknown): CooledAlertType | null {
  if (!metadata || typeof metadata !== "object") return null;
  const source = (metadata as { source?: unknown }).source;
  if (source === "card" || source === "listing" || source === "post") return source;
  if (source === "mail_day") return "post";
  return null;
}

export function sameCooledAlert(
  metadata: unknown,
  cardKey: string,
  alertType: CooledAlertType,
): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const record = metadata as { card_key?: unknown };
  if (record.card_key !== cardKey) return false;
  return metadataCooledType(metadata) === alertType;
}

/** True when `row` sorts before `mine` by (created_at, id). */
export function notificationComesFirst(
  row: { id: string; createdAt: string },
  mine: { id: string; createdAt: string },
): boolean {
  if (row.id === mine.id) return false;
  if (row.createdAt < mine.createdAt) return true;
  if (row.createdAt > mine.createdAt) return false;
  return row.id < mine.id;
}

export type WantSourceType = "sale" | "post" | "listing" | "card";

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
  /** Listing URL for a sale alert. */
  saleUrl?: string | null;
  /** Rounded p25 for this card identity. Used when the want has no target. */
  fairLow?: number | null;
  /** Mail Day posts alert followers only, with different copy. */
  mailDay?: boolean;
  followersOnly?: boolean;
  /** Public Mail Day cards can compare a stored value to the target. */
  cardIsPublic?: boolean;
  cardValue?: number | null;
  /** True only when this owner's public card is open to offers. */
  openToOffers?: boolean | null;
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
  metadata?: Record<string, unknown> | null;
};

export type WantAlertInsert = {
  wantId: string;
  userId: string;
  sourceType: WantSourceType;
  sourceId: string;
  /** Mail Day card. Null for sales and listings, which dedupe on source id alone. */
  cardId?: string | null;
  createdAt: string;
};

export type WantAlertDb = {
  wantsForKey(cardKey: string): Promise<WantRow[]>;
  alertsToday(userId: string, sinceIso: string): Promise<number>;
  /** True only when a new dedupe row was inserted. */
  insertAlert(row: WantAlertInsert): Promise<boolean>;
  /** Returns the stored notification id and created_at. */
  insertNotification(row: WantNotificationInsert): Promise<InsertedNotification>;
  deleteNotification(id: string): Promise<void>;
  /**
   * Want alerts this wanter already has from this actor at or after sinceIso.
   * Includes the row just inserted. Caller matches card_key and alert type.
   */
  actorCardAlerts(query: ActorCardAlertQuery): Promise<ActorCardNotification[]>;
  deleteAlert(
    wantId: string,
    sourceType: WantSourceType,
    sourceId: string,
    cardId?: string | null,
  ): Promise<void>;
  /** Sale links can differ per wanter. Posts and listings ignore this. */
  hrefFor?(want: WantRow, event: WantMatchEvent): Promise<string>;
  /** True when userId follows actorId. */
  isFollower?(userId: string, actorId: string): Promise<boolean>;
  /** When set, a blocked or muted actor does not notify. */
  safety?: SafetyRelations;
};

export function wantAlertPreview(event: WantMatchEvent, want: WantRow): string {
  return withOpenOfferPreview(wantAlertPreviewBody(event, want), event);
}

function wantAlertPreviewBody(event: WantMatchEvent, want: WantRow): string {
  const target = effectiveTarget(want.targetPrice, event.fairLow);
  if (event.sourceType === "sale") {
    const sold = `${event.label} sold for ${money(event.price ?? 0)}`;
    if (target == null) return sold;
    return `${sold}, at or under your ${money(target)} target`;
  }
  const who = event.actorUsername
    ? `@${event.actorUsername.replace(/^@/, "")}`
    : "Someone";
  if (event.mailDay || event.sourceType === "card") return mailDayPreview(who, event, target);
  if (event.sourceType === "post") return `${who} posted a ${event.label} you want`;
  return `${who} listed a ${event.label} you want`;
}

function mailDayPreview(who: string, event: WantMatchEvent, target: number | null): string {
  const base = `${who} just got a ${event.label} you want`;
  const flag = mailDayFlag(event, target);
  if (!flag || target == null) return base;
  return `${base}, ${flag} your ${money(target)} target`;
}

/** Public cards with a stored value get below / at / above. Private cards do not. */
export function mailDayFlag(
  event: WantMatchEvent,
  target: number | null,
): "below" | "at" | "above" | null {
  if (!event.cardIsPublic) return null;
  if (event.cardValue == null || !Number.isFinite(event.cardValue)) return null;
  if (target == null) return null;
  return targetFlag(event.cardValue, target);
}

export function wantAlertMetadata(
  event: WantMatchEvent,
  want: WantRow,
): Record<string, unknown> {
  const target = effectiveTarget(want.targetPrice, event.fairLow);
  if (event.sourceType === "sale") {
    return {
      card_key: event.cardKey,
      sale_price: event.price ?? null,
      target,
      source: "sale",
      sold_at: event.soldAt ?? null,
      url: event.saleUrl ?? null,
    };
  }
  if (event.mailDay || event.sourceType === "card") {
    const flag = mailDayFlag(event, target);
    const metadata: Record<string, unknown> = {
      card_key: event.cardKey,
      source: event.sourceType === "card" ? "card" : "mail_day",
      target,
    };
    if (flag) {
      metadata.flag = flag;
      metadata.value = event.cardValue;
    }
    return metadata;
  }
  return { card_key: event.cardKey, source: event.sourceType };
}

/** A sale alerts only when it closed after the want and meets the effective target. */
export function saleQualifies(want: WantRow, event: WantMatchEvent): boolean {
  if (event.sourceType !== "sale") return true;
  if (event.price == null || !Number.isFinite(event.price)) return false;
  if (!event.soldAt) return false;
  const sold = new Date(event.soldAt).getTime();
  const created = new Date(want.createdAt).getTime();
  if (!Number.isFinite(sold) || !Number.isFinite(created) || sold <= created) return false;
  const target = effectiveTarget(want.targetPrice, event.fairLow);
  if (target == null) return false;
  return event.price <= target;
}

/**
 * Insert a want_alerts row first. Create the notification only when that insert
 * is new. Skips the actor's own post or listing and stops at the daily cap.
 * Card, listing, and post each keep their own 24 hour window for one actor and
 * card. After the insert, the earliest (created_at, id) row of that type wins
 * so parallel copies cannot all alert. A failed re-check keeps that alert.
 * Price drops are not cooled.
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
    if (event.followersOnly) {
      if (!event.actorId || !db.isFollower) continue;
      const follows = await db.isFollower(want.userId, event.actorId);
      if (!follows) continue;
    }
    if (event.actorId && db.safety) {
      const allowed = await canNotify(db.safety, event.actorId, want.userId);
      if (!allowed) continue;
    }
    if (!saleQualifies(want, event)) continue;

    const today = await db.alertsToday(want.userId, since);
    if (today >= WANT_ALERTS_PER_DAY) continue;

    const alertType = cooledAlertType(event.sourceType);
    const sinceActor = new Date(now.getTime() - WANT_ACTOR_CARD_COOLDOWN_MS).toISOString();
    const actorQuery: ActorCardAlertQuery | null =
      event.actorId && alertType
        ? {
            userId: want.userId,
            cardKey: event.cardKey,
            actorId: event.actorId,
            sinceIso: sinceActor,
          }
        : null;
    if (actorQuery && alertType) {
      const prior = await db.actorCardAlerts(actorQuery);
      const cooled = prior.some((row) => sameCooledAlert(row.metadata, event.cardKey, alertType));
      if (cooled) continue;
    }

    const alertCardId =
      event.mailDay || event.sourceType === "card" ? (event.cardId ?? null) : null;
    const inserted = await db.insertAlert({
      wantId: want.id,
      userId: want.userId,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      cardId: alertCardId,
      createdAt: now.toISOString(),
    });
    if (!inserted) continue;

    let href = event.href;
    if (event.sourceType === "post") href = `/posts/${event.sourceId}`;
    else if (event.sourceType === "sale" && db.hrefFor) {
      href = await db.hrefFor(want, event);
    }

    const metadata = wantAlertMetadata(event, want);
    const offer = openOfferAlert(event);
    if (offer) {
      metadata.open_to_offers = true;
      metadata.message_owner_href = offer.href;
    }

    const notification: WantNotificationInsert = {
      recipientId: want.userId,
      actorId: event.actorId,
      postId: event.sourceType === "post" ? event.sourceId : null,
      preview: wantAlertPreview(event, want),
      href,
      metadata,
    };

    let noteId: string | null = null;
    try {
      const note = await db.insertNotification(notification);
      noteId = note.id;
      if (actorQuery && alertType) {
        let claimed: ActorCardNotification[];
        try {
          claimed = await db.actorCardAlerts(actorQuery);
        } catch {
          notified += 1;
          continue;
        }
        const lost = claimed.some(
          (row) =>
            sameCooledAlert(row.metadata, event.cardKey, alertType) &&
            notificationComesFirst(row, note),
        );
        if (lost) {
          await db.deleteNotification(note.id);
          await db.deleteAlert(want.id, event.sourceType, event.sourceId, alertCardId);
          continue;
        }
      }
      notified += 1;
    } catch {
      try {
        if (noteId) await db.deleteNotification(noteId);
      } catch {
        // Still remove the alert row so it does not count toward the daily cap.
      }
      try {
        await db.deleteAlert(want.id, event.sourceType, event.sourceId, alertCardId);
      } catch {
        // One wanter's cleanup must not stop alerts for the rest.
      }
    }
  }

  return notified;
}
