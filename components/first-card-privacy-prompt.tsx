/** One-time nudge after the first private card. The toggle is the caller's privacy handler. */
export function FirstCardPrivacyPrompt({
  onToggle,
  onDismiss,
}: {
  onToggle: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4"
      aria-label="Card privacy"
    >
      <p className="text-sm leading-5">Only you can see this card. Show it on your profile?</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={false}
          aria-label="Show it on your profile"
          onClick={onToggle}
          className="inline-flex min-h-11 items-center gap-3 rounded-full bg-violet-600 px-4 text-sm font-semibold text-white"
        >
          <span aria-hidden className="relative h-6 w-11 rounded-full bg-white/30">
            <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white" />
          </span>
          Show on profile
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
