import { dealNotificationHref } from "@/lib/deals/state";
import type { NotificationGroup } from "./group-notifications";
import type { NotificationKind, Profile } from "./types";
import { userHref } from "./user-href";

/** What a notice points at. Push payloads add `dm` for direct messages. */
export type NotificationTarget = {
  kind: NotificationKind | "dm";
  postId: string | null;
  actorId?: string | null;
  actorUsername?: string | null;
  /** notifications.href, set only on want alerts and deal notices. */
  storedHref?: string | null;
};

/**
 * Where a notice opens. The in-app list and push notifications both use this,
 * so a tap lands on the same screen either way: follows open the profile,
 * DMs the chat, quotes the quoting post, and the rest the post itself.
 */
export function notificationHref(target: NotificationTarget): string {
  const { kind, postId, actorUsername, storedHref } = target;
  if (kind === "want_alert") {
    return storedHref || (postId ? `/posts/${postId}` : "/collection");
  }
  if (kind === "deal_confirm") {
    return dealNotificationHref(target.actorId ?? null, actorUsername, storedHref);
  }
  if (kind === "dm") return actorUsername ? userHref(actorUsername, "messages") : "/messages";
  if (kind === "follow") return actorUsername ? userHref(actorUsername) : "/profile";
  return postId ? `/posts/${encodeURIComponent(postId)}` : "/";
}

/** A grouped row's link: its newest notice, with the newest actor. */
export function groupHref(group: NotificationGroup, authors: Map<string, Profile>): string {
  const note = group.notes[0];
  if (!note) return "/";
  const actor = group.actorIds[0] ? authors.get(group.actorIds[0]) : undefined;
  return notificationHref({
    kind: note.kind,
    postId: note.postId,
    actorId: note.actorId,
    actorUsername: actor?.username ?? null,
    storedHref: note.href ?? null,
  });
}
