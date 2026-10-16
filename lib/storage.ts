import { parseGrade, RAW_GRADE } from "./card-options";
import { SEED_CARDS } from "./seed";
import type { ConditionType, SportsCard } from "./types";

export const STORAGE_KEY = "cardflip.cards.v1";

function optionalMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeCard(card: Partial<SportsCard> & { id: string }): SportsCard {
  const parsed = parseGrade(card.grade ?? "");
  const conditionType: ConditionType =
    card.conditionType === "raw" || card.conditionType === "graded"
      ? card.conditionType
      : parsed.company && parsed.company !== RAW_GRADE
        ? "graded"
        : "raw";
  return {
    id: card.id,
    playerName: card.playerName ?? "",
    year: card.year ?? new Date().getFullYear(),
    yearLabel: card.yearLabel ?? String(card.year ?? new Date().getFullYear()),
    setBrand: card.setBrand ?? "",
    setIsCustom: Boolean(card.setIsCustom),
    cardNumber: card.cardNumber ?? "",
    noNumber: Boolean(card.noNumber),
    grade: card.grade ?? "",
    parallel: card.parallel || "Base",
    parallelIsCustom: Boolean(card.parallelIsCustom),
    serialRun: card.serialRun ?? null,
    serialNo: card.serialNo ?? null,
    isRookie: Boolean(card.isRookie),
    isAuto: Boolean(card.isAuto),
    isRelic: Boolean(card.isRelic),
    conditionType,
    gradeQualifier: card.gradeQualifier ?? "",
    certNumber: card.certNumber ?? "",
    sport: card.sport ?? "Basketball",
    purchasePrice: optionalMoney(card.purchasePrice),
    purchaseDate: card.purchaseDate ?? "",
    estimatedSellPrice: Number(card.estimatedSellPrice) || 0,
    sellPrice: card.sellPrice ?? null,
    sellDate: card.sellDate ?? null,
    notes: card.notes ?? "",
    photoDataUrl: card.photoDataUrl ?? null,
    accent: card.accent ?? "#7c5cff",
    category: card.category === "pc" ? "pc" : "flipping",
    isPublic: Boolean(card.isPublic),
    createdAt: card.createdAt ?? new Date().toISOString(),
    updatedAt: card.updatedAt ?? new Date().toISOString(),
  };
}

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
    return parsed.map((card) => normalizeCard(card));
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
