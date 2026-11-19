"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { loadProfilePublicCards, profileCardsTab } from "@/lib/social/profile-tabs";
import { publicCardKeys } from "@/lib/social/public-card-cache";
import type { OwnedCard, Profile, PublicCard } from "@/lib/social/types";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

/**
 * A profile's public cards, for the carousel on the profile and the grid at
 * /u/<handle>/cards. One place for the visibility rule, so the two can't drift:
 *
 *  - rows come from the public_cards view, which never holds a private card;
 *  - on your own profile, your public book cards fill in one the view doesn't
 *    have yet (profileCardsTab drops anything not marked public);
 *  - a failed read falls back to the shared public card read for this owner.
 *
 * `loaded` is false only until the first read settles (found, empty or
 * failed), so a caller can hold a skeleton and never show "no cards" early.
 */
export function useProfileCards(profile: Profile | null | undefined): {
  collection: PublicCard[];
  loaded: boolean;
  /** The list is the public_cards view's own answer (not the device book or the fallback). */
  fromView: boolean;
  /** Read the cards again (pull to refresh). */
  reload: () => void;
} {
  const { mode, user, publicCards, requestPublicCards } = useSocial();
  const { cards, ready: cardsReady } = useCollection();
  const [viewCards, setViewCards] = useState<{ ownerId: string; rows: OwnedCard[] } | null>(null);
  /** The owner whose read failed: their cards come from the fallback. */
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const ownerId = profile?.id ?? null;
  const isOwn = Boolean(ownerId && user && ownerId === user.id);

  useEffect(() => {
    if (mode !== "supabase" || !ownerId) return;
    let cancelled = false;
    function fallBack() {
      if (cancelled || !ownerId) return;
      setViewCards(null);
      setFailedFor(ownerId);
      // The list then comes from the shared public card read for this owner.
      requestPublicCards(publicCardKeys({ ownerId }));
    }
    void loadSupabaseBrowser()
      .then((supabase) => {
        if (!supabase || cancelled) return;
        void loadProfilePublicCards(supabase, ownerId)
          .then((rows) => {
            if (cancelled) return;
            setFailedFor(null);
            setViewCards({ ownerId, rows });
          })
          .catch(fallBack);
      })
      // supabase-js failed to load: the same fallback as a failed read.
      .catch(fallBack);
    return () => {
      cancelled = true;
    };
  }, [mode, ownerId, refreshKey, requestPublicCards]);

  const collection = useMemo(() => {
    if (!profile) return [] as PublicCard[];
    const sharedFromBook: PublicCard[] = isOwn
      ? cards
          .filter((card) => card.isPublic)
          .map((card) => ({
            id: card.id,
            playerName: card.playerName,
            year: card.year,
            setBrand: card.setBrand,
            cardNumber: card.cardNumber,
            sport: card.sport,
            photoDataUrl: card.photoDataUrl,
            accent: card.accent,
            estimatedSellPrice: card.estimatedSellPrice,
            grade: card.grade,
            parallel: card.parallel,
            purchasePrice: card.purchasePrice,
            openToOffers: card.openToOffers ?? null,
            ownerId: profile.id,
            isPublic: true,
          }))
      : [];
    const listed =
      viewCards && viewCards.ownerId === profile.id
        ? viewCards.rows
        : publicCards.filter((card) => card.ownerId === profile.id);
    return profileCardsTab({
      ownerId: profile.id,
      viewerId: user?.id ?? null,
      publicCards: listed,
      ownBook: sharedFromBook,
    });
  }, [cards, isOwn, profile, publicCards, user?.id, viewCards]);

  const fromView = Boolean(ownerId) && (mode !== "supabase" || viewCards?.ownerId === ownerId);
  const read = fromView || failedFor === ownerId;
  // Your own book is on the device, so your public cards can draw before the view is read.
  const loaded = Boolean(ownerId) && (read || (isOwn && cardsReady && collection.length > 0));
  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);

  return { collection, loaded, fromView, reload };
}
