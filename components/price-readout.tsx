import Link from "next/link";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { SIMILAR_CARDS_LABEL, splitFallbackLabel, type PriceRead } from "@/lib/value/price-fallback";

/** Range and last-sale lines wrap on the word boundary, not inside the price. */
export function PriceFallbackText({ text }: { text: string }) {
  const parts = splitFallbackLabel(text);
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1">
      {parts.map((part) => (
        <span key={part} className="whitespace-nowrap">
          {part}
        </span>
      ))}
    </span>
  );
}

/** Similar-card line with a tap-through. The label is not an estimate. */
export function SimilarCardsLine({
  read,
}: {
  read: Extract<PriceRead, { kind: "similar" }>;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{SIMILAR_CARDS_LABEL}</p>
      <Link
        href={read.href}
        className="mt-1 block text-lg font-semibold tracking-tight text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
      >
        {read.detail}
      </Link>
      <p className="mt-1 text-sm text-zinc-500 tabular-nums">{read.priceText}</p>
    </div>
  );
}

export function EbaySoldLine({ href }: { href: string }) {
  return (
    <p className="text-sm text-zinc-500">
      <EbaySoldLink href={href} />
    </p>
  );
}
