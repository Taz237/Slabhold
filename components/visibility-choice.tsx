"use client";

const OPTIONS = [
  { id: true, label: "Public" },
  { id: false, label: "Private" },
] as const;

/** Public | Private at the top of Add card. The hint is one line for the current choice. */
export function VisibilityChoice({
  isPublic,
  onChange,
  hint,
}: {
  isPublic: boolean;
  onChange: (isPublic: boolean) => void;
  hint: string;
}) {
  return (
    <fieldset className="min-w-0 max-w-full">
      <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
        Who can see this card
      </legend>
      <div
        role="radiogroup"
        aria-label="Who can see this card"
        className="flex min-w-0 max-w-full flex-wrap gap-2"
      >
        {OPTIONS.map((option) => {
          const selected = isPublic === option.id;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={`inline-flex min-h-11 min-w-0 flex-1 basis-[7.5rem] items-center justify-center rounded-full border px-3 text-sm font-semibold ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint ? (
        <p className="mt-2 max-w-full min-w-0 text-sm leading-5 break-words text-zinc-600 dark:text-zinc-300">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Owner-only chip on a private card. The caller paints through updateCard. */
export function MakePublicChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 max-w-full min-w-0 items-center rounded-full border border-violet-400/40 px-3 text-sm font-semibold text-violet-700 dark:text-violet-300"
    >
      Make public
    </button>
  );
}
