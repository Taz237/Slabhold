"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/*
 * What a lazyPart draws when its chunk would not load, even after its own
 * retry. Kept apart from every lazy chunk so it is in place when they fail.
 */

const tryAgainClass = `inline-flex min-h-11 items-center rounded-full px-5 font-bold bg-violet-600 text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none`;

/** A chunk that would not load: ReadRetry's look, compact, in the section's spot. */
export function PartLoadFailed({ retry }: { retry: () => void }) {
  return (
    <div data-read-retry="" className="py-4 text-center text-sm">
      <p className="text-zinc-500">Couldn&apos;t load this.</p>
      <button type="button" onClick={retry} className={`mt-2 ${tryAgainClass}`}>
        Try again
      </button>
    </div>
  );
}

/**
 * A sheet that opens from a tap but would not load: a small bottom sheet with
 * the same Try again, plus Close, so the tap is answered. Escape closes it too.
 * Only ever drawn on the client (lazyPart gives the server its fallback).
 */
export function SheetLoadFailed({ retry, onClose }: { retry: () => void; onClose: () => void }) {
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
      role="dialog"
      aria-label="Couldn't open this"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] mx-auto max-w-sm rounded-3xl border border-zinc-200 bg-[var(--background)] pb-2 shadow-2xl dark:border-white/10"
    >
      <PartLoadFailed retry={retry} />
      <button type="button" onClick={onClose} className="mx-auto flex min-h-11 items-center px-5 text-sm font-bold text-zinc-500">
        Close
      </button>
    </div>,
    document.body,
  );
}
