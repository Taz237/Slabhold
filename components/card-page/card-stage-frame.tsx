import type { ReactNode } from "react";
import { STAGE_HEIGHT } from "@/components/card-page/section-styles";

/**
 * The card page's stage: one fixed-height box on a soft Slabhold purple glow,
 * the same look as the profile's Spotlight carousel. The height never changes
 * with the card, so the page never moves. The glow is three still radial
 * gradients that fade out before the stage's edges: no blur, no animation,
 * nothing to repaint on scroll. No imports beyond React, so the shell's
 * tap-time skeleton can draw it without the card page's code.
 */

export { STAGE_HEIGHT };
/** The widest a sideways card gets: the page column. */
export const STAGE_WIDTH = "min(calc(100vw - 2rem), 30rem)";

const GLOW =
  "radial-gradient(40% 42% at 30% 42%, #7c3aed 0%, transparent 100%), radial-gradient(40% 40% at 71% 60%, #5b21b6 0%, transparent 100%), radial-gradient(50% 48% at 50% 50%, rgba(167, 139, 250, 0.5) 0%, transparent 100%)";

/** The card art's corner, shadow and hairline. */
export const CARD_ART = "rounded-xl shadow-[0_20px_36px_-20px_rgb(0_0_0/0.6)] ring-1 ring-black/10 dark:ring-white/10";

export function CardStageFrame({ children, busy = false }: { children?: ReactNode; busy?: boolean }) {
  return (
    <section data-slot="card-hero" data-card-stage="" className="relative -mx-4 overflow-clip py-5" aria-busy={busy || undefined}>
      <div aria-hidden="true" data-card-glow="" className="pointer-events-none absolute inset-0 opacity-45 dark:opacity-65" style={{ background: GLOW }} />
      <div className="relative flex items-center justify-center px-4" style={{ height: STAGE_HEIGHT }}>
        {children}
      </div>
    </section>
  );
}

/** The stage before the card is known: the same box, with a quiet card-shaped tile. */
export function CardStageSkeleton() {
  return (
    <CardStageFrame busy>
      <div aria-hidden="true" data-skeleton="card" className="skeleton-shimmer aspect-[5/7] h-full rounded-xl bg-zinc-200/60 dark:bg-white/[0.06]" />
    </CardStageFrame>
  );
}
