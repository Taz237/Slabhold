"use client";

import { fadeInWhenLoaded } from "@/lib/ui/fade-in-image";
import type { LightboxOptions } from "@/components/image-lightbox";
import { knownPhotoSize, rememberPhotoSize } from "@/lib/social/photo-sizes";
import { thumbnailsIn } from "@/lib/ui/thumbnail-origins";
import { imagesFromPost, postPhotoCellClass, postPhotoGridClass } from "@/lib/social/post-photos";

/** Rounded, with a hairline purple-tinted edge and a soft neutral shadow. */
const PHOTO_FRAME =
  "overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-violet-500/15 shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:bg-white/[0.04] dark:shadow-none dark:ring-violet-400/20";

/** The grid's thumbnails in order, so the viewer can grow out of (and shrink back into) the tapped one. */
function originsFrom(button: HTMLElement): HTMLImageElement[] {
  return thumbnailsIn(button.closest("[data-photo-frame]") ?? button);
}

function remember(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  rememberPhotoSize(img.getAttribute("src") ?? "", img.naturalWidth, img.naturalHeight);
}

export function PostPhotoGrid({
  images,
  onOpen,
  eager = false,
  fit = "feed",
}: {
  images: readonly string[];
  onOpen: (src: string, alt: string, gallery?: readonly string[], options?: LightboxOptions) => void;
  /** On the first screen: fetched at once instead of lazily. */
  eager?: boolean;
  /**
   * "feed": a single photo fills a 4:5 portrait box, sized before it loads.
   * "full": the post page shows the whole photo, uncropped. When the feed
   * already loaded it, the box takes the photo's real shape at once (no
   * letterbox, no pop-in); a cold load reserves a 4:5 box so nothing shifts.
   */
  fit?: "feed" | "full";
}) {
  const photos = imagesFromPost({ images });
  if (!photos.length) return null;
  if (photos.length === 1) {
    const known = fit === "full" ? knownPhotoSize(photos[0]) : null;
    return (
      <button
        type="button"
        aria-label="View photo"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen(photos[0], "Post photo", photos, { origins: originsFrom(event.currentTarget) });
        }}
        data-photo-frame=""
        className={`mt-3 block w-full cursor-zoom-in scroll-mb-[calc(14rem+env(safe-area-inset-bottom))] ${PHOTO_FRAME} ${fit === "feed" ? "sm:max-w-md" : ""} ${known ? "bg-transparent dark:bg-transparent" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={eager ? undefined : fadeInWhenLoaded}
          data-fade={eager ? undefined : ""}
          src={photos[0]}
          alt=""
          data-photo-index={0}
          data-photo-radius={16}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding={known ? "sync" : "async"}
          onLoad={remember}
          style={known ? { aspectRatio: `${known.width} / ${known.height}` } : undefined}
          className={
            fit === "feed"
              ? "aspect-[4/5] h-auto w-full object-cover"
              : known
                ? "block h-auto max-h-[80svh] w-full object-contain"
                : "block aspect-[4/5] max-h-[80svh] w-full object-contain"
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
            onOpen(src, `Post photo ${index + 1}`, photos, { origins: originsFrom(event.currentTarget) });
          }}
          className={`relative block min-h-0 w-full cursor-zoom-in scroll-mb-[calc(14rem+env(safe-area-inset-bottom))] overflow-hidden ${postPhotoCellClass(photos.length, index)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={eager ? undefined : fadeInWhenLoaded}
            data-fade={eager ? undefined : ""}
            src={src}
            alt=""
            data-photo-index={index}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onLoad={remember}
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}
