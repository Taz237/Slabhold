import { SEED_CARDS } from "./seed";
import type { SportsCard } from "./types";

export const STORAGE_KEY = "cardflip.cards.v1";

export function loadCollection(): SportsCard[] {
  if (typeof window === "undefined") return SEED_CARDS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_CARDS));
      return SEED_CARDS;
    }
    const parsed = JSON.parse(raw) as SportsCard[];
    if (!Array.isArray(parsed)) return SEED_CARDS;
    return parsed.map((card) => ({
      ...card,
      cardNumber: card.cardNumber ?? "",
      grade: card.grade ?? "",
      parallel: card.parallel ?? "",
      isPublic: Boolean(card.isPublic),
    }));
  } catch {
    return SEED_CARDS;
  }
}

export function saveCollection(cards: SportsCard[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const ACCENTS = [
  "#7c5cff",
  "#2dd4bf",
  "#f43f5e",
  "#fbbf24",
  "#38bdf8",
  "#22c55e",
  "#fb7185",
  "#a78bfa",
];

export function nextAccent(count: number) {
  return ACCENTS[count % ACCENTS.length];
}

export function fileToDataUrl(file: File, maxSize = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
