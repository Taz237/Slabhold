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
import { mergeCategories } from "@/lib/card-category";
import { loadUserCards, removeUserCard, saveUserCard } from "@/lib/social/cards";
import { loadCollection, newId, nextAccent, saveCollection } from "@/lib/storage";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import type { CardInput, SportsCard } from "@/lib/types";
import { scheduleCardValueRefresh } from "@/lib/value/use-card-values";

const VALUE_DETAIL_KEYS = [
  "playerName",
  "year",
  "setBrand",
  "cardNumber",
  "grade",
  "parallel",
] as const;

function detailsAffectValue(
  before: SportsCard | undefined,
  after: SportsCard,
  patch: Partial<SportsCard>,
): boolean {
  if (!before) return true;
  return VALUE_DETAIL_KEYS.some(
    (key) => key in patch && before[key] !== after[key],
  );
}

type CollectionContextValue = {
  ready: boolean;
  cards: SportsCard[];
  syncError: string | null;
  getCard: (id: string) => SportsCard | undefined;
  addCard: (input: CardInput) => SportsCard;
  updateCard: (id: string, patch: Partial<SportsCard>) => void;
  removeCard: (id: string) => void;
  reload: () => void;
};

const CollectionContext = createContext<CollectionContextValue | null>(null);

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
    writes.current.set(cardId, next);
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
      if (remote && userId) {
        const client = createSupabaseBrowser();
        if (client) {
          enqueue(card.id, async () => {
            try {
              await saveUserCard(client, userId, card);
              setSyncError(null);
              scheduleCardValueRefresh(card.id);
            } catch (error) {
              report(error);
            }
          });
        }
      }
      return card;
    },
    [enqueue, remote, report, userId],
  );

  const updateCard = useCallback(
    (id: string, patch: Partial<SportsCard>) => {
      const before = cardsRef.current.find((card) => card.id === id);
      const next = cardsRef.current.map((card) =>
        card.id === id ? { ...card, ...patch, updatedAt: new Date().toISOString() } : card,
      );
      const updated = next.find((card) => card.id === id);
      cardsRef.current = next;
      setCards(next);
      if (remote && userId && updated) {
        const client = createSupabaseBrowser();
        if (client) {
          const shouldRefresh = detailsAffectValue(before, updated, patch);
          enqueue(id, async () => {
            try {
              await saveUserCard(client, userId, updated);
              setSyncError(null);
              if (shouldRefresh) scheduleCardValueRefresh(id);
            } catch (error) {
              report(error);
            }
          });
        }
      }
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
