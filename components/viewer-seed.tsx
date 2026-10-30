"use client";

import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import type { ViewerSeed } from "@/lib/collection/viewer-seed";
import { forwardActions, LatestValue } from "@/lib/ui/forward-actions";

/**
 * Collection and a card page, drawn from the server's read of the viewer and
 * their cards until both providers have loaded their own. Inert meanwhile,
 * so nothing acts on it. The providers' elements and the wrapper stay put,
 * so the hand-over re-renders the same tree and nothing remounts.
 */
export function SeededViewer({ seed, children }: { seed: ViewerSeed | null; children?: ReactNode }) {
  const social = useContext(SocialContext);
  const collection = useContext(CollectionContext);
  if (!social || !collection) throw new Error("SeededViewer must be used inside the app providers");
  const [handedOver, setHandedOver] = useState(false);
  if (social.ready && collection.ready && !handedOver) setHandedOver(true);
  const seeded = Boolean(seed) && !handedOver;

  // Read by the forwarded actions when they run, never during render.
  const [liveSocial] = useState(() => new LatestValue(social));
  const [liveCollection] = useState(() => new LatestValue(collection));
  useEffect(() => liveSocial.set(social), [liveSocial, social]);
  useEffect(() => liveCollection.set(collection), [liveCollection, collection]);
  const [firstSocial] = useState(social);
  const [firstCollection] = useState(collection);

  const seededSocial = useMemo(
    () => (seed ? { ...forwardActions(firstSocial, () => liveSocial.get()), user: seed.viewer } : null),
    [firstSocial, liveSocial, seed],
  );
  const seededCollection = useMemo(() => {
    if (!seed) return null;
    const byId = new Map(seed.cards.map((card) => [card.id, card]));
    return {
      ...forwardActions(firstCollection, () => liveCollection.get()),
      ready: true,
      cards: seed.cards,
      syncError: null,
      getCard: (id: string) => byId.get(id),
    };
  }, [firstCollection, liveCollection, seed]);

  return (
    <SocialContext.Provider value={seeded && seededSocial ? seededSocial : social}>
      <CollectionContext.Provider value={seeded && seededCollection ? seededCollection : collection}>
        <div
          inert={seeded}
          aria-busy={seeded || undefined}
          data-seeded-viewer={seeded ? "" : undefined}
          className="contents"
        >
          {children}
        </div>
      </CollectionContext.Provider>
    </SocialContext.Provider>
  );
}
