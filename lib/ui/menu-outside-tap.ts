"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * The click that follows a menu-dismiss mousedown. Removed on that click, or
 * after a beat if the press never becomes a click, so a later tap still lands.
 */
let pendingSwallow: (() => void) | null = null;

export function swallowFollowingClick() {
  pendingSwallow?.();
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    finish();
  };
  const finish = () => {
    document.removeEventListener("click", swallow, true);
    window.clearTimeout(timer);
    if (pendingSwallow === finish) pendingSwallow = null;
  };
  document.addEventListener("click", swallow, true);
  const timer = window.setTimeout(finish, 1000);
  pendingSwallow = finish;
}

export function clearMenuClickSwallow() {
  pendingSwallow?.();
}

/**
 * Close when the pointer goes down outside `root`, and swallow the click that
 * follows. Menus used to close on mousedown, so the same tap's click opened
 * the post underneath.
 */
export function useCloseOnOutsideTap(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  close: () => void,
) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const root = rootRef.current;
      if (root?.contains(event.target as Node)) return;
      closeRef.current();
      // The click after this mousedown is what would open the post. Swallow that
      // click, and let it fire so a phone tap is not left pending.
      swallowFollowingClick();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, rootRef]);
}
