"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import { mergeCategories } from "@/lib/card-category";
import { loadUserCards, removeUserCard, saveUserCard } from "@/lib/social/cards";
import { isSaveTimeout } from "@/lib/save/attempt";
import { loadCollection, newId, nextAccent, saveCollection } from "@/lib/storage";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import type { CardInput, SportsCard } from "@/lib/types";
import { shouldRefreshCardValueOnEdit } from "@/lib/value/price-refresh";
import { scheduleCardValueRefresh } from "@/lib/value/use-card-values";
import { isPublicForSaleListing } from "@/lib/wants/listing";
import { pingWantMatch } from "@/lib/wants/ping";

export type SavedCard = {
  card: SportsCard;
  /** Settles when the queued save finishes. Rejects if that save fails. */
  saved: Promise<void>;
};

type CollectionContextValue = {
  ready: boolean;
  cards: SportsCard[];
  syncError: string | null;
  getCard: (id: string) => SportsCard | undefined;
  addCard: (input: CardInput) => SavedCard;
  updateCard: (id: string, patch: Partial<SportsCard>) => SavedCard;
  removeCard: (id: string) => void;
  reload: () => void;
};

export const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const { ready: socialReady, mode, user } = useSocial();
  const [cards, setCards] = useState<SportsCard[]>([]);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const writes = useRef(new Map<string, Promise<unknown>>());
  const remote = mode === "supabase" && Boolean(user);
  const userId = user?.id ?? null;

  const enqueue = useCallback((cardId: string, job: () => Promise<void>) => {
    const prev = writes.current.get(cardId) ?? Promise.resolve();
    const next = prev.then(job, job);
    // Keep the queue moving after a failure, but return the original promise
    // so the caller can await this save and surface its error.
    writes.current.set(
      cardId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }, []);

  const report = useCallback((error: unknown) => {
    setSyncError(error instanceof Error ? error.message : "Could not save your collection.");
  }, []);

  useEffect(() => {
    if (!socialReady) return;
    let cancelled = false;

    if (!remote || !userId) {
      setCards(mode === "local" ? loadCollection() : []);
      setSyncError(null);
      setReady(true);
      return;
    }

    const client = createSupabaseBrowser();
    if (!client) {
      setCards(loadCollection());
      setReady(true);
      return;
    }

    setReady(false);
    loadUserCards(client, userId)
      .then((rows) => {
        if (cancelled) return;
        const { cards: merged, dirty } = mergeCategories(rows);
        cardsRef.current = merged;
        setCards(merged);
        setSyncError(null);
        for (const card of dirty) {
          enqueue(card.id, async () => {
            try {
              await saveUserCard(client, userId, card);
              if (isPublicForSaleListing(card)) pingWantMatch("listing", card.id);
              setSyncError(null);
            } catch (error) {
              report(error);
            }
          });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        report(error);
        setCards([]);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enqueue, mode, remote, report, socialReady, userId]);

  useEffect(() => {
    if (ready && mode === "local") saveCollection(cards);
  }, [cards, mode, ready]);

  const getCard = useCallback(
    (id: string) => cards.find((card) => card.id === id),
    [cards],
  );

  const addCard = useCallback(
    (input: CardInput) => {
      const now = new Date().toISOString();
      const card: SportsCard = {
        ...input,
        id: remote ? crypto.randomUUID() : newId(),
        createdAt: now,
        updatedAt: now,
      };
      const next = [card, ...cardsRef.current];
      cardsRef.current = next;
      setCards(next);
      if (mode === "local") trackEvent("card_added");
      const forgetCard = (cardId: string) => {
        const remaining = cardsRef.current.filter((item) => item.id !== cardId);
        cardsRef.current = remaining;
        setCards(remaining);
      };
      let saved = Promise.resolve();
      if (remote && userId) {
        const client = createSupabaseBrowser();
        if (client) {
          saved = enqueue(card.id, async () => {
            try {
              await saveUserCard(client, userId, card);
              trackEvent("card_added");
              if (card.isPublic) pingWantMatch("card", card.id);
              if (isPublicForSaleListing(card)) pingWantMatch("listing", card.id);
              setSyncError(null);
              scheduleCardValueRefresh(card.id);
            } catch (error) {
              report(error);
              if (!isSaveTimeout(error)) forgetCard(card.id);
              throw error;
            }
          });
        }
      }
      void saved.catch(() => undefined);
      return { card, saved };
    },
    [enqueue, mode, remote, report, userId],
  );

  const updateCard = useCallback(
    (id: string, patch: Partial<SportsCard>) => {
      const previous = cardsRef.current.find((card) => card.id === id);
      const next = cardsRef.current.map((card) =>
        card.id === id ? { ...card, ...patch, updatedAt: new Date().toISOString() } : card,
      );
      const updated = next.find((card) => card.id === id);
      cardsRef.current = next;
      setCards(next);
      if (!updated) {
        const saved = Promise.reject(new Error("Card not found."));
        void saved.catch(() => undefined);
        return { card: (previous ?? { id }) as SportsCard, saved };
      }
      const revert = () => {
        if (!previous) return;
        const latest = cardsRef.current.find((item) => item.id === id);
        if (!latest || latest.updatedAt !== updated.updatedAt) return;
        const restored = cardsRef.current.map((item) => (item.id === id ? previous : item));
        cardsRef.current = restored;
        setCards(restored);
      };
      let saved = Promise.resolve();
      if (remote && userId) {
        const client = createSupabaseBrowser();
        if (client) {
          const needsRefresh =
            !previous || shouldRefreshCardValueOnEdit(previous, updated);
          saved = enqueue(id, async () => {
            try {
              await saveUserCard(client, userId, updated);
              if (isPublicForSaleListing(updated)) pingWantMatch("listing", updated.id);
              setSyncError(null);
              if (needsRefresh) scheduleCardValueRefresh(id);
            } catch (error) {
              report(error);
              if (!isSaveTimeout(error)) revert();
              throw error;
            }
          });
        }
      }
      void saved.catch(() => undefined);
      return { card: updated, saved };
    },
    [enqueue, remote, report, userId],
  );

  const removeCard = useCallback(
    (id: string) => {
      const next = cardsRef.current.filter((card) => card.id !== id);
      cardsRef.current = next;
      setCards(next);
      if (remote && userId) {
        const client = createSupabaseBrowser();
        if (client) {
          enqueue(id, async () => {
            try {
              await removeUserCard(client, userId, id);
              setSyncError(null);
            } catch (error) {
              report(error);
            }
          });
        }
      }
    },
    [enqueue, remote, report, userId],
  );

  const reload = useCallback(() => {
    if (remote && userId) {
      const client = createSupabaseBrowser();
      if (!client) return;
      void loadUserCards(client, userId)
        .then((rows) => {
          const { cards: merged } = mergeCategories(rows);
          cardsRef.current = merged;
          setCards(merged);
          setSyncError(null);
        })
        .catch(report);
      return;
    }
    const loaded = loadCollection();
    cardsRef.current = loaded;
    setCards(loaded);
  }, [remote, report, userId]);

  const value = useMemo(
    () => ({ ready, cards, syncError, getCard, addCard, updateCard, removeCard, reload }),
    [ready, cards, syncError, getCard, addCard, updateCard, removeCard, reload],
  );

  return (
    <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>
  );
}

export function useCollection() {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error("useCollection must be used inside CollectionProvider");
  return ctx;
}

export function useDefaultAccent() {
  const { cards } = useCollection();
  return nextAccent(cards.length);
}
