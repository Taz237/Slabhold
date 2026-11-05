"use client";

import Image from "next/image";
import { useCallback } from "react";
import { PhotoPlaceholder, SlabFrame, type ArtCard, type SlabFit } from "@/components/card-slab-frame";
import {
  TILE_IMAGE_SIZES,
  showPhotoPlaceholder,
  tileLoading,
  type PhotoSource,
  type PhotoStatus,
} from "@/lib/collection/grid";
import { measureShape, useCardShape, type CardShape } from "@/lib/ui/card-shape";

export type { ArtCard } from "@/components/card-slab-frame";
export { PhotoPlaceholder } from "@/components/card-slab-frame";

/**
 * The art for a collection tile: a clear slab with a grader label for graded
 * cards, a plain card for raw ones. Fills a 3:5 box so grid rows line up.
 * A landscape photo is measured once loaded and shown whole in a wide window.
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
  fit,
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
  /** "hug" fits a raw card to its photo (posts). Grids keep the 3:5 tile. */
  fit?: SlabFit;
}) {
  // Seeded from photos already measured in this tab, so a revisit doesn't flip.
  const [learned, onShape] = useCardShape(source.kind === "none" ? null : source.src);
  // The placeholder always fills the portrait frame.
  const shape: CardShape = showPhotoPlaceholder(source, status) ? "portrait" : learned;

  const photo = (
    <CardFace
      card={card}
      index={index}
      source={source}
      status={status}
      onStatus={onStatus}
      onShape={onShape}
      shape={shape}
      sizes={sizes}
      preload={preload}
      fetchPriority={fetchPriority}
    />
  );

  return <SlabFrame card={card} shape={shape} fit={fit}>{photo}</SlabFrame>;
}

/**
 * First-screen photos (eager or preloaded) are visible from the server
 * render, so they paint as soon as their bytes arrive, before hydration.
 * Only photos that load later fade in, once loaded.
 */
export function photoClass({
  eager,
  status,
  shape = "portrait",
}: {
  eager: boolean;
  status: PhotoStatus;
  /** Landscape shows the whole photo: never cropped to portrait. */
  shape?: CardShape;
}): string {
  const base = `absolute inset-0 h-full w-full ${shape === "landscape" ? "object-contain" : "object-cover"}`;
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
  onShape,
  shape,
  sizes,
  preload,
  fetchPriority,
}: {
  card: ArtCard;
  index: number;
  source: PhotoSource;
  status: PhotoStatus;
  onStatus: (event: "load" | "error") => void;
  onShape: (shape: CardShape) => void;
  shape: CardShape;
  sizes: string;
  preload: boolean;
  fetchPriority?: "high" | "auto";
}) {
  // Its natural size tells a landscape card from a portrait one. Cached by the
  // stored URL, not the optimizer's, so every view of the card agrees.
  const photoSrc = source.kind === "none" ? "" : source.src;
  const measure = useCallback((img: HTMLImageElement) => measureShape(photoSrc, img, onShape), [onShape, photoSrc]);

  // A cached photo can finish before hydration, so check once on mount.
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete) return;
      measure(img);
      onStatus(img.naturalWidth > 0 ? "load" : "error");
    },
    [onStatus, measure],
  );

  const placeholder = <PhotoPlaceholder card={card} />;
  if (source.kind === "none" || showPhotoPlaceholder(source, status)) return placeholder;

  const eager = tileLoading(index) === "eager";
  const priority = fetchPriority ?? (eager ? "high" : "auto");
  const imgClass = photoClass({ eager: eager || preload, status, shape });

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
          onLoad={(event) => {
            measure(event.currentTarget);
            onStatus("load");
          }}
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
          onLoad={(event) => {
            measure(event.currentTarget);
            onStatus("load");
          }}
          onError={() => onStatus("error")}
          className={imgClass}
        />
      )}
    </>
  );
}

