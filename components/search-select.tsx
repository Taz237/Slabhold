"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

const controlClass =
  "flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100";

export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
  allowEmpty = false,
  allowCustom = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  /** Show Use "…" when the typed query is not in the list. */
  allowCustom?: boolean;
}) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [options, query]);

  const customValue = query.trim();
  const showCustom =
    allowCustom &&
    Boolean(customValue) &&
    !options.some(
      (option) => option.toLowerCase() === customValue.toLowerCase(),
    );

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
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
        onClick={() => setOpen(true)}
        className={controlClass}
      >
        <span className={`min-w-0 truncate ${value ? "" : "text-zinc-400 dark:text-zinc-500"}`}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={close} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex max-h-[min(32rem,85vh)] w-full max-w-lg flex-col rounded-t-3xl border border-zinc-200 bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl dark:border-white/10"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
            <div className="mb-3 flex items-center justify-between gap-3">
              <p id={titleId} className="text-base font-semibold">
                {label}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <Search className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && filtered[0]) {
                    event.preventDefault();
                    choose(filtered[0]);
                  }
                }}
                placeholder={`Search ${label.toLowerCase()}`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
            </label>
            <ul className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {allowEmpty ? (
                <li>
                  <OptionButton selected={!value} onClick={() => choose("")}>
                    None
                  </OptionButton>
                </li>
              ) : null}
              {showCustom ? (
                <li>
                  <OptionButton
                    selected={false}
                    onClick={() => choose(customValue)}
                  >
                    {`Use "${customValue}"`}
                  </OptionButton>
                </li>
              ) : null}
              {filtered.length === 0 && !showCustom ? (
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
          </div>
        </div>
      ) : null}
    </>
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
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        disabled={disabled}
        value={value}
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
