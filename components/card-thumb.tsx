"use client";

import { useState } from "react";
import { initials } from "@/lib/format";
import type { SportsCard } from "@/lib/types";
import { measureShape, useCardShape, type CardShape } from "@/lib/ui/card-shape";

export function CardThumb({
  card,
  className = "",
  priority = false,
  onShape,
}: {
  card: Pick<SportsCard, "playerName" | "photoDataUrl" | "accent">;
  className?: string;
  /** Detail view: decode off the critical path and ask for the photo first. */
  priority?: boolean;
  /**
   * Told the photo's shape once it loads. With it, a landscape photo is shown
   * whole (contained); without it, the thumb crops as it always has.
   */
  onShape?: (shape: CardShape) => void;
}) {
  // A photo missing from storage shows the no-photo fallback, not a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  const [shape, setShape] = useCardShape(onShape ? card.photoDataUrl : null);
  if (card.photoDataUrl && failed !== card.photoDataUrl) {
    const src = card.photoDataUrl;
    const measure = (img: HTMLImageElement) =>
      onShape &&
      measureShape(src, img, (next) => {
        setShape(next);
        onShape(next);
      });
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={card.playerName}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        ref={(img) => {
          // A server-rendered photo can fail before hydration adds onError.
          if (img?.complete && img.naturalWidth === 0) setFailed(src);
          else if (img?.complete) measure(img);
        }}
        onLoad={onShape ? (event) => measure(event.currentTarget) : undefined}
        onError={() => setFailed(src)}
        className={`${shape === "landscape" ? "object-contain" : "object-cover"} ${className}`}
      />
    );
  }

  return (
    <div
      className={`grid place-items-center text-sm font-semibold tracking-wide text-white ${className}`}
      style={{
        background: `linear-gradient(160deg, ${card.accent}, color-mix(in oklab, ${card.accent} 40%, #09090b))`,
      }}
    >
      {initials(card.playerName)}
    </div>
  );
}

/**
 * A small thumb that keeps its slot for a portrait card and turns its box
 * sideways for a landscape one, so the whole photo shows.
 */
export function ShapedCardThumb({
  card,
  className,
  landscapeClassName,
  priority = false,
}: {
  card: Pick<SportsCard, "playerName" | "photoDataUrl" | "accent">;
  className: string;
  landscapeClassName: string;
  priority?: boolean;
}) {
  const [shape, onShape] = useCardShape(card.photoDataUrl);
  return (
    <CardThumb
      card={card}
      priority={priority}
      onShape={onShape}
      className={shape === "landscape" ? landscapeClassName : className}
    />
  );
}
