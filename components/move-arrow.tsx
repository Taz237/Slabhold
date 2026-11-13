import type { ChangeTone } from "@/lib/chart/range";
import { moveArrow } from "@/lib/chart/theme";

/** ▲ or ▼ beside a change, with the word for screen readers. Flat has no arrow. */
export function MoveArrow({ tone, className = "text-10 leading-none" }: { tone: ChangeTone; className?: string }) {
  if (tone === "flat") return null;
  return (
    <>
      <span aria-hidden className={className}>
        {moveArrow(tone)}
      </span>
      <span className="sr-only">{tone}</span>
    </>
  );
}
