"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SEED_CARDS } from "@/lib/seed";
import type { CardInput, SportsCard } from "@/lib/types";

const STORAGE_KEY = "ladderlite.cards.v1";

type PortfolioContextValue = {
  cards: SportsCard[];
  ready: boolean;
  addCard: (input: CardInput) => SportsCard;
  updateCard: (id: string, input: CardInput) => void;
  deleteCard: (id: string) => void;
  getCard: (id: string) => SportsCard | undefined;
  resetDemo: () => void;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `card-${Date.now()}`;
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [cards, setCards] = useState<SportsCard[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setCards(JSON.parse(raw) as SportsCard[]);
      } else {
        setCards(SEED_CARDS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_CARDS));
      }
    } catch {
      setCards(SEED_CARDS);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }, [cards, ready]);

  const addCard = useCallback((input: CardInput) => {
    const now = new Date().toISOString();
    const card: SportsCard = {
      ...input,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    setCards((prev) => [card, ...prev]);
    return card;
  }, []);

  const updateCard = useCallback((id: string, input: CardInput) => {
    const now = new Date().toISOString();
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, ...input, updatedAt: now } : card,
      ),
    );
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const getCard = useCallback(
    (id: string) => cards.find((card) => card.id === id),
    [cards],
  );

  const resetDemo = useCallback(() => {
    setCards(SEED_CARDS);
  }, []);

  const value = useMemo(
    () => ({
      cards,
      ready,
      addCard,
      updateCard,
      deleteCard,
      getCard,
      resetDemo,
    }),
    [cards, ready, addCard, updateCard, deleteCard, getCard, resetDemo],
  );

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
