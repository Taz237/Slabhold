"use client";

import Link from "next/link";
import { useCollection } from "@/components/collection-provider";
import { useImageLightbox } from "@/components/image-lightbox";
import { useSocial } from "@/components/social-provider";
import { money } from "@/lib/format";
import { mailDayVisibility } from "@/lib/social/mail-day";
import { useAttachmentLabel } from "@/lib/social/use-attachment-label";
import type { Post } from "@/lib/social/types";
import type { CardValueResult } from "@/lib/value/types";

export function MailDayCard({
  post,
  username,
  cardValues,
  cardValuesLoading,
}: {
  post: Post;
  username: string;
  cardValues?: Map<string, CardValueResult>;
  cardValuesLoading?: boolean;
}) {
  const openImage = useImageLightbox();
  const { user, publicCards } = useSocial();
  const { cards } = useCollection();
  const card = post.card;
  if (!card) return null;

  const owned = cards.find((item) => item.id === card.id);
  const isPublic = owned
    ? Boolean(owned.isPublic)
    : publicCards.some((item) => item.id === card.id);
  const viewerIsOwner = Boolean(user && user.id === post.authorId);
  const paidInput = viewerIsOwner
    ? (owned?.purchasePrice ?? post.mailDay?.paid ?? null)
    : (post.mailDay?.paid ?? null);
  const view = mailDayVisibility({
    isPublic,
    showPaid: Boolean(post.showPaid),
    viewerIsOwner,
    paid: paidInput,
  });
  const valueLabel = useAttachmentLabel(view.showValue ? card : null, {
    values: cardValues,
    loading: cardValuesLoading,
  });
  const photos = (post.mailDay?.photos?.length ? post.mailDay.photos : [post.imageDataUrl]).filter(
    (src): src is string => Boolean(src),
  );
  const name = [card.yearLabel || card.year, card.setBrand, card.playerName]
    .filter(Boolean)
    .join(" ");
  const number = card.cardNumber?.trim();
  const href = viewerIsOwner || view.showValue
    ? owned
      ? `/cards/${card.id}`
      : `/u/${username}/cards/${card.id}`
    : null;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      <p className="px-3 pt-3 text-sm font-bold">📬 Mail Day</p>
      {photos.length > 0 ? (
        <div className={`mt-2 grid gap-1 ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {photos.map((src) => (
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
              <img src={src} alt="" className="max-h-80 w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="px-3 py-2">
        {href ? (
          <Link href={href} className="block truncate text-sm font-semibold hover:underline">
            {name}
            {number ? ` #${number}` : ""}
          </Link>
        ) : (
          <p className="truncate text-sm font-semibold">
            {name}
            {number ? ` #${number}` : ""}
          </p>
        )}
        {view.showValue ? (
          <p className="mt-0.5 text-xs text-zinc-500">
            {valueLabel || "Not enough sales yet"}
            {post.mailDay?.source ? ` · ${post.mailDay.source}` : ""}
            {view.paid != null ? ` · Paid ${money(view.paid)}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
