import { CardThumb } from "@/components/card-thumb";
import { Logo } from "@/components/logo";
import type { PublicCard } from "@/lib/social/types";

const TILT = ["-rotate-[9deg] translate-y-3", "z-10 -translate-y-1", "rotate-[9deg] translate-y-3"];

/** A clear acrylic slab around a real card photo. Sized up front, so nothing shifts. */
export function SlabFrame({ card, className = "", priority = false }: { card: PublicCard | null; className?: string; priority?: boolean }) {
  return (
    <div
      className={`rounded-[1.1rem] border border-white/25 bg-gradient-to-b from-white/25 via-white/[0.07] to-white/[0.12] p-1.5 shadow-[0_24px_50px_-18px_rgba(0,0,0,0.85)] ${className}`}
    >
      <div className="relative aspect-[5/7] overflow-hidden rounded-[0.7rem] bg-gradient-to-br from-[#7C3AED] via-[#5B21B6] to-[#09090B]">
        {card ? (
          <CardThumb card={card} priority={priority} className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="grid h-full place-items-center">
            <Logo className="h-10 w-10" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Up to three slabs, tilted, the best in the middle. No cards: one empty slab with the logo. */
export function SlabFan({ cards, size = "md" }: { cards: PublicCard[]; size?: "md" | "lg" }) {
  const width = size === "lg" ? "w-[8.5rem] sm:w-40" : "w-28 sm:w-32";
  if (cards.length === 0) {
    return (
      <div className="flex justify-center py-3" aria-hidden>
        <SlabFrame card={null} className={width} />
      </div>
    );
  }
  // Best card in the middle: [2nd, 1st, 3rd].
  const order = cards.length >= 3 ? [cards[1], cards[0], cards[2]] : cards.length === 2 ? [cards[1], cards[0]] : [cards[0]];
  const tilts = order.length === 3 ? TILT : order.length === 2 ? [TILT[0], TILT[2]] : [TILT[1]];
  return (
    <ul aria-label="Top public cards" className="flex items-start justify-center py-3">
      {order.map((card, index) => (
        <li
          key={card.id}
          className={`${width} shrink-0 ${index > 0 ? "-ml-8 sm:-ml-6" : ""} ${tilts[index]} motion-safe:transition-transform motion-safe:duration-300`}
        >
          <SlabFrame card={card} priority />
        </li>
      ))}
    </ul>
  );
}
