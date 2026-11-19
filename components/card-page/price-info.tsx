"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { PRICE_INFO_LABEL } from "@/components/card-page/value-head";
import { useCloseOnOutsideTap } from "@/lib/ui/menu-outside-tap";

/** ⓘ beside the price: a small popover with the lines behind the number. */
export function PriceInfo({ lines, defaultOpen = false }: { lines: readonly string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useCloseOnOutsideTap(open, root, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!lines.length) return null;
  return (
    <div ref={root} data-price-info="" className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={PRICE_INFO_LABEL}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="grid h-11 w-11 place-items-center rounded-full text-zinc-400 outline-none transition-colors duration-150 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none dark:text-zinc-500 dark:hover:text-zinc-200"
      >
        <Info aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>
      {open ? (
        <div
          id={panelId}
          role="note"
          className="chart-fade absolute top-11 right-0 z-30 w-[min(18rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 text-13 leading-5 text-zinc-600 shadow-[0_8px_24px_rgb(0_0_0/0.12)] ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:text-zinc-300 dark:shadow-none dark:ring-white/10"
        >
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

