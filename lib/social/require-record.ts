import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { createAnonReader } from "@/lib/supabase/anon";
import { cardCacheTag, cardVisibilityTag } from "@/lib/value/card-cache";
import { isUuid } from "@/lib/value/card-value-access";
import { createSupabaseServer } from "@/lib/supabase/server";
import { normalizeUsername } from "./local-db";
import {
  missingRecordAction,
  postLookupResult,
  profileLookupResult,
  readPublicCardLookup,
  type LookupClient,
  type RecordLookup,
} from "./missing-record";

/** The public card page's ISR window. A page export must be a literal, so it repeats this. */
export const PUBLIC_CARD_REVALIDATE_SECONDS = 300;

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

/**
 * /u/[username]/cards/[id]. Private or wrong-owner cards are a 404.
 * Cookie-free, so the page is ISR. The read carries `card:${id}` and
 * `card-visibility:${id}`, so a revalidate of either also refreshes the
 * page. React.cache shares it within one render.
 */
export const requirePublicCard = cache(async (username: string, cardId: string): Promise<void> => {
  const lookup = await unstable_cache(
    () => readPublicCardLookup(createAnonReader() as LookupClient | null, username, cardId),
    ["public-card-lookup", normalizeUsername(username), cardId],
    { tags: [cardCacheTag(cardId), cardVisibilityTag(cardId)], revalidate: PUBLIC_CARD_REVALIDATE_SECONDS },
  )();
  finish(lookup);
});
