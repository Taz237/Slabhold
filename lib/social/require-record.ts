import "server-only";

import { notFound } from "next/navigation";
import { isUuid } from "@/lib/value/card-value-access";
import { createSupabaseServer } from "@/lib/supabase/server";
import { normalizeUsername } from "./local-db";
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

/** /u/[username]/cards/[id]. Private or wrong-owner cards are a 404. */
export async function requirePublicCard(username: string, cardId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  if (!supabase) return;
  const normalized = normalizeUsername(username);
  let profileError = false;
  let cardError = false;
  let profileId: string | null = null;
  let cardOwnerId: string | null = null;
  if (normalized && isUuid(cardId)) {
    const profile = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalized)
      .maybeSingle();
    profileError = Boolean(profile.error);
    profileId = (profile.data?.id as string | undefined) ?? null;
    if (profileId && !profileError) {
      const card = await supabase
        .from("public_cards")
        .select("id, user_id")
        .eq("id", cardId)
        .maybeSingle();
      cardError = Boolean(card.error);
      cardOwnerId = (card.data?.user_id as string | undefined) ?? null;
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
}
