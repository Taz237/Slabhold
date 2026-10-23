import "server-only";

import { notFound } from "next/navigation";
import { offersColumnMissing } from "@/lib/offers/open-to-offers";
import { isUuid } from "@/lib/value/card-value-access";
import { createSupabaseServer } from "@/lib/supabase/server";
import { mapPublicCard, PUBLIC_CARD_SELECT } from "./cards";
import { normalizeUsername } from "./local-db";
import type { OwnedCard, Profile } from "./types";
import {
  missingRecordAction,
  postLookupResult,
  profileLookupResult,
  publicCardLookupResult,
  type RecordLookup,
} from "./missing-record";

function finish(lookup: RecordLookup): void {
  if (missingRecordAction(lookup) === "notFound") notFound();
}

/** /posts/[id]. Local mode (no Supabase) stays on the client page. */
export async function requirePost(id: string): Promise<void> {
  const supabase = await createSupabaseServer();
  if (!supabase) return;
  let error = false;
  let found = false;
  if (isUuid(id)) {
    const result = await supabase.from("posts").select("id").eq("id", id).maybeSingle();
    error = Boolean(result.error);
    found = Boolean(result.data?.id);
  }
  finish(postLookupResult({ configured: true, id, error, found }));
}

/** /u/[username]. A missing profile is a 404. A lookup error is not. */
export async function requireProfile(username: string): Promise<void> {
  const supabase = await createSupabaseServer();
  if (!supabase) return;
  const normalized = normalizeUsername(username);
  let error = false;
  let found = false;
  if (normalized) {
    const result = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalized)
      .maybeSingle();
    error = Boolean(result.error);
    found = Boolean(result.data?.id);
  }
  finish(profileLookupResult({ configured: true, username, error, found }));
}

const PROFILE_COLUMNS =
  "id, username, display_name, bio, avatar_url, cover_url, accent, created_at";

type ProfileLookupRow = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  accent: string | null;
  created_at: string;
};

function mapLookupProfile(row: ProfileLookupRow): Profile {
  return {
    id: row.id,
    email: "",
    username: row.username,
    displayName: row.display_name,
    bio: row.bio ?? "",
    avatarDataUrl: row.avatar_url,
    coverDataUrl: row.cover_url ?? null,
    accent: row.accent ?? "#7c5cff",
    createdAt: row.created_at,
  };
}

export type PublicCardGate = {
  profile: Profile | null;
  card: OwnedCard | null;
};

/** /u/[username]/cards/[id]. Private or wrong-owner cards are a 404. */
export async function requirePublicCard(
  username: string,
  cardId: string,
): Promise<PublicCardGate> {
  const supabase = await createSupabaseServer();
  if (!supabase) return { profile: null, card: null };
  const normalized = normalizeUsername(username);
  let profileError = false;
  let cardError = false;
  let profileId: string | null = null;
  let cardOwnerId: string | null = null;
  let profile: Profile | null = null;
  let card: OwnedCard | null = null;
  if (normalized && isUuid(cardId)) {
    const profilePromise = supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("username", normalized)
      .maybeSingle();
    let cardRes = await supabase
      .from("public_cards")
      .select(`${PUBLIC_CARD_SELECT}, open_to_offers`)
      .eq("id", cardId)
      .maybeSingle();
    if (offersColumnMissing(cardRes.error)) {
      cardRes = await supabase
        .from("public_cards")
        .select(PUBLIC_CARD_SELECT)
        .eq("id", cardId)
        .maybeSingle();
    }
    const profileRes = await profilePromise;
    profileError = Boolean(profileRes.error);
    profileId = (profileRes.data?.id as string | undefined) ?? null;
    if (profileRes.data && !profileError) {
      profile = mapLookupProfile(profileRes.data as ProfileLookupRow);
    }
    cardError = Boolean(cardRes.error);
    cardOwnerId = (cardRes.data?.user_id as string | undefined) ?? null;
    if (cardRes.data && !cardError && profileId && cardOwnerId === profileId) {
      card = mapPublicCard(cardRes.data);
    }
  }
  finish(
    publicCardLookupResult({
      configured: true,
      username,
      cardId,
      profileError,
      cardError,
      profileId,
      cardOwnerId,
    }),
  );
  return { profile, card };
}
