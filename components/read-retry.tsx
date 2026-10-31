/** A read that failed, never "not found": says so, and reads again on tap. */
export function ReadRetry({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div data-read-retry="" className="py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none"
      >
        Try again
      </button>
    </div>
  );
}
