"use client";

import Link from "next/link";
import { useImageLightbox } from "@/components/image-lightbox";
import { useSocial } from "@/components/social-provider";
import { money } from "@/lib/format";
import { mailDayCardHref, visibleMailDayCards } from "@/lib/social/mail-day";
import { useAttachmentLabel } from "@/lib/social/use-attachment-label";
import type { MailDayCardView, Post } from "@/lib/social/types";
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

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      <p className="px-3 pt-3 text-sm font-bold">📬 Mail Day</p>
      <div className="mt-2 flex gap-2 overflow-x-auto px-3 pb-3 min-[391px]:grid min-[391px]:grid-cols-2 min-[391px]:overflow-visible">
        {shown.map((view) => (
          <MailDayTile
            key={view.card.id}
            view={view}
            username={username}
            viewerIsOwner={viewerIsOwner}
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
  cardValues,
  cardValuesLoading,
}: {
  view: MailDayCardView;
  username: string;
  viewerIsOwner: boolean;
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
  const name = [view.card.yearLabel || view.card.year, view.card.setBrand, view.card.playerName]
    .filter(Boolean)
    .join(" ");
  const number = view.card.cardNumber?.trim();
  const label = `${name}${number ? ` #${number}` : ""}`;

  return (
    <article className="w-[72%] shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 min-[391px]:w-auto">
      {view.photos.length > 0 ? (
        <div className={`grid gap-1 ${view.photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {view.photos.map((src) => (
            <button
              key={src}
              type="button"
              aria-label="View photo"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openImage(src, "Mail Day photo");
              }}
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-[4/5] w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="px-2 py-2">
        {href ? (
          <Link href={href} className="block truncate text-sm font-semibold hover:underline">
            {label}
          </Link>
        ) : (
          <p className="truncate text-sm font-semibold">{label}</p>
        )}
        {view.showValue ? (
          <p className="mt-0.5 text-xs text-zinc-500">
            {valueLabel || "Not enough sales yet"}
            {view.source ? ` · ${view.source}` : ""}
            {view.paid != null ? ` · Paid ${money(view.paid)}` : ""}
          </p>
        ) : null}
      </div>
    </article>
  );
}
