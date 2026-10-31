"use client";

import Link from "next/link";
import { useState } from "react";
import { useSocial } from "@/components/social-provider";
import {
  MESSAGE_OWNER_LABEL,
  OPEN_TO_OFFERS_LABEL,
  messageOwnerLinkFromMetadata,
  messagePreviewPriceLabel,
  resolveLiveCardPreview,
} from "@/lib/offers/open-to-offers";
import { initials } from "@/lib/format";
import type { CardMessagePreview } from "@/lib/social/types";
import { usePublicCards } from "@/lib/social/use-public-cards";
import { useCardValue } from "@/lib/value/use-card-values";

const badgeClass =
  "inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200";

export function OpenToOffersBadge({ className = "" }: { className?: string }) {
  return <span className={`${badgeClass} ${className}`.trim()}>{OPEN_TO_OFFERS_LABEL}</span>;
}

export function OpenToOffersToggle({
  visible,
  checked,
  onChange,
}: {
  visible: boolean;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  if (!visible) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="size-5 accent-violet-500"
        />
        {OPEN_TO_OFFERS_LABEL}
      </label>
      <p className="text-xs leading-5 text-zinc-500">
        Let collectors message you about this card.
      </p>
    </div>
  );
}

export function OpenToOffersFilter({
  available,
  active,
  onToggle,
}: {
  available: boolean;
  active: boolean;
  onToggle: () => void;
}) {
  if (!available) return null;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`mb-3 rounded-full border px-3 py-1 text-xs font-semibold ${
        active
          ? "border-emerald-600 bg-emerald-500/15 text-emerald-800 dark:border-emerald-300 dark:text-emerald-100"
          : "border-zinc-300 text-zinc-600 dark:border-white/20 dark:text-zinc-300"
      }`}
    >
      {OPEN_TO_OFFERS_LABEL}
    </button>
  );
}

export function ProfileCardCaption({
  card,
  valueLabel,
}: {
  card: {
    playerName: string;
    year: number;
    setBrand: string;
    openToOffers?: boolean | null;
  };
  valueLabel: string;
}) {
  return (
    <div className="px-2.5 py-2">
      {card.openToOffers === true ? <OpenToOffersBadge className="mb-1" /> : null}
      <p className="truncate text-sm font-bold">{card.playerName}</p>
      <p className="truncate text-xs text-zinc-500">
        {card.year} {card.setBrand}
      </p>
      <p className="line-clamp-2 text-xs leading-snug text-zinc-500" title={valueLabel}>
        {valueLabel}
      </p>
    </div>
  );
}

/**
 * A card shared in a message: photo, player, year and set, grade, and the
 * estimate when there is one. Every field comes from the live card.
 */
/** Same footprint as a shared card while its public row loads. */
function CardMessagePreviewPending() {
  return (
    <span
      data-shared-card-pending=""
      aria-busy="true"
      aria-label="Loading card"
      className="mt-1 flex w-64 max-w-full items-center gap-3 rounded-2xl border border-violet-500/15 bg-white p-2.5 pr-3.5 dark:border-violet-400/20 dark:bg-zinc-900"
    >
      <span className="h-[78px] w-14 shrink-0 animate-pulse rounded-lg bg-zinc-200 motion-reduce:animate-none dark:bg-white/10" />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="block h-3.5 w-32 animate-pulse rounded-full bg-zinc-200 motion-reduce:animate-none dark:bg-white/10" />
        <span className="block h-3 w-24 animate-pulse rounded-full bg-zinc-200/70 motion-reduce:animate-none dark:bg-white/[0.06]" />
      </span>
    </span>
  );
}

/** Same footprint as a shared card when its read failed: tap to read it again. */
function CardMessagePreviewRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      data-shared-card-retry=""
      aria-label="Couldn't load this card. Try again"
      onClick={onRetry}
      className="mt-1 flex min-h-11 w-64 max-w-full items-center gap-3 rounded-2xl border border-violet-500/15 bg-white p-2.5 pr-3.5 text-left transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none dark:border-violet-400/20 dark:bg-zinc-900"
    >
      <span className="h-[78px] w-14 shrink-0 rounded-lg bg-zinc-100 dark:bg-white/10" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-5 font-semibold">Couldn&apos;t load this card</span>
        <span className="block text-[13px] leading-5 font-semibold text-violet-600 dark:text-[#A78BFA]">Try again</span>
      </span>
    </button>
  );
}

export function CardMessagePreviewBody({
  card,
}: {
  card: {
    href: string;
    imageUrl: string | null;
    player: string;
    year: string;
    set: string;
    estimateLabel?: string;
    /** "PSA 10" for a graded card. */
    grade?: string | null;
  } | null;
}) {
  if (!card) {
    return (
      <span className="mt-1 inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 text-xs font-semibold text-zinc-500 dark:bg-white/10">
        Card no longer available
      </span>
    );
  }
  return (
    <Link
      href={card.href}
      data-shared-card=""
      className="group mt-1 flex w-64 max-w-full items-center gap-3 rounded-2xl border border-violet-500/15 bg-white p-2.5 pr-3.5 text-left shadow-[0_10px_28px_-18px_rgba(124,58,237,0.6)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none dark:border-violet-400/20 dark:bg-zinc-900"
    >
      <SharedCardPhoto imageUrl={card.imageUrl} player={card.player} />
      <span className="min-w-0 flex-1">
        {card.grade ? (
          <span className="mb-1 inline-flex h-5 items-center rounded-full bg-violet-600 px-2 font-mono text-[10px] font-semibold tracking-wider text-white uppercase">
            {card.grade}
          </span>
        ) : null}
        <span className="block truncate text-[15px] leading-5 font-bold tracking-tight">{card.player}</span>
        <span className="block truncate text-[13px] leading-5 text-zinc-500">
          {card.year} {card.set}
        </span>
        {card.estimateLabel ? (
          <span className="block truncate text-[13px] leading-5 font-semibold tabular-nums">{card.estimateLabel}</span>
        ) : null}
      </span>
    </Link>
  );
}

/** 5:7 photo in a thin slab edge. A designed stand-in when there is no photo or it fails. */
export function SharedCardPhoto({
  imageUrl,
  player,
  size = "md",
}: {
  imageUrl: string | null;
  player: string;
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const box =
    size === "sm"
      ? "h-10 w-[29px] rounded-[5px] p-[2px]"
      : "h-[78px] w-14 rounded-lg p-[3px]";
  const show = imageUrl && failed !== imageUrl ? imageUrl : null;
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6),0_4px_10px_-4px_rgba(0,0,0,0.45)] dark:from-white/20 dark:to-white/5 ${box}`}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={show}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(show)}
          className="h-full w-full rounded-[3px] bg-zinc-900 object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-[3px] bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] text-[10px] font-extrabold text-white">
          {initials(player) || "?"}
        </span>
      )}
    </span>
  );
}

export function CardMessagePreviewCard({ preview }: { preview: CardMessagePreview }) {
  const { publicCards, profiles } = useSocial();
  const { ready, failed, retry } = usePublicCards({ ids: [preview.cardId] });
  const live = resolveLiveCardPreview(preview.cardId, publicCards, profiles);
  const value = useCardValue(live?.cardId ?? null);
  if (!live && failed) return <CardMessagePreviewRetry onRetry={retry} />;
  if (!live && !ready) return <CardMessagePreviewPending />;
  if (!live) return <CardMessagePreviewBody card={null} />;
  return (
    <CardMessagePreviewBody
      card={{
        href: live.href,
        imageUrl: live.imageUrl,
        player: live.player,
        year: live.year,
        set: live.set,
        estimateLabel: messagePreviewPriceLabel(value.value, live.createdAt),
        grade: live.grade,
      }}
    />
  );
}

export function WantAlertOfferLink({
  metadata,
}: {
  metadata: Record<string, unknown> | null | undefined;
}) {
  const offer = messageOwnerLinkFromMetadata(metadata);
  if (!offer) return null;
  return (
    <p className="px-4 pb-3 pl-16 text-sm">
      <Link href={offer.href} className="font-semibold">
        {MESSAGE_OWNER_LABEL}
      </Link>
    </p>
  );
}
