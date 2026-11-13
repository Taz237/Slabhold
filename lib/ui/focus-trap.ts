import { useEffect, type RefObject } from "react";

/** What Tab can land on inside an open sheet or scene. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]):not(.hidden), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab (or Shift+Tab) should go so focus stays inside the open layer:
 * the first or last control at the ends, or back in when it's outside. Null
 * leaves the browser's own Tab alone.
 */
export function trappedFocusTarget<T>(focusables: readonly T[], active: T | null, shift: boolean): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const index = active == null ? -1 : focusables.indexOf(active);
  if (index === -1) return shift ? last : first;
  if (shift && index === 0) return last;
  if (!shift && index === focusables.length - 1) return first;
  return null;
}

/** Keeps Tab and Shift+Tab inside `ref` while `active`. Controls with tabIndex -1 (a backdrop) are skipped. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const target = trappedFocusTarget(focusables, document.activeElement as HTMLElement | null, event.shiftKey);
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, active]);
}
