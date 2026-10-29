"use client";

import Link from "next/link";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { useImageLightbox } from "@/components/image-lightbox";
import { useSocial } from "@/components/social-provider";
import { money } from "@/lib/format";
import { mailDayCardHref, visibleMailDayCards } from "@/lib/social/mail-day";
import {
  mailDayDetailLine,
  mailDayPlayerLine,
  mailDayTileLayout,
} from "@/lib/social/mail-day-copy";
import { useAttachmentLabel } from "@/lib/social/use-attachment-label";
import type { MailDayCardView, Post } from "@/lib/social/types";
import {
  attachmentPriceText,
  ebaySoldSearchUrlForCard,
  visibleAcquiredSource,
} from "@/lib/value/ebay-sold";
import type { CardValueResult } from "@/lib/value/types";

function legacyViews(post: Post): MailDayCardView[] {
  if (!post.card || !post.mailDay) return [];
  const photos = post.mailDay.photos.length
    ? post.mailDay.photos
    : post.card.photoDataUrl
      ? [post.card.photoDataUrl]
      : [];
  return [
    {
      card: post.card,
      photos,
      source: post.mailDay.source,
      paid: post.mailDay.paid,
      isPublic: post.mailDay.isPublic,
      showValue: post.mailDay.showValue,
    },
  ];
}

export function MailDayCard({
  post,
  username,
  variant = "feed",
  asViewer = "self",
  cardValues,
  cardValuesLoading,
}: {
  post: Post;
  username: string;
  variant?: "feed" | "detail";
  /** Preview passes "other" so the form matches what everyone else sees. */
  asViewer?: "self" | "other";
  cardValues?: Map<string, CardValueResult>;
  cardValuesLoading?: boolean;
}) {
  const { user } = useSocial();
  const views = post.mailDayCards?.length ? post.mailDayCards : legacyViews(post);
  if (!views.length) return null;
  const { shown, extra } = visibleMailDayCards(views, variant);
  const viewerIsOwner =
    asViewer === "other" ? false : Boolean(user && user.id === post.authorId);
  const hero = mailDayTileLayout(views.length) === "hero";

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      <div
        className={
          hero
            ? "px-3 py-3"
            : "flex gap-2 overflow-x-auto px-3 py-3 min-[391px]:grid min-[391px]:grid-cols-2 min-[391px]:overflow-visible"
        }
      >
        {shown.map((view) => (
          <MailDayTile
            key={view.card.id}
            view={view}
            username={username}
            viewerIsOwner={viewerIsOwner}
            hero={hero}
            cardValues={cardValues}
            cardValuesLoading={cardValuesLoading}
          />
        ))}
      </div>
      {extra > 0 ? <p className="px-3 pb-3 text-sm font-semibold text-zinc-500">+{extra} more</p> : null}
    </div>
  );
}

function MailDayTile({
  view,
  username,
  viewerIsOwner,
  hero,
  cardValues,
  cardValuesLoading,
}: {
  view: MailDayCardView;
  username: string;
  viewerIsOwner: boolean;
  hero: boolean;
  cardValues?: Map<string, CardValueResult>;
  cardValuesLoading?: boolean;
}) {
  const openImage = useImageLightbox();
  const valueLabel = useAttachmentLabel(view.showValue ? view.card : null, {
    values: cardValues,
    loading: cardValuesLoading,
  });
  const href = mailDayCardHref({
    showValue: view.showValue,
    cardId: view.card.id,
    viewerIsOwner,
    username,
  });
  const priceLabel = view.showValue ? attachmentPriceText(valueLabel) : null;
  const soldHref =
    view.showValue && !priceLabel ? ebaySoldSearchUrlForCard(view.card) : null;

  return (
    <MailDayTileBody
      hero={hero}
      player={mailDayPlayerLine(view.card)}
      detail={mailDayDetailLine(view.card)}
      photos={view.photos}
      href={href}
      priceLabel={priceLabel}
      soldHref={soldHref}
      sourceLabel={view.showValue ? visibleAcquiredSource(view.source) : null}
      paidLabel={view.showValue && view.paid != null ? `Paid ${money(view.paid)}` : null}
      onOpen={openImage}
    />
  );
}

export function MailDayTileBody({
  hero,
  player,
  detail,
  photos,
  href,
  priceLabel,
  soldHref,
  sourceLabel,
  paidLabel,
  onOpen,
}: {
  hero: boolean;
  player: string;
  detail: string;
  photos: string[];
  href: string | null;
  priceLabel: string | null;
  soldHref: string | null;
  sourceLabel: string | null;
  paidLabel: string | null;
  onOpen: (src: string, alt: string) => void;
}) {
  const [lead, ...rest] = photos;
  const showPrice = Boolean(priceLabel || soldHref || sourceLabel || paidLabel);
  const name = href ? (
    <Link href={href} className="block break-words text-sm font-bold hover:underline">
      {player}
    </Link>
  ) : (
    <p className="break-words text-sm font-bold">{player}</p>
  );

  return (
    <article
      data-mail-day-layout={hero ? "hero" : "grid"}
      className={
        hero
          ? "overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10"
          : "w-[72%] shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 min-[391px]:w-auto"
      }
    >
      {lead ? (
        <div className="grid gap-1">
          <MailDayPhoto src={lead} hero={hero} onOpen={onOpen} />
          {rest.length > 0 ? (
            <div className={`grid gap-1 ${rest.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {rest.map((src) => (
                <MailDayPhoto key={src} src={src} hero={hero} onOpen={onOpen} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="px-2 py-2">
        {name}
        {detail ? (
          <p className="mt-0.5 line-clamp-2 break-words text-xs text-zinc-500">{detail}</p>
        ) : null}
        {showPrice ? (
          <p className="mt-0.5 text-xs text-zinc-500">
            {priceLabel ? <span>{priceLabel}</span> : soldHref ? <EbaySoldLink href={soldHref} /> : null}
            {sourceLabel ? `${priceLabel || soldHref ? " · " : ""}${sourceLabel}` : ""}
            {paidLabel ? `${priceLabel || soldHref || sourceLabel ? " · " : ""}${paidLabel}` : ""}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function MailDayPhoto({
  src,
  hero,
  onOpen,
}: {
  src: string;
  hero: boolean;
  onOpen: (src: string, alt: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label="View photo"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(src, "Card photo");
      }}
      className="block bg-zinc-100 dark:bg-zinc-900"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        data-photo-fit={hero ? "contain" : "cover"}
        className={`aspect-[4/5] w-full ${hero ? "object-contain" : "object-cover"}`}
      />
    </button>
  );
}
