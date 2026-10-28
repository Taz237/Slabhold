import { parseYearLabel } from "@/lib/card-options";
import { cardNumberAllowsSave } from "@/lib/cards/card-number-save";
import { applyGradingCompany } from "@/lib/cards/grading-company";
import type { CardCategory } from "@/lib/types";

/** Fields the add-card form keeps outside useState so a remount cannot blank them. */
export type CardDraftForm = {
  playerName: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  parallel: string;
  serialRun: string;
  serialNo: string;
  sport: string;
  purchasePrice: string;
  purchaseDate: string;
  estimatedSellPrice: string;
  sellPrice: string;
  sellDate: string;
  notes: string;
};

export type NewCardDraft = {
  seed: string;
  /** Signed-in user this draft belongs to. Null is a guest session, not "any user". */
  userId: string | null;
  /** Card already inserted for this draft. A later submit updates it. */
  pendingId: string | null;
  /** The photo itself is not kept. A restore can say it needs re-adding. */
  hadPhoto: boolean;
  form: CardDraftForm;
  noNumber: boolean;
  setIsCustom: boolean;
  parallelIsCustom: boolean;
  gradeCompany: string;
  gradeNumber: string;
  gradeQualifier: string;
  certNumber: string;
  isRookie: boolean;
  isAuto: boolean;
  isRelic: boolean;
  sold: boolean;
  share: boolean;
  openToOffers: boolean;
  shareToFeed: boolean;
  caption: string;
  category: CardCategory;
  sportTouched: boolean;
  sportOffer: string;
  /** "Don't know (bin card)": no purchase date or price. */
  unknownPurchase: boolean;
};

let draft: NewCardDraft | null = null;

export function newCardSeed(initialQuery: string, catalogId: string | null): string {
  return `${initialQuery}\n${catalogId ?? ""}`;
}

export function readNewCardDraft(seed: string, userId: string | null): NewCardDraft | null {
  if (!draft || draft.seed !== seed || draft.userId !== userId) return null;
  return draft;
}

export function writeNewCardDraft(next: NewCardDraft): void {
  draft = next;
}

export function clearNewCardDraft(): void {
  draft = null;
}

/**
 * Submit must use the values that survived the remount, not the empty useState
 * snapshot the new instance would otherwise validate.
 */
export function formForSubmit<T>(snapshot: T, persisted: T | null): T {
  return persisted ?? snapshot;
}

function optionalPrice(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

/** Purchase fields for the save payload. A bin card saves no date and no price. */
export function purchaseForSubmit(input: {
  unknownPurchase: boolean;
  purchasePrice: string;
  purchaseDate: string;
}): { purchasePrice: number | null; purchaseDate: string } {
  if (input.unknownPurchase) return { purchasePrice: null, purchaseDate: "" };
  return {
    purchasePrice: optionalPrice(input.purchasePrice),
    purchaseDate: input.purchaseDate,
  };
}

function negativePrice(value: string): boolean {
  if (value.trim() === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && n < 0;
}

export function assessNewCardSubmit(input: {
  isEdit: boolean;
  form: CardDraftForm;
  noNumber: boolean;
  gradeCompany: string;
  gradeNumber: string;
  sold: boolean;
}) {
  const parsedYear = parseYearLabel(input.form.yearLabel);
  const grading = applyGradingCompany({
    company: input.gradeCompany,
    gradeNumber: input.gradeNumber,
  });
  const conditionType = grading.conditionType;
  const graded = conditionType === "graded";
  const playerOk = Boolean(input.form.playerName.trim());
  const yearOk = Boolean(parsedYear);
  const setOk = Boolean(input.form.setBrand.trim());
  const cardNumberOk = cardNumberAllowsSave({
    isEdit: input.isEdit,
    noNumber: input.noNumber,
    cardNumber: input.form.cardNumber,
  });
  const companyMissing = !input.gradeCompany.trim();
  const gradeOk = !companyMissing && (!graded || Boolean(input.gradeNumber));
  const purchaseNeg = negativePrice(input.form.purchasePrice);
  const estNeg = negativePrice(input.form.estimatedSellPrice);
  const sellNeg = input.sold && negativePrice(input.form.sellPrice);
  const ok =
    playerOk &&
    yearOk &&
    setOk &&
    cardNumberOk &&
    gradeOk &&
    !purchaseNeg &&
    !estNeg &&
    !sellNeg &&
    (!input.sold ||
      (Boolean(input.form.sellPrice) && Boolean(input.form.sellDate) && !sellNeg));
  return {
    ok,
    parsedYear,
    grading,
    conditionType,
    graded,
    playerOk,
    yearOk,
    setOk,
    cardNumberOk,
    gradeOk,
    companyMissing,
    purchaseNeg,
    estNeg,
    sellNeg,
    gradeNumber: input.gradeNumber,
    sold: input.sold,
  };
}
