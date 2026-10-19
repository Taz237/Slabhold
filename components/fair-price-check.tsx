"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { solidButton } from "@/components/button-styles";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import {
  fairPriceCheck,
  fairPriceShareBody,
  type FairPriceResult,
} from "@/lib/comps/fair-price";
import { toPublicAttachment } from "@/lib/social/card-posts";
import type { PublicCard } from "@/lib/social/types";

type FairPriceCard = {
  id: string;
  playerName: string;
  year: number;
  yearLabel?: string;
  setBrand: string;
  cardNumber: string;
  grade?: string;
  parallel?: string;
  sport?: string;
  photoDataUrl?: string | null;
  accent?: string;
  estimatedSellPrice?: number;
  conditionType?: "raw" | "graded";
  grader?: string | null;
  isPublic?: boolean;
};

/**
 * "Is this a fair price?" — compares a typed price to the middle-50% of the
 * same matched comps already shown on the card page.
 * Hidden for private cards when the viewer is not the owner.
 */
export function FairPriceCheck({
  card,
  salePrices,
  canShow,
  compsReady,
  compsLoading = false,
  needsLogin = false,
}: {
  card: FairPriceCard;
  /** Prices from the on-screen matched comps (same helper as the card page). */
  salePrices: readonly number[];
  /** Owner of a private card, or any viewer of a public card. */
  canShow: boolean;
  compsReady: boolean;
  compsLoading?: boolean;
  /** Logged-out: comps (and the fair-price band) need a session. */
  needsLogin?: boolean;
}) {
  const router = useRouter();
  const { user, createPost } = useSocial();
  const { cards } = useCollection();
  const [raw, setRaw] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const price = Number(raw);
  const hasPrice = raw.trim() !== "" && Number.isFinite(price) && price >= 0;

  const result: FairPriceResult | null = useMemo(() => {
    if (!compsReady || !hasPrice) return null;
    return fairPriceCheck(price, salePrices);
  }, [compsReady, hasPrice, price, salePrices]);

  if (!canShow) return null;

  async function shareToFeed() {
    if (!result || result.status !== "ready" || !hasPrice) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setSharing(true);
    setShareError(null);
    const body = fairPriceShareBody({
      price,
      yearLabel: card.yearLabel?.trim() || String(card.year || ""),
      setBrand: card.setBrand,
      playerName: card.playerName,
      cardNumber: card.cardNumber,
      grade: card.grade || "Raw",
      result,
    });
    const owned = cards.find((item) => item.id === card.id);
    const attachment: PublicCard | null = owned
      ? toPublicAttachment(owned)
      : card.isPublic === false
        ? null
        : toPublicAttachment({
            id: card.id,
            playerName: card.playerName,
            year: card.year,
            yearLabel: card.yearLabel,
            setBrand: card.setBrand,
            cardNumber: card.cardNumber,
            sport: card.sport || "Basketball",
            photoDataUrl: card.photoDataUrl ?? null,
            accent: card.accent || "#7c5cff",
            estimatedSellPrice: card.estimatedSellPrice ?? 0,
            grade: card.grade,
            parallel: card.parallel,
            conditionType: card.conditionType,
            grader: card.grader,
          });
    const posted = await createPost({
      body,
      imageDataUrl: null,
      card: attachment,
    });
    setSharing(false);
    if (posted.error) {
      setShareError(posted.error);
      return;
    }
    router.push("/");
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <h2 className="font-semibold">Is this a fair price?</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Compare a price to recent matched sales
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`fair-price-${card.id}`}>
          Price to check
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-zinc-400">
            $
          </span>
          <input
            id={`fair-price-${card.id}`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="0.00"
            className="w-36 rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pr-3 pl-7 text-sm tabular-nums outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-white/5 dark:focus:border-white/25"
          />
        </div>
        {result?.status === "ready" ? (
          <button
            type="button"
            disabled={sharing}
            onClick={() => void shareToFeed()}
            className={solidButton}
          >
            {sharing ? "Sharing…" : user ? "Share to feed" : "Sign in to share"}
          </button>
        ) : null}
      </div>
      {needsLogin ? (
        <p className="mt-3 text-sm text-zinc-500">
          <Link href="/login" className="font-semibold underline underline-offset-2">
            Sign in
          </Link>{" "}
          to compare against recent sales
        </p>
      ) : compsLoading ? (
        <p className="mt-3 text-sm text-zinc-500">Loading sales…</p>
      ) : !compsReady ? (
        <p className="mt-3 text-sm text-zinc-500">
          {hasPrice ? "Not enough sales yet" : "Enter a price to check"}
        </p>
      ) : hasPrice && result ? (
        <p
          className={`mt-3 text-sm font-medium ${
            result.status === "not_enough"
              ? "text-zinc-500"
              : result.verdict === "Fair"
                ? "text-emerald-700 dark:text-emerald-300"
                : result.verdict === "Below"
                  ? "text-sky-700 dark:text-sky-300"
                  : "text-amber-800 dark:text-amber-200"
          }`}
        >
          {result.status === "not_enough"
            ? result.label
            : result.summaryLabel}
        </p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">Enter a price to check</p>
      )}
      {shareError ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{shareError}</p>
      ) : null}
    </section>
  );
}
