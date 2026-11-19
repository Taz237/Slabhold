import { EbaySoldLink } from "@/components/ebay-sold-link";
import { splitFallbackLabel } from "@/lib/value/price-fallback";

/** Range and last-sale lines wrap on the word boundary, not inside the price. */
export function PriceFallbackText({ text }: { text: string }) {
  const parts = splitFallbackLabel(text);
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1">
      {parts.map((part) => (
        <span key={part} className="whitespace-nowrap big:whitespace-normal">
          {part}
        </span>
      ))}
    </span>
  );
}

export function EbaySoldLine({ href }: { href: string }) {
  return (
    <p className="text-sm text-zinc-500">
      <EbaySoldLink href={href} />
    </p>
  );
}
