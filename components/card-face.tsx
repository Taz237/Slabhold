import { initials } from "@/lib/format";
import type { SportsCard } from "@/lib/types";

export function CardFace({
  card,
  className = "",
}: {
  card: Pick<SportsCard, "playerName" | "year" | "accent" | "photoDataUrl" | "cardNumber">;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.9)] ${className}`}
      style={{ aspectRatio: "5 / 7" }}
    >
      {card.photoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.photoDataUrl}
          alt={card.playerName}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full flex-col justify-between p-3"
          style={{
            background: `radial-gradient(120% 80% at 20% 0%, ${card.accent}aa, transparent 55%), linear-gradient(160deg, #16181f 0%, #0b0c10 70%)`,
          }}
        >
          <div className="flex items-start justify-between text-[10px] tracking-[0.22em] text-white/55 uppercase">
            <span>{card.year}</span>
            <span>#{card.cardNumber}</span>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <span className="font-display text-4xl text-white/90">
              {initials(card.playerName)}
            </span>
          </div>
          <p className="text-[11px] font-medium leading-tight text-white">
            {card.playerName}
          </p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-white/5" />
    </div>
  );
}
