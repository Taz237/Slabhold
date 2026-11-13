import { charRing } from "@/lib/ui/char-ring";

/**
 * The composer's character ring, shared by every place that writes a post,
 * reply or caption. Purple while there's room, amber for the last 20, rose
 * with a negative count once over. Decorative: pair it with a sr-only count.
 */
export function CharacterRing({ length, limit }: { length: number; limit: number }) {
  const ring = charRing(length, limit);
  if (!ring.visible) return null;
  const size = ring.label ? 28 : 20;
  const half = size / 2;
  const radius = half - 1.25;
  return (
    <span
      aria-hidden
      data-tone={ring.tone}
      className={`relative grid shrink-0 place-items-center ${
        ring.tone === "over"
          ? "text-rose-500"
          : ring.tone === "warn"
            ? "text-amber-500"
            : "text-[#7C3AED] dark:text-[#A78BFA]"
      }`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" fill="none" strokeWidth={2.5}>
        <circle cx={half} cy={half} r={radius} className="stroke-zinc-200 dark:stroke-zinc-700" />
        <circle
          cx={half}
          cy={half}
          r={radius}
          stroke="currentColor"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - ring.progress}
        />
      </svg>
      {ring.label ? (
        <span className="absolute text-11 font-medium whitespace-nowrap tabular-nums">{ring.label}</span>
      ) : null}
    </span>
  );
}
