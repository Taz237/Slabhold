import { notificationAction } from "@/lib/social/group-notifications";
import { notificationHref } from "@/lib/social/notification-href";
import type { NotificationKind } from "@/lib/social/types";
import { pushKindOf, type PushKind, type SourceKind } from "./prefs";
import { dmSummaryLine, pushGroupKey, summaryLine } from "./group";

export type PushPayloadKind = PushKind | "test";

/** What the service worker reads. Version 1. Small: the push services cap it near 4 KB. */
export type PushPayload = {
  v: 1;
  title: string;
  body: string;
  /** Notification tag. A newer push with the same tag replaces the older one. */
  tag: string;
  /** A same-origin path, never a full URL. */
  url: string;
  kind: PushPayloadKind;
  /** Unread notifications plus unread DMs, for the app icon badge. */
  badge: number;
  /** False for quiet replaces (trailing summaries). */
  renotify: boolean;
  /** Event time, ms since epoch. */
  ts: number;
  icon: string;
};

export const MAX_PAYLOAD_BYTES = 3584;
export const FALLBACK_ICON = "/icons/icon-192.png";
export const BADGE_ICON = "/icons/badge-96.png";
export const LIKE_PREVIEW_CHARS = 80;
export const TEXT_PREVIEW_CHARS = 120;
const RETRY_BODY_CHARS = 40;

const ORIGIN = "https://slabhold.invalid";

/** A same-origin path. Full URLs, protocol-relative and backslash tricks become /notifications. */
export function sameOriginPath(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return "/notifications";
  }
  try {
    const parsed = new URL(url, ORIGIN);
    if (parsed.origin !== ORIGIN) return "/notifications";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/notifications";
  }
}

/** Collapse whitespace and cut to `max` characters with an ellipsis. Keeps whole emoji. */
export function truncate(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  return `${chars.slice(0, Math.max(0, max - 1)).join("").trimEnd()}…`;
}

/** The actor's avatar when it is a public https image, else the app icon. */
export function pushIcon(avatarUrl: string | null | undefined): string {
  if (!avatarUrl) return FALLBACK_ICON;
  try {
    const url = new URL(avatarUrl);
    if (url.protocol !== "https:" || url.username || url.password) return FALLBACK_ICON;
    if (!url.pathname.includes("/storage/v1/object/public/")) return FALLBACK_ICON;
    return url.toString();
  } catch {
    return FALLBACK_ICON;
  }
}

const PRIVATE_BODY: Record<PushKind, string> = {
  follow: "New follower",
  like: "New like",
  reply: "New reply",
  repost: "New repost",
  quote: "New quote",
  mention: "New mention",
  dm: "New message",
};

export type PushActor = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

function actorName(actor: PushActor | null): string {
  return actor?.displayName?.trim() || actor?.username?.trim() || "Someone";
}

function urlFor(kind: SourceKind, postId: string | null, actor: PushActor | null): string {
  return sameOriginPath(
    notificationHref({
      kind: kind === "dm" ? "dm" : (kind as NotificationKind),
      postId,
      actorId: actor?.id ?? null,
      actorUsername: actor?.username ?? null,
    }),
  );
}

export type SingleInput = {
  kind: SourceKind;
  actor: PushActor | null;
  postId: string | null;
  /** like/repost: the liked post. reply/mention/quote: the new text. dm: the message. */
  text: string | null;
  messageKind?: "text" | "card_preview" | null;
  showPreviews: boolean;
  badge: number;
  ts: number;
  renotify?: boolean;
};

function singleBody(input: SingleInput, pushKind: PushKind): string {
  if (!input.showPreviews) return PRIVATE_BODY[pushKind];
  if (input.kind === "dm") {
    if (input.messageKind === "card_preview") return "Sent a card";
    return truncate(input.text, TEXT_PREVIEW_CHARS) || "Sent a message";
  }
  const verb = notificationAction(input.kind as NotificationKind);
  if (input.kind === "like" || input.kind === "repost") {
    const preview = truncate(input.text, LIKE_PREVIEW_CHARS);
    return preview ? `${verb}\n${preview}` : verb;
  }
  if (input.kind === "follow") return verb;
  return truncate(input.text, TEXT_PREVIEW_CHARS) || verb;
}

/** One event: the actor's name over what they did. */
export function singlePayload(input: SingleInput): PushPayload {
  const pushKind = pushKindOf(input.kind) ?? "like";
  return {
    v: 1,
    title: actorName(input.actor),
    body: singleBody(input, pushKind),
    tag: pushGroupKey(input.kind, input.postId, input.actor?.id ?? null),
    url: urlFor(input.kind, input.postId, input.actor),
    kind: pushKind,
    badge: Math.max(0, Math.floor(input.badge)),
    renotify: input.renotify ?? true,
    ts: input.ts,
    icon: pushIcon(input.actor?.avatarUrl),
  };
}

export type SummaryInput = {
  kind: SourceKind;
  /** The newest valid actor. Their name leads and their avatar is the icon. */
  lead: PushActor | null;
  /** Names of the newest distinct actors, newest first. Only the first one or two are shown. */
  names: string[];
  /** Distinct valid actors, or for DMs the unread messages from that sender. */
  count: number;
  postId: string | null;
  badge: number;
  ts: number;
};

/** A trailing summary. It replaces the earlier push quietly (renotify false). */
export function summaryPayload(input: SummaryInput): PushPayload {
  const pushKind = pushKindOf(input.kind) ?? "like";
  const body =
    input.kind === "dm"
      ? dmSummaryLine(input.count, actorName(input.lead))
      : summaryLine(input.kind, input.names.length ? input.names : [actorName(input.lead)], input.count);
  return {
    v: 1,
    title: input.kind === "dm" ? actorName(input.lead) : "Slabhold",
    body,
    tag: pushGroupKey(input.kind, input.postId, input.lead?.id ?? null),
    url: urlFor(input.kind, input.postId, input.lead),
    kind: pushKind,
    badge: Math.max(0, Math.floor(input.badge)),
    renotify: false,
    ts: input.ts,
    icon: pushIcon(input.lead?.avatarUrl),
  };
}

export function testPayload(ts: number): PushPayload {
  return {
    v: 1,
    title: "Push notifications are on",
    body: "You'll hear about new followers, likes, replies and messages here.",
    tag: "test",
    url: "/settings/notifications",
    kind: "test",
    badge: 0,
    renotify: true,
    ts,
    icon: FALLBACK_ICON,
  };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** JSON for the wire, trimmed to MAX_PAYLOAD_BYTES by shortening the body, then the title. */
export function encodePayload(payload: PushPayload, maxBytes = MAX_PAYLOAD_BYTES): string {
  let next = { ...payload, url: sameOriginPath(payload.url) };
  let json = JSON.stringify(next);
  while (byteLength(json) > maxBytes && Array.from(next.body).length > 1) {
    next = { ...next, body: truncate(next.body, Math.floor(Array.from(next.body).length * 0.7)) };
    json = JSON.stringify(next);
  }
  while (byteLength(json) > maxBytes && Array.from(next.title).length > 1) {
    next = { ...next, title: truncate(next.title, Math.floor(Array.from(next.title).length * 0.7)) };
    json = JSON.stringify(next);
  }
  if (byteLength(json) > maxBytes) {
    next = { ...next, icon: FALLBACK_ICON };
    json = JSON.stringify(next);
  }
  return json;
}

/** After a 413 from the push service: a much shorter body. */
export function trimmedForRetry(payload: PushPayload): PushPayload {
  return { ...payload, body: truncate(payload.body, RETRY_BODY_CHARS), icon: FALLBACK_ICON };
}
