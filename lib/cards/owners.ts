import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import {
  assembleCardPeople,
  emptyPeople,
  type HunterCandidate,
  type OwnerCandidate,
  type OwnersAndHunters,
} from "@/lib/cards/people";
import { cardIdentityKey, type IdentityCard } from "@/lib/social/card-identity";
import { ilikeExact } from "@/lib/social/username-taken";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isUuid } from "@/lib/value/card-value-access";

/**
 * Owners and hunters for one card identity.
 *
 * Owners are distinct users with a matching row in public_cards (a public
 * copy). That view already drops private cards. A row marked collection_public
 * false is a private collection and is dropped too. There is no collection
 * privacy column today, so public_cards rows stay eligible.
 *
 * Hunters are distinct users with this card_key on a public want list.
 * want_list has no public flag and RLS is owner-only, so a row counts only
 * when it is explicitly is_public. Anon has no select grant. A failed want
 * read omits the Hunters section instead of loosening RLS.
 *
 * Counts use the same filters as the lists. The viewer is counted and not listed.
 * Signed-out reads use the anon key and may be cached. Signed-in reads use the
 * viewer's session and are not shared-cached. The service role is not used.
 */

const LIST_CAP = 1000;

const CARD_COLUMNS = [
  "id",
  "user_id",
  "player",
  "year",
  "year_label",
  "set",
  "set_name",
  "grade",
  "grader",
  "parallel",
  "condition_type",
  "card_number",
  "is_public",
  "created_at",
  "updated_at",
].join(", ");

type Row = Record<string, unknown>;

type DbError = { message: string; code?: string } | null;

export type PeopleQuery = {
  select(columns: string): PeopleQuery;
  eq(column: string, value: string): PeopleQuery;
  ilike(column: string, value: string): PeopleQuery;
  in(column: string, values: readonly string[]): PeopleQuery;
  limit(count: number): PeopleQuery;
  maybeSingle(): Promise<{ data: Row | null; error: DbError }>;
  then<T>(
    resolve: (value: { data: Row[] | null; error: DbError }) => T,
    reject?: (reason: unknown) => T,
  ): Promise<T>;
};

export type PeopleDb = {
  from(table: string): PeopleQuery;
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: DbError }>;
};

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function conditionOf(value: unknown): IdentityCard["conditionType"] {
  if (value === "raw" || value === "graded") return value;
  return undefined;
}

/** Same identity want_list.card_key uses: cardIdentityKey, not the row id. */
export function identityKeyFromRow(row: Row): string {
  return cardIdentityKey({
    playerName: text(row.player),
    year: Number(row.year) || 0,
    yearLabel: text(row.year_label),
    setBrand: text(row.set_name) || text(row.set),
    cardNumber: text(row.card_number),
    parallel: text(row.parallel),
    grade: text(row.grade),
    grader: text(row.grader),
    conditionType: conditionOf(row.condition_type),
  });
}

function stamp(row: Row): string {
  const updated = text(row.updated_at);
  if (updated) return updated;
  return text(row.created_at);
}

function denied(error: DbError): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === "42501" || message.includes("permission") || message.includes("not authorized");
}

function missingRpc(error: DbError): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || /could not find the function/i.test(error.message);
}

/**
 * Launch step 2 did not add an unconfirmed-user visibility helper.
 * Profiles the viewer can read stay listed unless a row is explicitly hidden.
 */
function profileIsPublic(row: Row): boolean {
  return row.publicly_visible !== false;
}

function anonClient(): PeopleDb | null {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as PeopleDb;
}

async function identityKeyForCard(client: PeopleDb, cardId: string): Promise<string | null> {
  const pub = await client.from("public_cards").select(CARD_COLUMNS).eq("id", cardId).maybeSingle();
  if (pub.data) return identityKeyFromRow(pub.data);
  const own = await client.from("cards").select(CARD_COLUMNS).eq("id", cardId).maybeSingle();
  if (own.data) return identityKeyFromRow(own.data);
  return null;
}

async function readOwnersAndHunters(
  client: PeopleDb | null,
  identityKey: string,
  viewerId: string | null,
): Promise<OwnersAndHunters> {
  const player = identityKey.split("|")[0]?.trim() ?? "";
  if (!client || !player) return emptyPeople(Boolean(viewerId));

  const [cardsRes, wantsRes, blocksRes, mutesRes, followsRes] = await Promise.all([
    client.from("public_cards").select(CARD_COLUMNS).ilike("player", ilikeExact(player)).limit(LIST_CAP),
    client
      .from("want_list")
      .select("user_id, card_key, created_at")
      .eq("card_key", identityKey)
      .limit(LIST_CAP),
    viewerId
      ? client.from("blocks").select("blocked_id").eq("blocker_id", viewerId)
      : Promise.resolve({ data: [] as Row[], error: null }),
    viewerId
      ? client.from("mutes").select("muted_id").eq("muter_id", viewerId)
      : Promise.resolve({ data: [] as Row[], error: null }),
    viewerId
      ? client.from("follows").select("following_id").eq("follower_id", viewerId)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);

  if (cardsRes.error) {
    console.warn("[card-people] public cards failed:", cardsRes.error.message);
  }

  const cardRows = cardsRes.error ? [] : (cardsRes.data ?? []);
  const huntersReadable = !wantsRes.error;
  const wantRows = huntersReadable ? (wantsRes.data ?? []) : [];
  if (wantsRes.error && !denied(wantsRes.error)) {
    console.warn("[card-people] want list unreadable:", wantsRes.error.message);
  }

  const blocked = new Set<string>();
  if (!blocksRes.error) {
    for (const row of blocksRes.data ?? []) {
      const id = text(row.blocked_id);
      if (id) blocked.add(id);
    }
  }
  const muted = new Set<string>();
  if (!mutesRes.error) {
    for (const row of mutesRes.data ?? []) {
      const id = text(row.muted_id);
      if (id) muted.add(id);
    }
  }
  const followed = new Set<string>();
  if (!followsRes.error) {
    for (const row of followsRes.data ?? []) {
      const id = text(row.following_id);
      if (id) followed.add(id);
    }
  }

  const userIds = new Set<string>();
  for (const row of cardRows) {
    if (identityKeyFromRow(row) !== identityKey) continue;
    const id = text(row.user_id);
    if (id) userIds.add(id);
  }
  for (const row of wantRows) {
    if (text(row.card_key) !== identityKey) continue;
    const id = text(row.user_id);
    if (id) userIds.add(id);
  }

  if (viewerId) {
    await Promise.all(
      [...userIds].map(async (id) => {
        if (id === viewerId || blocked.has(id)) return;
        const { data, error } = await client.rpc("can_interact", { other: id });
        if (missingRpc(error)) return;
        if (error || data !== true) blocked.add(id);
      }),
    );
  }

  const profiles = new Map<string, Row>();
  if (userIds.size > 0) {
    const profileRes = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", [...userIds]);
    if (profileRes.error) {
      console.warn("[card-people] profiles failed:", profileRes.error.message);
    } else {
      for (const row of profileRes.data ?? []) {
        const id = text(row.id);
        if (id) profiles.set(id, row);
      }
    }
  }

  function flags(userId: string, activeAt: string): OwnerCandidate | null {
    const profile = profiles.get(userId);
    if (!profile) return null;
    const handle = text(profile.username).trim().toLowerCase();
    if (!handle) return null;
    return {
      userId,
      activeAt,
      handle,
      displayName: text(profile.display_name).trim() || handle,
      avatarUrl: text(profile.avatar_url) || null,
      publiclyVisible: profileIsPublic(profile),
      blocked: blocked.has(userId),
      muted: muted.has(userId),
      followed: followed.has(userId),
      identityKey,
      cardPublic: true,
      collectionPublic: true,
    };
  }

  const owners: OwnerCandidate[] = [];
  for (const row of cardRows) {
    if (identityKeyFromRow(row) !== identityKey) continue;
    const userId = text(row.user_id);
    const base = userId ? flags(userId, stamp(row)) : null;
    if (!base) continue;
    owners.push({
      ...base,
      cardPublic: row.is_public !== false,
      collectionPublic: row.collection_public !== false,
    });
  }

  const hunters: HunterCandidate[] = [];
  for (const row of wantRows) {
    if (text(row.card_key) !== identityKey) continue;
    const userId = text(row.user_id);
    const base = userId ? flags(userId, stamp(row)) : null;
    if (!base) continue;
    hunters.push({
      ...base,
      wantPublic: row.is_public === true,
    });
  }

  return assembleCardPeople({
    identityKey,
    viewerId,
    owners,
    hunters,
    huntersReadable,
  });
}

/**
 * Distinct public owners and public hunters for this card identity.
 * Pass `client` from tests. Signed-out production reads are cached.
 * Signed-in production reads use the viewer's cookies and are not cached.
 */
export async function getOwnersAndHunters(
  identityKey: string,
  viewerId: string | null,
  client?: PeopleDb | null,
): Promise<OwnersAndHunters> {
  if (client !== undefined) return readOwnersAndHunters(client, identityKey, viewerId);
  if (!viewerId) {
    return unstable_cache(
      async () => readOwnersAndHunters(anonClient(), identityKey, null),
      ["card-owners-hunters", identityKey],
      { revalidate: 120 },
    )();
  }
  const supabase = await createSupabaseServer();
  return readOwnersAndHunters(supabase as unknown as PeopleDb | null, identityKey, viewerId);
}

/** Card page loader. Null when Supabase is off or the id is still local. */
export async function loadCardPeople(cardId: string): Promise<OwnersAndHunters | null> {
  const id = cardId.trim();
  if (!isUuid(id)) return null;
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    const viewerId = data.user?.id ?? null;
    const client = supabase as unknown as PeopleDb;
    const key = await identityKeyForCard(client, id);
    if (!key) return emptyPeople(Boolean(viewerId));
    if (viewerId) return readOwnersAndHunters(client, key, viewerId);
    return getOwnersAndHunters(key, null);
  } catch (error) {
    console.warn(
      "[card-people] load failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return null;
  }
}
