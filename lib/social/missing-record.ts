import { isUuid } from "@/lib/value/card-value-access";
import { mapPublicCard } from "./cards";
import { normalizeUsername } from "./local-db";
import type { OwnedCard } from "./types";

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

/** The owner fields the public card page may cache in its HTML. */
export type PublicCardOwner = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

/** The lookup plus the card and owner, set only when the lookup is "found". */
export type PublicCardPage = {
  lookup: RecordLookup;
  card: OwnedCard | null;
  owner: PublicCardOwner | null;
};

/**
 * Profile by username and public card by id, read together. The owner check
 * runs after, so a private card (no public_cards row) or a card under the
 * wrong owner's URL is still "missing". Only public_cards columns and public
 * profile fields come back, so the result is safe to cache for everyone.
 */
export async function readPublicCardPage(
  client: LookupClient | null,
  username: string,
  cardId: string,
): Promise<PublicCardPage> {
  const miss = (lookup: RecordLookup): PublicCardPage => ({ lookup, card: null, owner: null });
  if (!client) return miss("unconfigured");
  const normalized = normalizeUsername(username);
  if (!normalized || !isUuid(cardId)) {
    return miss(
      publicCardLookupResult({
        configured: true,
        username,
        cardId,
        profileError: false,
        cardError: false,
        profileId: null,
        cardOwnerId: null,
      }),
    );
  }
  const [profile, card] = await Promise.all([
    client.from("profiles").select("id, username, display_name, avatar_url").eq("username", normalized).maybeSingle(),
    // The same columns the social snapshot reads, so the swap to it changes nothing.
    client.from("public_cards").select("*").eq("id", cardId).maybeSingle(),
  ]);
  const lookup = publicCardLookupResult({
    configured: true,
    username,
    cardId,
    profileError: Boolean(profile.error),
    cardError: Boolean(card.error),
    profileId: (profile.data?.id as string | undefined) ?? null,
    cardOwnerId: (card.data?.user_id as string | undefined) ?? null,
  });
  if (lookup !== "found" || !profile.data || !card.data) return miss(lookup);
  return {
    lookup,
    card: mapPublicCard(card.data as Parameters<typeof mapPublicCard>[0]),
    owner: {
      id: profile.data.id as string,
      username: String(profile.data.username ?? normalized),
      displayName: String(profile.data.display_name ?? profile.data.username ?? normalized),
      avatarUrl: (profile.data.avatar_url as string | null | undefined) ?? null,
    },
  };
}

export async function readPublicCardLookup(
  client: LookupClient | null,
  username: string,
  cardId: string,
): Promise<RecordLookup> {
  return (await readPublicCardPage(client, username, cardId)).lookup;
}
