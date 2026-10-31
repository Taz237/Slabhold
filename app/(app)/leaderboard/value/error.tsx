"use client";

export default function ValueLeaderboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-medium">Something went wrong</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
      >
        Try again
      </button>
    </div>
  );
}
