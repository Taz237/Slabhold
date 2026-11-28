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
  /** notifications.href, set only on want alerts, deal notices and vouch notices. */
  storedHref?: string | null;
  /** The signed-in reader's handle: a vouch notice opens their own vouches page. */
  viewerUsername?: string | null;
  /** metadata.vouch_id on a vouch notice: the page opens at that vouch. */
  vouchId?: string | null;
};

/** "/u/<handle>/vouches" as the database writes it. Anything else in the column is not followed. */
const VOUCHES_PATH = /^\/u\/[A-Za-z0-9_%-]+\/vouches$/;

/**
 * A vouch notice opens a vouches page, at the vouch when its id is known: the reader's own page
 * for "vouched for you", the replier's page for "replied to your vouch". The stored link first,
 * then the handle. With neither (the other account is gone), the reader's profile.
 */
function vouchNoticeHref(target: NotificationTarget): string {
  const { kind, storedHref, actorUsername, viewerUsername, vouchId } = target;
  const owner = kind === "vouch" ? viewerUsername : actorUsername;
  const page = storedHref && VOUCHES_PATH.test(storedHref) ? storedHref : owner ? `${userHref(owner)}/vouches` : null;
  if (!page) return "/profile";
  return vouchId ? `${page}#vouch-${encodeURIComponent(vouchId)}` : page;
}

/**
 * Where a notice opens. The in-app list and push notifications both use this,
 * so a tap lands on the same screen either way: follows open the profile,
 * DMs and DM reactions the chat, quotes the quoting post, vouch notices a vouches page,
 * and the rest the post itself.
 */
export function notificationHref(target: NotificationTarget): string {
  const { kind, postId, actorUsername, storedHref } = target;
  if (kind === "want_alert") {
    return storedHref || (postId ? `/posts/${postId}` : "/collection");
  }
  if (kind === "deal_confirm") {
    return dealNotificationHref(target.actorId ?? null, actorUsername, storedHref);
  }
  if (kind === "dm" || kind === "dm_reaction") return actorUsername ? userHref(actorUsername, "messages") : "/messages";
  if (kind === "follow") return actorUsername ? userHref(actorUsername) : "/profile";
  if (kind === "vouch" || kind === "vouch_reply") return vouchNoticeHref(target);
  return postId ? `/posts/${encodeURIComponent(postId)}` : "/";
}

/** A grouped row's link: its newest notice, with the newest actor. */
export function groupHref(group: NotificationGroup, authors: Map<string, Profile>, viewerUsername?: string | null): string {
  const note = group.notes[0];
  if (!note) return "/";
  const actor = group.actorIds[0] ? authors.get(group.actorIds[0]) : undefined;
  return notificationHref({
    kind: note.kind,
    postId: note.postId,
    actorId: note.actorId,
    actorUsername: actor?.username ?? null,
    storedHref: note.href ?? null,
    viewerUsername: viewerUsername ?? null,
    vouchId: typeof note.metadata?.vouch_id === "string" ? note.metadata.vouch_id : null,
  });
}
