"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
 * What a lazyPart draws when its chunk would not load, even after its own
 * retry. Kept apart from every lazy chunk so it is in place when they fail.
 */

const tryAgainClass = `inline-flex min-h-11 items-center rounded-full px-5 font-semibold bg-violet-600 text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none`;

/** The "Couldn't load this" line and Try again. Only the sheet passes `autoFocus`. */
function TryAgainPanel({ retry, autoFocus = false }: { retry: () => void; autoFocus?: boolean }) {
  return (
    <div data-read-retry="" className="py-4 text-center text-sm">
      <p className="text-zinc-500">Couldn&apos;t load this.</p>
      <button type="button" onClick={retry} autoFocus={autoFocus} className={`mt-2 ${tryAgainClass}`}>
        Try again
      </button>
    </div>
  );
}

/**
 * A chunk that would not load: ReadRetry's look, compact, in the section's spot.
 * Never pulls focus. Its props stay `{ retry }` so lazyPart infers its part's props.
 */
export function PartLoadFailed({ retry }: { retry: () => void }) {
  return <TryAgainPanel retry={retry} />;
}

/**
 * A sheet that opens from a tap but would not load: a small bottom sheet with
 * the same Try again, plus Close, so the tap is answered. Escape closes it too.
 * Only ever drawn on the client (lazyPart gives the server its fallback). It
 * takes focus on Try again and hands it back to the opener when it goes,
 * unless focus has already moved outside it (a real sheet that loaded).
 */
export function SheetLoadFailed({ retry, onClose }: { retry: () => void; onClose: () => void }) {
  // Read before Try again's autoFocus runs, so this is the element that opened the sheet.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Layout cleanup runs before the sheet leaves the DOM and before a sheet that
  // replaces it autofocuses. Hand focus back only if it is still ours to give.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      const active = document.activeElement;
      const ours = !active || active === document.body || Boolean(dialog?.contains(active));
      if (ours && opener?.isConnected) opener.focus?.();
    };
  }, [opener]);

  useEffect(() => {
    // Capture phase, so Escape closes only this and not a sheet underneath it.
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Couldn't open this"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] mx-auto max-w-sm rounded-3xl border border-zinc-200 bg-[var(--background)] pb-2 shadow-2xl dark:border-white/10"
    >
      <TryAgainPanel retry={retry} autoFocus />
      <button type="button" onClick={onClose} className="mx-auto flex min-h-11 items-center px-5 text-sm font-semibold text-zinc-500">
        Close
      </button>
    </div>,
    document.body,
  );
}
