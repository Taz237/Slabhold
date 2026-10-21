"use client";

import { useImageLightbox } from "@/components/image-lightbox";
import { initials } from "@/lib/format";

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

  if (image && expandable) {
    return (
      <button
        type="button"
        aria-label={`View ${name}'s profile picture`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          open(image, `${name}'s profile picture`);
        }}
        className={`hit-44 inline-block shrink-0 cursor-zoom-in rounded-full border-0 bg-transparent p-0 ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full rounded-full object-cover" />
      </button>
    );
  }

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={`rounded-full object-cover ${className}`} />
    );
  }

  return (
    <span
      className={`grid place-items-center rounded-full text-xs font-semibold text-white ${className}`}
      style={{
        background: `linear-gradient(160deg, ${accent}, color-mix(in oklab, ${accent} 35%, #09090b))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
