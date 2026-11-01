"use client";

import { imagesFromPost, postPhotoCellClass, postPhotoGridClass } from "@/lib/social/post-photos";

/** Rounded, with a hairline purple-tinted edge and a soft purple shadow. */
const PHOTO_FRAME =
  "overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-violet-500/15 shadow-[0_10px_28px_-16px_rgba(124,58,237,0.45)] dark:bg-white/[0.04] dark:ring-violet-400/20";

export function PostPhotoGrid({
  images,
  onOpen,
  eager = false,
  fit = "feed",
}: {
  images: readonly string[];
  onOpen: (src: string, alt: string, gallery?: readonly string[]) => void;
  /** On the first screen: fetched at once instead of lazily. */
  eager?: boolean;
  /**
   * "feed": a single photo fills a 4:5 portrait box, sized before it loads.
   * "full": the post page shows the whole photo, uncropped.
   */
  fit?: "feed" | "full";
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
        className={`mt-3 block w-full cursor-zoom-in scroll-mb-[calc(14rem+env(safe-area-inset-bottom))] ${PHOTO_FRAME} ${fit === "feed" ? "sm:max-w-md" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[0]}
          alt=""
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          className={
            fit === "feed"
              ? "aspect-[4/5] h-auto w-full object-cover"
              : "mx-auto block h-auto max-h-[80svh] min-h-48 w-auto max-w-full object-contain"
          }
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
          <img
            src={src}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}
