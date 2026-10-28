"use client";

import { useState } from "react";
import { initials } from "@/lib/format";
import type { SportsCard } from "@/lib/types";

export function CardThumb({
  card,
  className = "",
  priority = false,
}: {
  card: Pick<SportsCard, "playerName" | "photoDataUrl" | "accent">;
  className?: string;
  /** Detail view: decode off the critical path and ask for the photo first. */
  priority?: boolean;
}) {
  // A photo missing from storage shows the no-photo fallback, not a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  if (card.photoDataUrl && failed !== card.photoDataUrl) {
    const src = card.photoDataUrl;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={card.playerName}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        ref={(img) => {
          // A server-rendered photo can fail before hydration adds onError.
          if (img?.complete && img.naturalWidth === 0) setFailed(src);
        }}
        onError={() => setFailed(src)}
        className={`object-cover ${className}`}
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
