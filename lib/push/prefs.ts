/** What a push is about. `reply` is a `comment` notice in the database. */
export type PushKind = "follow" | "like" | "reply" | "repost" | "quote" | "mention" | "dm";

/** Outbox kinds: the notification kinds that push, plus `dm` for messages. */
export type SourceKind = "follow" | "like" | "comment" | "repost" | "quote" | "mention" | "dm";

export const SOURCE_KINDS: readonly SourceKind[] = [
  "follow",
  "like",
  "comment",
  "repost",
  "quote",
  "mention",
  "dm",
];

export type NotificationPrefs = Record<PushKind, boolean> & {
  showPreviews: boolean;
  quietEnabled: boolean;
  /** "HH:MM", the recipient's local time. */
  quietStart: string;
  quietEnd: string;
  /** IANA zone the quiet hours are in. */
  timeZone: string;
};

/** A missing notification_prefs row means every one of these. */
export const DEFAULT_PREFS: NotificationPrefs = {
  follow: true,
  like: true,
  reply: true,
  repost: true,
  quote: true,
  mention: true,
  dm: true,
  showPreviews: true,
  quietEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  timeZone: "America/New_York",
};

/** Settings → Notifications, top to bottom. */
export const PUSH_TOGGLES: readonly { kind: PushKind; label: string }[] = [
  { kind: "follow", label: "New followers" },
  { kind: "like", label: "Likes" },
  { kind: "reply", label: "Replies" },
  { kind: "repost", label: "Reposts" },
  { kind: "quote", label: "Quotes" },
  { kind: "mention", label: "Mentions" },
  { kind: "dm", label: "Direct messages" },
];

export type PrefsRow = {
  push_follow?: boolean | null;
  push_like?: boolean | null;
  push_reply?: boolean | null;
  push_repost?: boolean | null;
  push_quote?: boolean | null;
  push_mention?: boolean | null;
  push_dm?: boolean | null;
  show_previews?: boolean | null;
  quiet_enabled?: boolean | null;
  quiet_start?: string | null;
  quiet_end?: string | null;
  time_zone?: string | null;
};

export function pushKindOf(kind: string): PushKind | null {
  if (kind === "comment") return "reply";
  if (
    kind === "follow" ||
    kind === "like" ||
    kind === "repost" ||
    kind === "quote" ||
    kind === "mention" ||
    kind === "dm"
  ) {
    return kind;
  }
  return null;
}

/** "22:00:00" from Postgres, or "22:00" from the form. Anything else is null. */
export function clockText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

function flag(value: boolean | null | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function prefsFromRow(row: PrefsRow | null | undefined): NotificationPrefs {
  if (!row) return { ...DEFAULT_PREFS };
  return {
    follow: flag(row.push_follow, DEFAULT_PREFS.follow),
    like: flag(row.push_like, DEFAULT_PREFS.like),
    reply: flag(row.push_reply, DEFAULT_PREFS.reply),
    repost: flag(row.push_repost, DEFAULT_PREFS.repost),
    quote: flag(row.push_quote, DEFAULT_PREFS.quote),
    mention: flag(row.push_mention, DEFAULT_PREFS.mention),
    dm: flag(row.push_dm, DEFAULT_PREFS.dm),
    showPreviews: flag(row.show_previews, DEFAULT_PREFS.showPreviews),
    quietEnabled: flag(row.quiet_enabled, DEFAULT_PREFS.quietEnabled),
    quietStart: clockText(row.quiet_start) ?? DEFAULT_PREFS.quietStart,
    quietEnd: clockText(row.quiet_end) ?? DEFAULT_PREFS.quietEnd,
    timeZone: row.time_zone?.trim() || DEFAULT_PREFS.timeZone,
  };
}

export function prefsToRow(userId: string, prefs: NotificationPrefs) {
  return {
    user_id: userId,
    push_follow: prefs.follow,
    push_like: prefs.like,
    push_reply: prefs.reply,
    push_repost: prefs.repost,
    push_quote: prefs.quote,
    push_mention: prefs.mention,
    push_dm: prefs.dm,
    show_previews: prefs.showPreviews,
    quiet_enabled: prefs.quietEnabled,
    quiet_start: prefs.quietStart,
    quiet_end: prefs.quietEnd,
    time_zone: prefs.timeZone,
    updated_at: new Date().toISOString(),
  };
}

/** The recipient wants this kind pushed. Unknown kinds never push. */
export function kindEnabled(prefs: NotificationPrefs, kind: string): boolean {
  const pushKind = pushKindOf(kind);
  return pushKind ? prefs[pushKind] : false;
}
