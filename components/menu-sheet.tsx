"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { useSheetDrag } from "@/lib/ui/use-sheet-drag";

/** One row of a menu sheet: 52px tall, an icon in a fixed column, then the label. */
export const menuSheetItem =
  "tap-row flex min-h-[3.25rem] w-full items-center gap-3 px-5 text-left text-base font-semibold disabled:opacity-60 focus-visible:bg-zinc-100 focus-visible:outline-none dark:focus-visible:bg-white/10";

/** The row's icon. Takes the row's text colour, so a red row gets a red icon. */
export function MenuSheetIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 opacity-70" strokeWidth={1.75} />;
}

/**
 * The ⋯ menu as a bottom sheet: it slides up from the bottom edge, follows a
 * downward swipe and closes past the threshold, and slides away when the
 * backdrop or Cancel is tapped (lib/ui/use-sheet-drag.ts). Drawn at the end
 * of <body>, so a post row can never clip it. A tap inside it or on its
 * backdrop never reaches the row it was opened from. Escape closes it, and
 * focus goes back to the button that opened it.
 */
export function MenuSheet({
  label,
  onClose,
  children,
}: {
  /** What the menu is for, read to screen readers: "Post options". */
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismiss = useSheetDrag(panelRef, rootRef, onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("[role='menuitem'], button, a[href]")?.focus({ preventScroll: true });
    // Capture phase, so Escape closes only this sheet and not one underneath it.
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={rootRef}
      data-menu-sheet=""
      className="backdrop-in fixed inset-0 z-[70] grid place-items-end bg-black/60 sm:place-items-center"
      onClick={dismiss}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-labelledby={titleId}
        // A tap in the sheet must not open the post row it was opened from.
        onClick={(event) => event.stopPropagation()}
        className="sheet-slide w-full max-w-sm overflow-hidden rounded-t-3xl border-t border-zinc-200 bg-[var(--background)] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-zinc-900 shadow-2xl sm:rounded-3xl sm:border dark:border-white/10 dark:text-zinc-100"
      >
        <div aria-hidden="true" className="mx-auto mb-1 h-1 w-9 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
        <h2 id={titleId} className="sr-only">
          {label}
        </h2>
        {children}
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={dismiss}
            className="tap flex min-h-12 w-full items-center justify-center rounded-full border border-zinc-300 text-base font-semibold dark:border-white/20"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
