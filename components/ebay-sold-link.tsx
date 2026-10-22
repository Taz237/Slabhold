import { EBAY_SOLD_LINK_LABEL } from "@/lib/value/ebay-sold";

export function EbaySoldLink({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
      }
      onClick={(event) => event.stopPropagation()}
    >
      {EBAY_SOLD_LINK_LABEL}
    </a>
  );
}

/** One line when this card and similar cards have no sales. */
export function EmptyPriceNote({ href }: { href: string | null }) {
  return (
    <p className="text-sm text-zinc-500">
      No sales found yet
      {href ? (
        <>
          {" · "}
          <EbaySoldLink href={href} />
        </>
      ) : null}
    </p>
  );
}
