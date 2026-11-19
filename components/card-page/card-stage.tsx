"use client";

import { useState } from "react";
import { CardThumb } from "@/components/card-thumb";
import { useImageLightbox } from "@/components/image-lightbox";
import type { SportsCard } from "@/lib/types";
import { thumbnailsIn } from "@/lib/ui/thumbnail-origins";
import { CARD_ART, CardStageFrame, STAGE_HEIGHT, STAGE_WIDTH } from "@/components/card-page/card-stage-frame";

/**
 * The card page's hero: the card, big, on the soft purple glow the profile's
 * Spotlight carousel uses (see card-stage-frame). A portrait card fills the
 * stage; a sideways card sits whole in its middle at its true shape. Nothing
 * is cropped or stretched: the photo keeps its own ratio. Tap opens it full screen.
 */

export function CardStage({ card }: { card: Pick<SportsCard, "playerName" | "photoDataUrl" | "accent"> }) {
  const open = useImageLightbox();
  // A photo missing from storage shows the designed tile, never a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  const src = card.photoDataUrl && failed !== card.photoDataUrl ? card.photoDataUrl : null;
  return (
    <CardStageFrame>
      {src ? (
        <button
          type="button"
          aria-label={`View ${card.playerName} full screen`}
          onClick={(event) => open(src, card.playerName, undefined, { origins: thumbnailsIn(event.currentTarget) })}
          className="tap block cursor-zoom-in rounded-xl border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={(img) => {
              // A server-rendered photo can fail before hydration adds onError.
              if (img?.complete && img.naturalWidth === 0) setFailed(src);
            }}
            src={src}
            alt={card.playerName}
            data-photo-index={0}
            decoding="async"
            loading="eager"
            fetchPriority="high"
            onError={() => setFailed(src)}
            className={`block h-auto w-auto ${CARD_ART}`}
            style={{ maxHeight: STAGE_HEIGHT, maxWidth: STAGE_WIDTH }}
          />
        </button>
      ) : (
        <CardThumb card={{ ...card, photoDataUrl: null }} className={`aspect-[5/7] h-full text-2xl ${CARD_ART}`} />
      )}
    </CardStageFrame>
  );
}
