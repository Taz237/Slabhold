"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  createReviewValueLookup,
  reviewValueIdentity,
  reviewValueView,
  type ReviewValueAnswers,
  type ReviewValueState,
} from "@/lib/cards/review-value";
import { createLookupGate, fetchQuickComp } from "@/lib/quick-comp/client";
import { quickCompEnabled } from "@/lib/quick-comp/flag";
import type { PremiumCardFields } from "@/lib/value/price-fallback";

// One store for the page: leaving Review and coming back reuses a good answer,
// and the gate shares a request a double render would send twice.
const gate = createLookupGate((identity) => fetchQuickComp(identity, (url) => fetch(url, { cache: "no-store" })));
const store = createReviewValueLookup({ lookup: gate.lookup });
const IDLE: ReviewValueState = { key: null, status: "idle" };

/**
 * "Worth about" on Review, from recent sold prices for the card as answered.
 * Comps only: never the purchase price, notes or cert. A failed, limited or
 * sample read never shows a dollar figure.
 */
export function ReviewValue({
  answers,
  card,
  enabled = quickCompEnabled(),
}: {
  answers: ReviewValueAnswers;
  card?: PremiumCardFields | null;
  enabled?: boolean;
}) {
  const identity = reviewValueIdentity(answers);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, () => IDLE);
  const { playerName, yearLabel, setBrand, cardNumber, noNumber, parallel, gradeCompany, gradeNumber } = answers;

  // Only the card's identity asks again. Caption, visibility and photo are not in it,
  // and the store skips an identity it already has.
  useEffect(() => {
    if (!enabled) return;
    store.request(
      reviewValueIdentity({ playerName, yearLabel, setBrand, cardNumber, noNumber, parallel, gradeCompany, gradeNumber }),
    );
  }, [enabled, playerName, yearLabel, setBrand, cardNumber, noNumber, parallel, gradeCompany, gradeNumber]);
  useEffect(() => () => store.release(), []);

  const view = reviewValueView({ enabled, identity, state, card });
  if (view.kind === "hidden") return null;

  return (
    <div
      data-slot="review-value"
      aria-live="polite"
      className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left dark:border-white/10 dark:bg-white/[0.03]"
    >
      {view.kind === "loading" ? (
        <div aria-busy="true" className="space-y-1.5">
          <span aria-hidden className="skeleton-shimmer block h-5 w-44 rounded-md" />
          <p className="text-sm text-zinc-500">{view.text}</p>
        </div>
      ) : view.kind === "ok" ? (
        <div>
          <p className="text-base font-semibold tracking-tight tabular-nums text-balance text-zinc-900 dark:text-zinc-50">
            {view.text}
          </p>
          {view.sales.length > 0 ? (
            <ul aria-label="Recent sold prices" className="mt-2 grid grid-cols-3 gap-1.5">
              {view.sales.map((sale) => (
                <li
                  key={sale.key}
                  className="min-w-0 rounded-xl bg-zinc-100 px-2 py-1.5 text-center dark:bg-white/[0.05]"
                >
                  <span className="block truncate text-sm font-semibold tabular-nums">{sale.priceText}</span>
                  <span className="block truncate text-[11px] text-zinc-500 tabular-nums">{sale.dateText ?? "Recently"}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1.5 text-[11px] text-zinc-500">{view.caption}</p>
        </div>
      ) : view.kind === "later" ? (
        <p className="text-sm text-zinc-500">{view.text}</p>
      ) : (
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{view.text}</p>
      )}
    </div>
  );
}
