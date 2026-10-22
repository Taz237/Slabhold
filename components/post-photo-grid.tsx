"use client";

import { imagesFromPost, postPhotoCellClass, postPhotoGridClass } from "@/lib/social/post-photos";

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
        className="mt-3 block w-full cursor-zoom-in scroll-mb-[calc(14rem+env(safe-area-inset-bottom))]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[0]}
          alt=""
          className="max-h-80 w-full rounded-2xl border border-zinc-200 object-cover dark:border-white/10"
        />
      </button>
    );
  }

  return (
    <div
      data-photo-grid={photos.length}
      className={`mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 ${postPhotoGridClass(photos.length)}`}
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
          <img src={src} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
