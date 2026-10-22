"use client";

import Link from "next/link";
import { useSocial } from "@/components/social-provider";
import {
  MESSAGE_OWNER_LABEL,
  OPEN_TO_OFFERS_LABEL,
  messageOwnerLinkFromMetadata,
  messagePreviewPriceLabel,
  resolveLiveCardPreview,
} from "@/lib/offers/open-to-offers";
import type { CardMessagePreview } from "@/lib/social/types";
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

export function CardMessagePreviewBody({
  card,
}: {
  card: {
    href: string;
    imageUrl: string | null;
    player: string;
    year: string;
    set: string;
    estimateLabel: string;
  } | null;
}) {
  if (!card) {
    return (
      <span className="mt-1 inline-flex rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-500 dark:bg-white/10">
        Card no longer available
      </span>
    );
  }
  return (
    <Link
      href={card.href}
      className="mt-1 flex max-w-full gap-2 rounded-xl border border-zinc-200 bg-white p-2 text-left dark:border-white/10 dark:bg-zinc-950"
    >
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="grid h-14 w-10 shrink-0 place-items-center rounded-md bg-zinc-200 text-[10px] font-semibold dark:bg-white/10">
          {card.player.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{card.player}</span>
        <span className="block truncate text-xs text-zinc-500">
          {card.year} {card.set}
        </span>
        <span className="block truncate text-xs text-zinc-500">{card.estimateLabel}</span>
      </span>
    </Link>
  );
}

export function CardMessagePreviewCard({ preview }: { preview: CardMessagePreview }) {
  const { publicCards, profiles } = useSocial();
  const live = resolveLiveCardPreview(preview.cardId, publicCards, profiles);
  const value = useCardValue(live?.cardId ?? null);
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
