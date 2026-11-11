"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import {
  STARTUP_DETAIL,
  STARTUP_NOTICE,
  STARTUP_RETRY,
  STARTUP_RETRYING,
  STARTUP_TITLE,
} from "@/lib/startup/boot";

/**
 * The purple star tile, inline: this screen shows when the network is the
 * problem, so it can't count on fetching public/logo.svg. Same shapes and colors.
 */
function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="h-14 w-14">
      <rect width="32" height="32" rx="8" fill="#7C3AED" />
      <rect x="9" y="3.5" width="14" height="25" rx="2.25" fill="#fff" />
      <rect x="11.15" y="5.75" width="9.7" height="3.5" rx="0.85" fill="#5B21B6" />
      <path
        fill="#5B21B6"
        d="M16 14.5 17.09 17.55 20.33 17.64 17.76 19.62 18.67 22.73 16 20.9 13.33 22.73 14.24 19.62 11.67 17.64 14.91 17.55Z"
      />
    </svg>
  );
}

function useRetry(onRetry: () => void) {
  const [trying, setTrying] = useState(false);
  return {
    trying,
    retry() {
      if (trying) return;
      setTrying(true);
      onRetry();
    },
  };
}

/** Full screen: the app couldn't start, and the page under it would be blank. */
export function StartupError({ onRetry }: { onRetry: () => void }) {
  const { trying, retry } = useRetry(onRetry);
  return (
    <main
      data-startup-error=""
      className="flex min-h-dvh flex-col items-center justify-center bg-[var(--background)] px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-[var(--foreground)]"
    >
      <LogoMark />
      <h1 className="mt-6 text-[22px] leading-7 font-semibold tracking-tight">{STARTUP_TITLE}</h1>
      <p className="mt-2 max-w-[18rem] text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">{STARTUP_DETAIL}</p>
      <button
        type="button"
        onClick={retry}
        disabled={trying}
        aria-busy={trying || undefined}
        className="mt-8 flex h-12 min-w-[11rem] items-center justify-center gap-2 rounded-full bg-violet-600 px-6 text-[16px] font-semibold text-white transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none"
      >
        <RotateCw aria-hidden size={18} strokeWidth={1.75} />
        {trying ? STARTUP_RETRYING : STARTUP_RETRY}
      </button>
    </main>
  );
}

/** One line under the header: the page shows, but the app couldn't finish starting. */
export function StartupNotice({ onRetry }: { onRetry: () => void }) {
  const { trying, retry } = useRetry(onRetry);
  return (
    <div
      role="status"
      data-startup-notice=""
      className="flex items-center justify-center gap-2 border-b border-zinc-200 px-4 text-[14px] text-zinc-600 dark:border-white/10 dark:text-zinc-300"
    >
      <span>{STARTUP_NOTICE}</span>
      <button
        type="button"
        onClick={retry}
        disabled={trying}
        className="min-h-11 rounded-full px-3 font-semibold text-violet-700 hover:bg-violet-600/10 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:text-[#A78BFA]"
      >
        {trying ? STARTUP_RETRYING : STARTUP_RETRY}
      </button>
    </div>
  );
}
