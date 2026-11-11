"use client";

import { useCallback, useState } from "react";

/** A quick action that didn't save (Mark sold, Move category): one line and Try again. */
export function ActionError({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={`flex flex-wrap items-center gap-x-2 text-sm text-rose-600 dark:text-rose-400 ${className}`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center rounded-full px-2 font-semibold text-violet-700 hover:bg-violet-600/10 dark:text-[#A78BFA]"
      >
        Try again
      </button>
    </p>
  );
}

type Failure = { key: string; message: string; retry: () => void };

/**
 * Runs a save and remembers a failure per spot (`key`), with a retry that
 * runs the same save again. A later success at that spot clears it.
 */
export function useActionRetry() {
  const [failure, setFailure] = useState<Failure | null>(null);

  const run = useCallback((key: string, message: string, save: () => Promise<unknown>) => {
    const attempt = async (): Promise<boolean> => {
      setFailure((current) => (current?.key === key ? null : current));
      try {
        await save();
        return true;
      } catch {
        setFailure({ key, message, retry: () => void attempt() });
        return false;
      }
    };
    return attempt();
  }, []);

  const failureFor = useCallback((key: string) => (failure?.key === key ? failure : null), [failure]);
  const clear = useCallback((key: string) => {
    setFailure((current) => (current?.key === key ? null : current));
  }, []);

  return { run, failureFor, clear };
}
