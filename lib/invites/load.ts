import "server-only";

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/client";
import {
  COLLECTION_IMAGE_CARD_LIMIT,
  COLLECTION_PAGE_CARD_LIMIT,
  INVITE_CARD_LIMIT,
  readPublicCollector,
} from "./public-collector";

/** Never reads cookies: these pages and images are the same for everyone and cached on a CDN. */
function anonReader(): SupabaseClient | null {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** /i/<username> and its preview: the top 3 public cards with photos. */
export const loadInviteCollector = cache((username: string) =>
  readPublicCollector(anonReader(), username, { cardLimit: INVITE_CARD_LIMIT, withPhotos: true }),
);

/** Collection preview and Story image: the top 6 public cards with photos. */
export const loadCollectionImageCollector = cache((username: string) =>
  readPublicCollector(anonReader(), username, { cardLimit: COLLECTION_IMAGE_CARD_LIMIT, withPhotos: true }),
);

/** /u/<username>/collection: public cards, most valuable first. */
export const loadCollectionCollector = cache((username: string) =>
  readPublicCollector(anonReader(), username, { cardLimit: COLLECTION_PAGE_CARD_LIMIT, withPhotos: false }),
);
