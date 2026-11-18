"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/ui/focus-trap";
import { useSheetDrag } from "@/lib/ui/use-sheet-drag";

/**
 * The Collection tab's bottom sheet: share, the leaderboard switch, sort and
 * filter, and a tile's quick actions. It slides up from the bottom edge,
 * follows a downward swipe, and closes on the backdrop, the close button or
 * Escape. Focus stays inside while it is open and goes back to the control
 * that opened it.
 */
export function CollectionSheet({
  title,
  detail,
  onClose,
  children,
}: {
  title: string;
  /** One quiet line under the title, e.g. the card's year and set. */
  detail?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const dismiss = useSheetDrag(panelRef, rootRef, onClose);
  useFocusTrap(panelRef);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
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
      data-collection-sheet=""
      className="backdrop-in fixed inset-0 z-[70] grid place-items-end bg-black/60 sm:place-items-center"
      onClick={dismiss}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="collection-sheet sheet-slide relative max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border-t border-zinc-200 px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-zinc-900 shadow-2xl sm:rounded-3xl sm:border dark:border-white/10 dark:text-zinc-100"
      >
        <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
        <div className="flex min-h-12 items-center justify-between gap-3 pt-1">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold tracking-tight">
              {title}
            </h2>
            {detail ? <p className="truncate text-13 text-zinc-500 dark:text-zinc-400">{detail}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className="tap -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-600 dark:text-zinc-400 dark:hover:bg-white/10"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
