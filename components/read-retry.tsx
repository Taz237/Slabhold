"use client";

import { useState } from "react";

/**
 * A read that failed, never "not found" or "nothing yet": says so, and reads
 * again on tap. While a retry that returns a promise runs, the button says
 * so and ignores extra taps.
 */
export function ReadRetry({
  title,
  detail = "Check your connection and try again.",
  onRetry,
  compact = false,
}: {
  title: string;
  detail?: string;
  onRetry: () => unknown;
  compact?: boolean;
}) {
  const [trying, setTrying] = useState(false);

  function retry() {
    if (trying) return;
    const result = onRetry();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setTrying(true);
      void Promise.resolve(result)
        .catch(() => {})
        .finally(() => setTrying(false));
    }
  }

  return (
    <div data-read-retry="" className={compact ? "px-4 py-10 text-center" : "py-16 text-center"}>
      <p className={`font-semibold tracking-tight ${compact ? "text-17" : "text-lg"}`}>{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500">{detail}</p>
      <button
        type="button"
        onClick={retry}
        disabled={trying}
        aria-busy={trying || undefined}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
      >
        {trying ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}
