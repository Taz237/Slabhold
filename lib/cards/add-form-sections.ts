import type { assessNewCardSubmit, CardDraftForm, NewCardDraft } from "@/lib/cards/new-card-draft";

export const MORE_DETAILS_LABEL = "More details (optional)";

/** Add card header subline. Edit keeps its own. */
export const ADD_FORM_SUBLINE = "Snap a photo or fill in the basics. Everything else is optional.";

/** Add card shows only these, in this order. */
export const ADD_VISIBLE_FIELDS = [
  "photo",
  "playerName",
  "yearLabel",
  "setBrand",
  "cardNumber",
  "parallel",
  "gradingCompany",
  "grade",
  "submit",
] as const;

/** Everything else on Add sits in one closed "More details (optional)" section. */
export const MORE_DETAILS_FIELDS = [
  "sport",
  "serialRun",
  "serialNo",
  "traits",
  "gradeExtras",
  "purchase",
  "estimatedSellPrice",
  "sold",
  "isPublic",
  "openToOffers",
  "notes",
  "shareToFeed",
  "category",
] as const;

export type AddVisibleField = (typeof ADD_VISIBLE_FIELDS)[number];
export type MoreDetailsField = (typeof MORE_DETAILS_FIELDS)[number];

/** Null on Edit: the full form renders as before. */
export function addFormSections(isEdit: boolean): {
  visible: readonly AddVisibleField[];
  more: readonly MoreDetailsField[];
} | null {
  if (isEdit) return null;
  return { visible: ADD_VISIBLE_FIELDS, more: MORE_DETAILS_FIELDS };
}

/** The data-field of the first field that blocks save, in form order. */
export function firstInvalidField(
  check: ReturnType<typeof assessNewCardSubmit>,
  values: CardDraftForm,
): string | null {
  const order = [
    !check.playerOk ? "playerName" : null,
    !check.setOk ? "setBrand" : null,
    !check.yearOk ? "yearLabel" : null,
    !check.cardNumberOk ? "cardNumber" : null,
    check.companyMissing ? "gradingCompany" : null,
    check.graded && !check.gradeNumber ? "grade" : null,
    check.purchaseNeg ? "purchasePrice" : null,
    check.estNeg ? "estimatedSellPrice" : null,
    check.sellNeg ? "sellPrice" : null,
    check.sold && !values.sellPrice ? "sellPrice" : null,
    check.sold && !values.sellDate ? "sellDate" : null,
  ];
  return order.find((key) => key != null) ?? null;
}

/**
 * Focus a field by data-field. A field inside a closed <details> opens it first,
 * because a closed section cannot take focus.
 */
export function revealField(root: ParentNode, key: string): HTMLElement | null {
  const el = root.querySelector<HTMLElement>(`[data-field="${key}"]`);
  if (!el) return null;
  const details = el.closest("details");
  if (details && !details.open) details.open = true;
  el.scrollIntoView?.({ behavior: "smooth", block: "center" });
  el.focus();
  return el;
}

/** A restored draft with anything filled in More details opens the section. */
export function draftOpensMoreDetails(draft: NewCardDraft | null): boolean {
  if (!draft) return false;
  const form = draft.form;
  const filled = (value: string) => value.trim() !== "";
  return (
    draft.sportTouched ||
    filled(form.serialRun) ||
    filled(form.serialNo) ||
    draft.isRookie ||
    draft.isAuto ||
    draft.isRelic ||
    filled(draft.certNumber) ||
    filled(draft.gradeQualifier) ||
    filled(form.purchaseDate) ||
    filled(form.purchasePrice) ||
    Boolean(draft.unknownPurchase) ||
    filled(form.estimatedSellPrice) ||
    draft.sold ||
    filled(form.sellPrice) ||
    filled(form.sellDate) ||
    draft.share ||
    draft.openToOffers ||
    filled(form.notes) ||
    draft.shareToFeed ||
    filled(draft.caption) ||
    draft.category !== "pc"
  );
}
