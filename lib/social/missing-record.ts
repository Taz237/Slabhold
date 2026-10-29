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

type LookupRow = { data: Record<string, unknown> | null; error: { message: string } | null };

/** The slice of a Supabase client the public card lookup reads. */
export type LookupClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): { maybeSingle(): PromiseLike<LookupRow> };
    };
  };
};

/**
 * Profile by username and public card by id, read together. The owner check
 * runs after, so a private card (no public_cards row) or a card under the
 * wrong owner's URL is still "missing".
 */
export async function readPublicCardLookup(
  client: LookupClient | null,
  username: string,
  cardId: string,
): Promise<RecordLookup> {
  if (!client) return "unconfigured";
  const normalized = normalizeUsername(username);
  if (!normalized || !isUuid(cardId)) {
    return publicCardLookupResult({
      configured: true,
      username,
      cardId,
      profileError: false,
      cardError: false,
      profileId: null,
      cardOwnerId: null,
    });
  }
  const [profile, card] = await Promise.all([
    client.from("profiles").select("id").eq("username", normalized).maybeSingle(),
    client.from("public_cards").select("id, user_id").eq("id", cardId).maybeSingle(),
  ]);
  return publicCardLookupResult({
    configured: true,
    username,
    cardId,
    profileError: Boolean(profile.error),
    cardError: Boolean(card.error),
    profileId: (profile.data?.id as string | undefined) ?? null,
    cardOwnerId: (card.data?.user_id as string | undefined) ?? null,
  });
}
