"use client";

import { ChartBarBig } from "lucide-react";

/** The home feed's poll button. Same look as the thread button beside it. */
export function InlinePollButton({ state, onStart }: { state: "hidden" | "disabled" | "on"; onStart: () => void }) {
  if (state === "hidden") return null;
  return (
    <button
      type="button"
      aria-label="Add a poll"
      disabled={state === "disabled"}
      onClick={onStart}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#7C3AED] transition-colors hover:bg-violet-500/10 disabled:opacity-40 dark:text-[#A78BFA]"
    >
      <ChartBarBig className="h-5 w-5" />
    </button>
  );
}
