"use client";

import Link from "next/link";
import { addCardSheetHosted, openAddCardSheet, opensAddSheet } from "@/lib/cards/add-card-sheet";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/**
 * At least 44px tall, with a visible focus ring. A tap opens the Add card
 * sheet; without the app shell (or on a new-tab click) it links to /cards/new.
 */
export function AddCardLink({ prominent = false }: { prominent?: boolean }) {
  const className = prominent
    ? `mt-6 inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-zinc-900 px-6 text-base font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950 ${focusRing}`
    : `inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950 ${focusRing}`;
  return (
    <Link href="/cards/new" onClick={openSheetFromLink} className={className}>
      Add a card
    </Link>
  );
}

/** onClick for any link to /cards/new: opens the sheet instead, when the shell can show it. True when it did. */
export function openSheetFromLink(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
}): boolean {
  if (!opensAddSheet(event) || !addCardSheetHosted()) return false;
  event.preventDefault();
  openAddCardSheet();
  return true;
}
