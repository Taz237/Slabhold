import { money } from "@/lib/format";
import { parseGrade, parseYearLabel } from "@/lib/card-options";
import { recentSoldPrices, type AddedSoldPrice } from "@/lib/cards/added-panel";
import { applyGradingCompany } from "@/lib/cards/grading-company";
import { trawlSkipReason } from "@/lib/comps/lookup-guard";
import type { QuickCompOutcome } from "@/lib/quick-comp/client";
import { quickCompIdentityKey, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import { NOT_ENOUGH_SALES_LABEL, shownCardValue, VALUE_UNAVAILABLE_LABEL } from "@/lib/value/format";
import type { PremiumCardFields } from "@/lib/value/price-fallback";

/**
 * "Worth about" on Review, before the card is saved. It reuses Quick Comp:
 * the same identity, the same /api/quick-comp route (cache-first, shared
 * caps, one Trawl page on a miss, never writes card_values or
 * sold_comps_cache). This file only decides when to ask and what to show.
 */

/** Same settle time as Quick Comp's grade picker. */
export const REVIEW_VALUE_SETTLE_MS = 400;
/** Same pending copy as the Added reveal. */
export const REVIEW_VALUE_LOADING_LABEL = "Finding recent sales…";
/** Quick Comp is off, or comps are sample data: no market value before save. */
export const REVIEW_VALUE_LATER_LABEL = "We'll look up recent sales when you add it.";
export const REVIEW_VALUE_CAPTION = "Recent sold prices via Trawl";

/** A good answer is reused this long when they leave Review and come back. */
const REUSE_MS = 10 * 60 * 1000;

export type ReviewValueAnswers = {
  playerName: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  noNumber: boolean;
  parallel: string;
  gradeCompany: string;
  gradeNumber: string;
};

/**
 * The card to price, or null when it is not complete enough for a paid
 * lookup: no player, year, set or parallel, no card number (a whole-set
 * search is noisy), or a grade that does not parse.
 */
export function reviewValueIdentity(answers: ReviewValueAnswers): QuickCompIdentity | null {
  const playerName = answers.playerName.trim();
  const setBrand = answers.setBrand.trim();
  const parallel = answers.parallel.trim();
  const year = parseYearLabel(answers.yearLabel);
  if (!playerName || !setBrand || !parallel || !year) return null;
  if (!answers.gradeCompany.trim()) return null;
  const grading = applyGradingCompany({ company: answers.gradeCompany, gradeNumber: answers.gradeNumber });
  // A graded card needs a company and a number: "PSA" alone is not a grade to match sales on.
  if (grading.conditionType === "graded" && !parseGrade(grading.grade).number) return null;
  const cardNumber = answers.noNumber ? "" : answers.cardNumber.trim().replace(/^#/, "");
  const skip = trawlSkipReason({
    cardNumber,
    noNumber: answers.noNumber,
    grade: grading.grade,
    conditionType: grading.conditionType,
  });
  if (skip) return null;
  return {
    playerName,
    year: year.year,
    yearLabel: year.yearLabel,
    setBrand,
    cardNumber,
    parallel,
    grade: grading.grade,
  };
}

export type ReviewValueState =
  | { key: null; status: "idle" }
  | { key: string; status: "loading" }
  | { key: string; status: "done"; outcome: QuickCompOutcome };

export type ReviewValueView =
  | { kind: "hidden"; text: "" }
  | { kind: "loading" | "no_sales" | "unavailable" | "later"; text: string }
  | { kind: "ok"; text: string; sales: AddedSoldPrice[]; caption: string };

/**
 * What Review shows. Only real Trawl sales give a dollar figure. A failed or
 * limited read is a status line, never $0, and sample dollars never show.
 */
export function reviewValueView(input: {
  enabled: boolean;
  identity: QuickCompIdentity | null;
  state: ReviewValueState;
  card?: PremiumCardFields | null;
}): ReviewValueView {
  if (!input.enabled) return { kind: "later", text: REVIEW_VALUE_LATER_LABEL };
  if (!input.identity) return { kind: "hidden", text: "" };
  const { state } = input;
  if (state.status !== "done" || state.key !== quickCompIdentityKey(input.identity)) {
    return { kind: "loading", text: REVIEW_VALUE_LOADING_LABEL };
  }
  const { outcome } = state;
  if (outcome.status !== "ready") return { kind: "unavailable", text: VALUE_UNAVAILABLE_LABEL };
  const payload = outcome.payload;
  if (payload.sample || payload.source !== "trawl") return { kind: "later", text: REVIEW_VALUE_LATER_LABEL };
  const median = typeof payload.median === "number" && Number.isFinite(payload.median) ? payload.median : null;
  const count = Number.isFinite(payload.count) ? payload.count : 0;
  const amount = shownCardValue(input.card, {
    status: "ok",
    median: median != null && median >= 0.01 ? median : null,
    low: payload.p25,
    high: payload.p75,
    nSales: count,
    matchedAt: payload.fetchedAt,
  });
  if (amount == null) return { kind: "no_sales", text: NOT_ENOUGH_SALES_LABEL };
  const sales = count === 1 ? "1 recent sale" : `${count} recent sales`;
  return {
    kind: "ok",
    text: `Worth about ${money(amount)} based on ${sales}.`,
    sales: recentSoldPrices(payload.comps),
    caption: REVIEW_VALUE_CAPTION,
  };
}

type TimerId = ReturnType<typeof setTimeout>;

/**
 * One lookup per settled identity. A new identity clears the old answer at
 * once, waits REVIEW_VALUE_SETTLE_MS, then asks. The same identity again is
 * a no-op, so a caption, visibility or photo change never asks twice. Pass a
 * createLookupGate lookup so a double render shares one request.
 */
export function createReviewValueLookup(deps: {
  lookup: (identity: QuickCompIdentity) => Promise<QuickCompOutcome>;
  settleMs?: number;
  now?: () => number;
}) {
  const settleMs = deps.settleMs ?? REVIEW_VALUE_SETTLE_MS;
  const now = deps.now ?? Date.now;
  const kept = new Map<string, { outcome: QuickCompOutcome; at: number }>();
  const listeners = new Set<() => void>();
  let state: ReviewValueState = { key: null, status: "idle" };
  let timer: TimerId | null = null;

  function set(next: ReviewValueState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function cancel() {
    if (timer != null) clearTimeout(timer);
    timer = null;
  }

  return {
    request(identity: QuickCompIdentity | null) {
      const key = identity ? quickCompIdentityKey(identity) : null;
      if (key === state.key) return;
      cancel();
      if (!identity || !key) {
        set({ key: null, status: "idle" });
        return;
      }
      const good = kept.get(key);
      if (good && now() - good.at < REUSE_MS) {
        set({ key, status: "done", outcome: good.outcome });
        return;
      }
      set({ key, status: "loading" });
      timer = setTimeout(() => {
        timer = null;
        void deps.lookup(identity).then((outcome) => {
          if (outcome.status === "ready") kept.set(key, { outcome, at: now() });
          if (state.key === key) set({ key, status: "done", outcome });
        });
      }, settleMs);
    },
    /** Leaving Review: drop a lookup that has not started. */
    release() {
      cancel();
      state = { key: null, status: "idle" };
    },
    snapshot(): ReviewValueState {
      return state;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
