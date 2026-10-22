"use client";

export default function CardDetailError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-medium">Something went wrong opening this card.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
      >
        Try again
      </button>
    </div>
  );
}
