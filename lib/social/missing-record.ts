import { isUuid } from "@/lib/value/card-value-access";
import { normalizeUsername } from "./local-db";

export type RecordLookup = "unconfigured" | "found" | "missing" | "error";

/** A confirmed miss is a real 404. Local mode and lookup errors stay on the page. */
export function missingRecordAction(lookup: RecordLookup): "notFound" | "ok" {
  return lookup === "missing" ? "notFound" : "ok";
}

export function postLookupResult(input: {
  configured: boolean;
  id: string;
  error: boolean;
  found: boolean;
}): RecordLookup {
  if (!input.configured) return "unconfigured";
  if (!isUuid(input.id)) return "missing";
  if (input.error) return "error";
  return input.found ? "found" : "missing";
}

export function profileLookupResult(input: {
  configured: boolean;
  username: string;
  error: boolean;
  found: boolean;
}): RecordLookup {
  if (!input.configured) return "unconfigured";
  if (!normalizeUsername(input.username)) return "missing";
  if (input.error) return "error";
  return input.found ? "found" : "missing";
}

export function publicCardLookupResult(input: {
  configured: boolean;
  username: string;
  cardId: string;
  profileError: boolean;
  cardError: boolean;
  profileId: string | null;
  cardOwnerId: string | null;
}): RecordLookup {
  if (!input.configured) return "unconfigured";
  if (!normalizeUsername(input.username) || !isUuid(input.cardId)) return "missing";
  if (input.profileError || input.cardError) return "error";
  if (!input.profileId || input.cardOwnerId !== input.profileId) return "missing";
  return "found";
}

/**
 * A signed-in viewer must not receive a card whose owner is in hidden_author_ids.
 * Signed-out visitors are not checked. An owner missing from that list stays public.
 */
export function hiddenOwnerNotFound(input: {
  viewerId: string | null;
  ownerId: string | null;
  hiddenAuthorIds: readonly string[];
}): boolean {
  if (!input.viewerId || !input.ownerId) return false;
  return input.hiddenAuthorIds.includes(input.ownerId);
}
