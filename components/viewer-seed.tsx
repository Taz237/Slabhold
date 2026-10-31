"use client";

import { useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { CollectionContext, type SavedCard } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { SEEDED_SOCIAL_ACTIONS } from "@/lib/social/seeded-actions";
import type { ViewerSeed } from "@/lib/collection/viewer-seed";
import type { SportsCard } from "@/lib/types";
import { ActionQueue, forwardActions, LatestValue } from "@/lib/ui/forward-actions";

/** Collection functions that change data. updateCard is handled on its own below. */
const COLLECTION_ACTIONS: ReadonlySet<string> = new Set(["removeCard", "reload"]);

/**
 * Collection and a card page, drawn from the server's read of the viewer and
 * their cards until both providers have loaded their own. Fully usable
 * meanwhile: links are plain links, and a change (a card edit, a delete, a
 * follow) is held and replayed once the providers are ready; a card edit
 * shows on the seeded card at once. The providers' elements and the wrapper
 * stay put, so the hand-over re-renders the same tree and nothing remounts.
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
  const [queue] = useState(() => new ActionQueue());
  useLayoutEffect(() => liveSocial.set(social), [liveSocial, social]);
  useLayoutEffect(() => liveCollection.set(collection), [liveCollection, collection]);
  // After the live values above, so replayed changes reach the ready providers.
  // A layout effect, so a replayed change lands before the handed-over frame paints.
  useLayoutEffect(() => {
    if (handedOver) queue.flush();
  }, [handedOver, queue]);
  const [firstSocial] = useState(social);
  const [firstCollection] = useState(collection);
  /** Card edits made before the hand-over, shown on the seeded cards right away. */
  const [edits, setEdits] = useState<ReadonlyMap<string, Partial<SportsCard>>>(() => new Map());

  const seededSocial = useMemo(
    () =>
      seed
        ? { ...forwardActions(firstSocial, () => liveSocial.get(), queue, SEEDED_SOCIAL_ACTIONS), user: seed.viewer }
        : null,
    [firstSocial, liveSocial, queue, seed],
  );
  const seededCollection = useMemo(() => {
    if (!seed) return null;
    const cards = seed.cards.map((card) => {
      const edit = edits.get(card.id);
      return edit ? { ...card, ...edit } : card;
    });
    const byId = new Map(cards.map((card) => [card.id, card]));
    return {
      ...forwardActions(firstCollection, () => liveCollection.get(), queue, COLLECTION_ACTIONS),
      ready: true,
      cards,
      syncError: null,
      getCard: (id: string) => byId.get(id),
      updateCard: (id: string, patch: Partial<SportsCard>): SavedCard => {
        if (queue.open) return liveCollection.get().updateCard(id, patch);
        setEdits((current) => new Map(current).set(id, { ...current.get(id), ...patch }));
        const saved = queue.run(() => liveCollection.get().updateCard(id, patch).saved);
        void saved.catch(() => undefined);
        return { card: { ...(byId.get(id) as SportsCard), ...patch }, saved };
      },
    };
  }, [edits, firstCollection, liveCollection, queue, seed]);

  return (
    <SocialContext.Provider value={seeded && seededSocial ? seededSocial : social}>
      <CollectionContext.Provider value={seeded && seededCollection ? seededCollection : collection}>
        <div data-seeded-viewer={seeded ? "" : undefined} className="contents">
          {children}
        </div>
      </CollectionContext.Provider>
    </SocialContext.Provider>
  );
}
