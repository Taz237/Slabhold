import type { ReactNode } from "react";

/**
 * The card page's title block, shared by the public card and the owner's
 * card: the year and set small and quiet, the player big, then the specs as
 * one plain line. An action (the want-list star) sits to the right at a fixed
 * 44px, so it never wraps under the name or crowds it.
 */

/**
 * "Basketball · #160 · Silver · PSA 10", from the fields the card already has.
 * `parallelName` gives the parallel its checklist name (lib/cards/parallels);
 * the loading shell leaves it out so that code stays off its first load.
 */
export function cardSpecs(
  card: {
    setBrand: string;
    cardNumber: string;
    parallel?: string | null;
    grade?: string | null;
    sport?: string | null;
  },
  parallelName: (setBrand: string, parallel: string) => string = (_set, parallel) => parallel.trim(),
): string[] {
  const number = card.cardNumber.trim();
  return [
    card.sport?.trim() || null,
    number && number !== "—" ? `#${number}` : null,
    card.parallel?.trim() ? parallelName(card.setBrand, card.parallel) : null,
    card.grade?.trim() || null,
  ].filter((value): value is string => Boolean(value));
}

export function CardHeading({
  eyebrow,
  name,
  specs = [],
  tag,
  action,
}: {
  /** "2018 Prizm". */
  eyebrow: string;
  /** The player, usually a link. */
  name: ReactNode;
  specs?: readonly string[];
  /** A short status under the specs ("Open to offers"). */
  tag?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div data-card-heading="" className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 leading-5 text-zinc-500 dark:text-zinc-400">{eyebrow}</p>
        <h1 className="text-[1.75rem] leading-9 font-semibold tracking-tight text-balance">{name}</h1>
        {specs.length > 0 ? (
          <p data-card-specs="" className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
            {specs.map((spec, index) => (
              <span key={spec}>
                {index > 0 ? (
                  <span aria-hidden="true" className="px-1.5 text-zinc-400 dark:text-zinc-600">
                    ·
                  </span>
                ) : null}
                <span className="whitespace-nowrap big:whitespace-normal">{spec}</span>
              </span>
            ))}
          </p>
        ) : null}
        {tag ? <div className="mt-2">{tag}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
