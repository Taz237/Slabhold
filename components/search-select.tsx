"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { searchSelectCommit } from "@/lib/ui/search-select";
import { useVisualViewport } from "@/lib/ui/use-keyboard-inset";

export const SET_PARALLEL_HINT =
  "Can't find it? Type it exactly as on the card or slab.";

const controlClass =
  "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100";

export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
  allowEmpty = false,
  allowCustom = false,
  isCustomValid,
  customHint,
  customInvalidHint,
  dataField,
  inputMode,
  filter,
  searchPlaceholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  /** Show Use "…" when the typed query is not in the list. */
  allowCustom?: boolean;
  /** When set, Use "…" only appears for values that pass. */
  isCustomValid?: (value: string) => boolean;
  /** Shown above Use "…" when the typed text is not an exact option. */
  customHint?: string;
  /** Shown after Return on a typed value that fails isCustomValid. Never while typing. */
  customInvalidHint?: string;
  dataField?: string;
  inputMode?: "decimal" | "numeric" | "text";
  /** Matches and their order for a query. Defaults to "contains". */
  filter?: (options: string[], query: string) => string[];
  /** The search field's placeholder, when "Search or type a {label}" does not read right. */
  searchPlaceholder?: string;
}) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Set by a Return that could not save; typing clears it, so a partial entry never reads as an error.
  const [rejected, setRejected] = useState(false);

  const needle = query.trim().toLowerCase();
  const filtered = filter
    ? filter(options, query)
    : needle
      ? options.filter((option) => option.toLowerCase().includes(needle))
      : options;

  const customValue = query.trim();
  const customCandidate =
    allowCustom &&
    Boolean(customValue) &&
    !options.some(
      (option) => option.toLowerCase() === customValue.toLowerCase(),
    );
  const customOk =
    !isCustomValid || (customValue ? isCustomValid(customValue) : false);
  const showCustom = Boolean(customCandidate && customOk);
  const showCustomInvalid = Boolean(
    rejected && customCandidate && !customOk && customInvalidHint,
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The list comes first: nothing is focused when the sheet opens, so the
    // iOS keyboard only opens when the search field itself is tapped.
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setRejected(false);
  }

  function choose(next: string) {
    onChange(next);
    close();
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        data-field={dataField}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={controlClass}
      >
        <span className={`min-w-0 truncate ${value ? "" : "text-zinc-400 dark:text-zinc-500"}`}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
      {/* Portaled, so a transformed parent (Add card's step slide) never pins the sheet to itself. */}
      {open ? createPortal(
        <SheetFrame titleId={titleId} onClose={close}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <p id={titleId} className="text-base font-semibold">
              {label}
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-2 grid size-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRejected(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
                const committed = searchSelectCommit({
                  query,
                  options,
                  allowCustom,
                  isCustomValid,
                });
                if (committed != null) choose(committed);
                else if (!allowCustom && filtered[0]) choose(filtered[0]);
                else setRejected(true);
              }}
              inputMode={inputMode}
              placeholder={
                searchPlaceholder ??
                (allowCustom
                  ? `Search or type a ${label.toLowerCase()}`
                  : `Search ${label.toLowerCase()}`)
              }
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-zinc-400 sm:text-sm"
            />
          </label>
          <ul className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {showCustom ? (
              <li>
                {customHint ? (
                  <p className="px-3 pt-1 pb-1 text-xs text-zinc-500">{customHint}</p>
                ) : null}
                <OptionButton
                  selected={false}
                  onClick={() => choose(customValue)}
                >
                  {`Use "${customValue}"`}
                </OptionButton>
              </li>
            ) : null}
            {allowEmpty ? (
              <li>
                <OptionButton selected={!value} onClick={() => choose("")}>
                  None
                </OptionButton>
              </li>
            ) : null}
            {showCustomInvalid ? (
              <li className="px-3 py-3 text-center text-sm text-rose-600 dark:text-rose-400">
                {customInvalidHint}
              </li>
            ) : null}
            {filtered.length === 0 && !showCustom && !showCustomInvalid ? (
              <li className="px-3 py-6 text-center text-sm text-zinc-500">No matches</li>
            ) : (
              filtered.map((option) => (
                <li key={option}>
                  <OptionButton selected={option === value} onClick={() => choose(option)}>
                    {option}
                  </OptionButton>
                </li>
              ))
            )}
          </ul>
        </SheetFrame>,
        document.body,
      ) : null}
    </>
  );
}

/**
 * The sheet sits inside window.visualViewport, so with the iOS keyboard up it
 * rests on the keyboard instead of under it. Keyboard up, it takes the whole
 * visible height: title, search, then the results right under the search.
 */
function SheetFrame({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { frame, inset } = useVisualViewport();
  const keyboard = inset > 0;
  return (
    <div
      data-keyboard={keyboard ? "open" : undefined}
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center sm:items-center"
      style={frame ? { top: frame.top, height: frame.height } : undefined}
    >
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex w-full max-w-lg flex-col rounded-t-3xl border border-zinc-200 bg-[var(--background)] p-4 shadow-2xl sm:rounded-3xl dark:border-white/10 ${
          keyboard
            ? "h-[calc(100%-0.75rem)] pb-2"
            : "max-h-[min(32rem,85dvh)] pb-[max(1rem,env(safe-area-inset-bottom))]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm ${
        selected ? "bg-violet-500/10 font-semibold" : "hover:bg-zinc-100 dark:hover:bg-white/5"
      }`}
    >
      <span className="truncate">{children}</span>
      {selected ? <Check className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" /> : null}
    </button>
  );
}

export function NativeSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  dataField,
  onBlur,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  dataField?: string;
  onBlur?: () => void;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        disabled={disabled}
        data-field={dataField}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 pr-9 text-sm text-zinc-900 outline-none focus:border-violet-500 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:[color-scheme:dark]"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}
