"use client";

import Image from "next/image";
import { useCallback } from "react";
import { PhotoPlaceholder, SlabFrame, type ArtCard } from "@/components/card-slab-frame";
import {
  TILE_IMAGE_SIZES,
  showPhotoPlaceholder,
  tileLoading,
  type PhotoSource,
  type PhotoStatus,
} from "@/lib/collection/grid";

export type { ArtCard } from "@/components/card-slab-frame";
export { PhotoPlaceholder } from "@/components/card-slab-frame";

/**
 * The art for a collection tile: a clear slab with a grader label for graded
 * cards, a plain card for raw ones. Fills a 3:5 box so grid rows line up.
 */
export function CardSlabArt({
  card,
  index,
  source,
  status,
  onStatus,
  sizes = TILE_IMAGE_SIZES,
  preload = false,
  fetchPriority,
}: {
  card: ArtCard;
  index: number;
  source: PhotoSource;
  status: PhotoStatus;
  onStatus: (event: "load" | "error") => void;
  sizes?: string;
  /** Above the fold: the photo is preloaded from the document head. */
  preload?: boolean;
  /** Overrides the index-based priority, e.g. "high" for the page's LCP photo only. */
  fetchPriority?: "high" | "auto";
}) {
  const photo = (
    <CardFace
      card={card}
      index={index}
      source={source}
      status={status}
      onStatus={onStatus}
      sizes={sizes}
      preload={preload}
      fetchPriority={fetchPriority}
    />
  );

  return <SlabFrame card={card}>{photo}</SlabFrame>;
}

/**
 * First-screen photos (eager or preloaded) are visible from the server
 * render, so they paint as soon as their bytes arrive, before hydration.
 * Only photos that load later fade in, once loaded.
 */
export function photoClass({ eager, status }: { eager: boolean; status: PhotoStatus }): string {
  const base = "absolute inset-0 h-full w-full object-cover";
  if (eager) return base;
  return `${base} transition-opacity duration-300 motion-reduce:transition-none ${
    status === "loaded" ? "opacity-100" : "opacity-0"
  }`;
}

function CardFace({
  card,
  index,
  source,
  status,
  onStatus,
  sizes,
  preload,
  fetchPriority,
}: {
  card: ArtCard;
  index: number;
  source: PhotoSource;
  status: PhotoStatus;
  onStatus: (event: "load" | "error") => void;
  sizes: string;
  preload: boolean;
  fetchPriority?: "high" | "auto";
}) {
  // A cached photo can finish before hydration, so check once on mount.
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete) return;
      onStatus(img.naturalWidth > 0 ? "load" : "error");
    },
    [onStatus],
  );

  const placeholder = <PhotoPlaceholder card={card} />;
  if (source.kind === "none" || showPhotoPlaceholder(source, status)) return placeholder;

  const eager = tileLoading(index) === "eager";
  const priority = fetchPriority ?? (eager ? "high" : "auto");
  const imgClass = photoClass({ eager: eager || preload, status });

  return (
    <>
      {placeholder}
      {source.kind === "optimized" ? (
        <Image
          ref={imgRef}
          src={source.src}
          alt=""
          fill
          sizes={sizes}
          quality={75}
          // next/image takes preload or loading, not both. A preload with
          // fetchPriority "high" also raises its <link> in the head.
          {...(preload
            ? { preload: true, ...(fetchPriority ? { fetchPriority } : {}) }
            : { loading: eager ? "eager" : "lazy", fetchPriority: priority } as const)}
          onLoad={() => onStatus("load")}
          onError={() => onStatus("error")}
          className={imgClass}
        />
      ) : (
        // Local data: URLs and photos outside our storage skip the optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={source.src}
          alt=""
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={priority}
          onLoad={() => onStatus("load")}
          onError={() => onStatus("error")}
          className={imgClass}
        />
      )}
    </>
  );
}

