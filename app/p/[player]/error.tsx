"use client";

import { EmptyState } from "@/components/status";

export default function PlayerRouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <meta name="robots" content="noindex" />
      <EmptyState title="Couldn't load this player" detail="Try again in a moment.">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Try again
        </button>
      </EmptyState>
    </>
  );
}
