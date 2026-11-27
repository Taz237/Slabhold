"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { POLL_CHOICE_REPEAT, POLL_MIN_OPTIONS, POLL_OPTION_MAX, type PollDraft, type PollLength } from "@/lib/social/poll-draft";
import {
  addChoice,
  canAddChoice,
  clampPollLength,
  pollLengthChoices,
  removeChoice,
  repeatedChoices,
  setChoice,
  singleLineChoice,
} from "@/lib/social/poll-editor";

export type ComposePollProps = {
  draft: PollDraft;
  onChange: (next: PollDraft) => void;
  onRemove: () => void;
};

const UNITS: { unit: keyof PollLength; label: string }[] = [
  { unit: "days", label: "Days" },
  { unit: "hours", label: "Hours" },
  { unit: "minutes", label: "Minutes" },
];

/**
 * The poll editor under the composer's text, the X way: two choices to
 * start, up to four, 25 characters each, a length from 5 minutes to 7 days,
 * and Remove poll to go back to a normal post.
 */
export function ComposePollView({
  draft,
  onChange,
  onRemove,
}: ComposePollProps) {
  const id = useId();
  const [focused, setFocused] = useState<number | null>(null);
  const repeats = repeatedChoices(draft.options);

  function changeLength(unit: keyof PollLength, value: number) {
    onChange({ ...draft, length: clampPollLength({ ...draft.length, [unit]: value }) });
  }

  return (
    <div
      data-compose-poll=""
      className="mt-3 overflow-hidden rounded-[20px] border border-zinc-200 motion-safe:animate-[composer-in_180ms_cubic-bezier(0.2,0.7,0.2,1)_backwards] dark:border-white/10"
    >
      <div className="space-y-2.5 p-3">
        {draft.options.map((value, index) => {
          const optional = index >= POLL_MIN_OPTIONS;
          const label = `Choice ${index + 1}${optional ? " (optional)" : ""}`;
          const repeat = repeats.has(index);
          const length = [...value].length;
          return (
            <div key={index}>
              <div className="flex items-center gap-1">
                <div
                  className={`relative min-w-0 flex-1 rounded-lg border transition-colors focus-within:border-violet-600 dark:focus-within:border-[#A78BFA] ${
                    repeat ? "border-rose-500" : "border-zinc-300 dark:border-white/15"
                  }`}
                >
                  <input
                    id={`${id}-choice-${index}`}
                    type="text"
                    value={value}
                    // An optional choice isn't required, but once added it must be filled to post.
                    required={!optional}
                    maxLength={POLL_OPTION_MAX}
                    enterKeyHint={index === draft.options.length - 1 ? "done" : "next"}
                    autoComplete="off"
                    aria-label={label}
                    aria-invalid={repeat || undefined}
                    aria-describedby={repeat ? `${id}-repeat-${index}` : `${id}-count-${index}`}
                    placeholder={label}
                    onFocus={() => setFocused(index)}
                    onBlur={() => setFocused((current) => (current === index ? null : current))}
                    onChange={(event) => onChange(setChoice(draft, index, event.target.value))}
                    // One line only: a paste loses its line breaks and control characters.
                    onPaste={(event) => {
                      event.preventDefault();
                      const input = event.currentTarget;
                      const start = input.selectionStart ?? value.length;
                      const end = input.selectionEnd ?? value.length;
                      const pasted = singleLineChoice(event.clipboardData.getData("text"));
                      onChange(setChoice(draft, index, value.slice(0, start) + pasted + value.slice(end)));
                      const caret = Math.min(start + pasted.length, POLL_OPTION_MAX);
                      requestAnimationFrame(() => input.setSelectionRange(caret, caret));
                    }}
                    // Enter never adds a line and never posts: it moves to the next choice, or closes the keyboard.
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      const next = document.getElementById(`${id}-choice-${index + 1}`);
                      if (next) next.focus();
                      else event.currentTarget.blur();
                    }}
                    className="block min-h-12 w-full bg-transparent py-3 pr-14 pl-3 text-16 caret-[#7C3AED] outline-none placeholder:text-zinc-500"
                  />
                  <span
                    id={`${id}-count-${index}`}
                    aria-live={focused === index && length >= POLL_OPTION_MAX ? "polite" : undefined}
                    className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-12 tabular-nums ${
                      focused === index ? "opacity-100" : "opacity-0"
                    } ${length >= POLL_OPTION_MAX ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"}`}
                  >
                    {length}/{POLL_OPTION_MAX}
                  </span>
                </div>
                {optional ? (
                  <button
                    type="button"
                    aria-label={`Remove choice ${index + 1}`}
                    onClick={() => onChange(removeChoice(draft, index))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 active:bg-zinc-100 dark:active:bg-white/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {repeat ? (
                <p id={`${id}-repeat-${index}`} className="mt-1 px-1 text-13 text-rose-600 dark:text-rose-400">
                  {POLL_CHOICE_REPEAT}
                </p>
              ) : null}
            </div>
          );
        })}
        {canAddChoice(draft) ? (
          <button
            type="button"
            onClick={() => onChange(addChoice(draft))}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-15 font-semibold text-violet-700 active:bg-violet-500/10 dark:text-[#A78BFA]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add option
          </button>
        ) : null}
      </div>

      <fieldset className="border-t border-zinc-200 px-3 pt-2.5 pb-3 dark:border-white/10">
        <legend className="sr-only">Poll length</legend>
        <p aria-hidden="true" className="text-13 font-medium text-zinc-500">
          Poll length
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 big:grid-cols-1">
          {UNITS.map(({ unit, label }) => (
            <label key={unit} className="relative block">
              <span className="pointer-events-none absolute top-1.5 left-3 text-11 text-zinc-500">{label}</span>
              <select
                value={draft.length[unit]}
                onChange={(event) => changeLength(unit, Number(event.target.value))}
                className="block min-h-12 w-full appearance-none rounded-lg border border-zinc-300 bg-transparent px-3 pt-4 pb-1 font-mono text-15 tabular-nums outline-none focus:border-violet-600 dark:border-white/15 dark:focus:border-[#A78BFA]"
              >
                {pollLengthChoices(unit, draft.length).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={onRemove}
        className="block min-h-12 w-full border-t border-zinc-200 text-15 font-medium text-rose-600 active:bg-rose-500/5 dark:border-white/10 dark:text-rose-400"
      >
        Remove poll
      </button>
    </div>
  );
}
