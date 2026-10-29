"use client";

import { imagesFromPost, postPhotoCellClass, postPhotoGridClass } from "@/lib/social/post-photos";

/** Rounded, with a hairline purple-tinted edge and a soft purple shadow. */
const PHOTO_FRAME =
  "overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-violet-500/15 shadow-[0_10px_28px_-16px_rgba(124,58,237,0.45)] dark:bg-white/[0.04] dark:ring-violet-400/20";

export function PostPhotoGrid({
  images,
  onOpen,
}: {
  images: readonly string[];
  onOpen: (src: string, alt: string, gallery?: readonly string[]) => void;
}) {
  const photos = imagesFromPost({ images });
  if (!photos.length) return null;
  if (photos.length === 1) {
    return (
      <button
        type="button"
        aria-label="View photo"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen(photos[0], "Post photo", photos);
        }}
        data-photo-frame=""
        className={`mt-3 block w-full cursor-zoom-in scroll-mb-[calc(14rem+env(safe-area-inset-bottom))] ${PHOTO_FRAME}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[0]}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-square max-h-80 w-full object-cover"
        />
      </button>
    );
  }

  return (
    <div
      data-photo-grid={photos.length}
      data-photo-frame=""
      className={`mt-3 ${PHOTO_FRAME} ${postPhotoGridClass(photos.length)}`}
    >
      {photos.map((src, index) => (
        <button
          key={`${index}-${src}`}
          type="button"
          aria-label={`View photo ${index + 1}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpen(src, `Post photo ${index + 1}`, photos);
          }}
          className={`relative block min-h-0 w-full cursor-zoom-in scroll-mb-[calc(14rem+env(safe-area-inset-bottom))] overflow-hidden ${postPhotoCellClass(photos.length, index)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
