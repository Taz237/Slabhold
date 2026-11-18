"use client";

import { useCallback, useState } from "react";
import { useImageLightbox } from "@/components/image-lightbox";
import { initials } from "@/lib/format";
import { thumbnailsIn } from "@/lib/ui/thumbnail-origins";

export function Avatar({
  name,
  image,
  accent = "#7c5cff",
  className = "h-10 w-10",
  expandable = true,
}: {
  name: string;
  image?: string | null;
  accent?: string;
  className?: string;
  expandable?: boolean;
}) {
  const open = useImageLightbox();
  // A photo URL that won't load shows the initials, never a broken-image icon.
  const [broken, setBroken] = useState<string | null>(null);
  const failed = useCallback(() => setBroken(image ?? null), [image]);
  // An image that already failed before React hydrated never fires onError.
  const watch = useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && node.naturalWidth === 0 && node.getAttribute("src")) failed();
    },
    [failed],
  );
  const shown = image && broken !== image ? image : null;

  if (shown && expandable) {
    return (
      <button
        type="button"
        aria-label={`View ${name}'s profile picture`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          // Grows out of the round avatar and shrinks back into it.
          open(shown, `${name}'s profile picture`, undefined, { origins: thumbnailsIn(event.currentTarget) });
        }}
        className={`tap hit-44 inline-block shrink-0 cursor-zoom-in rounded-full border-0 bg-transparent p-0 ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={watch}
          src={shown}
          alt=""
          data-photo-index={0}
          data-photo-radius="full"
          loading="lazy"
          decoding="async"
          onError={failed}
          className="h-full w-full rounded-full bg-zinc-200 object-cover dark:bg-white/10"
        />
      </button>
    );
  }

  if (shown) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={watch}
        src={shown}
        alt=""
        loading="lazy"
        decoding="async"
        onError={failed}
        className={`tap rounded-full bg-zinc-200 object-cover dark:bg-white/10 ${className}`}
      />
    );
  }

  return (
    <span
      data-avatar-initials=""
      className={`tap grid place-items-center rounded-full text-xs font-semibold text-white ${className}`}
      style={{
        background: `linear-gradient(160deg, ${accent}, color-mix(in oklab, ${accent} 35%, #09090b))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
