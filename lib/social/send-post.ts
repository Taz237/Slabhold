import type { DirectMessage, Profile } from "./types";
import { MESSAGE_LIMIT } from "./types";
import { postLink } from "./post-dm";

export { ASK_PRICE_TEXT, askPriceDraft, askPriceHref, canAskPrice, canSendPost, postLink } from "./post-dm";
export { dealCardFromThread } from "@/lib/deals/thread-card";

/*
 * Sending a timeline post into someone's DMs. A shared post is a plain text
 * message with the post's link in it: the thread draws the link as a mini card.
 */

/** People listed first in the send sheet: the newest threads. */
export const RECENT_PARTNER_LIMIT = 8;

/** One sheet sends to at most this many people. A soft limit, client side only. */
export const SEND_POST_RECIPIENT_LIMIT = 5;

/** Any Slabhold post link typed in the note, so the message carries exactly one. */
const NOTE_POST_LINK =
  /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?(?:slabhold\.app|slabhold\.vercel\.app)\/posts\/[^\s]*/gi;

/** The note on its own line, then the link. The note is cut so the link always fits. */
export function sharedPostMessage(postId: string, note: string): string {
  const link = postLink(postId);
  const clean = note.replace(NOTE_POST_LINK, " ").replace(/[ \t]+\n/g, "\n").trim();
  if (!clean) return link;
  const room = MESSAGE_LIMIT - link.length - 1;
  const cut = clean.slice(0, Math.max(0, room)).trim();
  return cut ? `${cut}\n${link}` : link;
}

type Safety = {
  viewerId: string;
  blockedIds: readonly string[];
  /** Blocked and muted accounts (the safety list). */
  safetyAccounts: readonly Pick<Profile, "id">[];
};

function allowed(person: Profile, safety: Safety): boolean {
  if (person.id === safety.viewerId) return false;
  if (safety.blockedIds.includes(person.id)) return false;
  return !safety.safetyAccounts.some((account) => account.id === person.id);
}

/**
 * The people a post can go to. With no search: recent DM partners, newest
 * thread first, then people you follow. With a search: anyone matching by
 * name or handle, recent partners first. Blocked and safety accounts never
 * show; someone who blocked you is never loaded, and the send refuses them.
 */
export function sendPostCandidates(input: Safety & {
  messages: readonly DirectMessage[];
  profiles: readonly Profile[];
  following: readonly Profile[];
  query: string;
}): { recent: Profile[]; others: Profile[] } {
  const byId = new Map<string, Profile>();
  for (const person of [...input.profiles, ...input.following]) byId.set(person.id, person);
  const newest = [...input.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recentIds: string[] = [];
  for (const message of newest) {
    const partnerId = message.senderId === input.viewerId ? message.receiverId : message.senderId;
    if (message.senderId !== input.viewerId && message.receiverId !== input.viewerId) continue;
    if (recentIds.includes(partnerId)) continue;
    const person = byId.get(partnerId);
    if (!person || !allowed(person, input)) continue;
    recentIds.push(partnerId);
  }
  const needle = input.query.trim().toLowerCase().replace(/^@/, "");
  const matches = (person: Profile) =>
    !needle ||
    person.username.toLowerCase().includes(needle) ||
    person.displayName.toLowerCase().includes(needle);
  const recent = recentIds
    .map((id) => byId.get(id) as Profile)
    .filter(matches)
    .slice(0, RECENT_PARTNER_LIMIT);
  const shown = new Set(recent.map((person) => person.id));
  const pool = needle ? [...input.following, ...input.profiles] : input.following;
  const others: Profile[] = [];
  for (const person of pool) {
    if (shown.has(person.id) || !allowed(person, input) || !matches(person)) continue;
    shown.add(person.id);
    others.push(person);
  }
  // An exact handle goes first among the rest.
  others.sort((a, b) => Number(b.username.toLowerCase() === needle) - Number(a.username.toLowerCase() === needle));
  return { recent, others: others.slice(0, 20) };
}

/** A search that reads like a handle, worth reading from the server. */
export function handleQuery(query: string): string | null {
  const handle = query.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{2,30}$/.test(handle) ? handle : null;
}
