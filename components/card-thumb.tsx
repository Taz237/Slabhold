"use client";

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
  if (card.photoDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={card.photoDataUrl}
        alt={card.playerName}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
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
