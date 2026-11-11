"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";
import { PrimaryButton, StepDock, focusRing } from "@/components/add-card/flow-ui";
import { SheetFrame } from "@/components/search-select";

/**
 * Edit card, drawn like an iOS Settings screen: grouped lists with hairline
 * dividers. Each row shows its label, the current value in muted text and a
 * chevron, and opens a bottom sheet to change it.
 */

/** A titled group of rows on one quiet surface, split by hairlines. */
export function EditGroup({ title, children }: { title?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={title ? titleId : undefined}>
      {title ? (
        <h2 id={titleId} className="mb-2 px-4 text-[13px] font-medium text-zinc-500">
          {title}
        </h2>
      ) : null}
      <div className="divide-y divide-zinc-200/80 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/80 dark:divide-white/[0.07] dark:bg-white/[0.035] dark:ring-white/[0.07]">
        {children}
      </div>
    </section>
  );
}

const rowBase = `flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-[15px] transition-colors duration-150 ease-out hover:bg-zinc-50 active:bg-zinc-100 motion-reduce:transition-none dark:hover:bg-white/[0.03] dark:active:bg-white/[0.06] ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`;

/**
 * One row: label on the left, value on the right, chevron. `value` empty shows
 * `placeholder`; `error` replaces the value in red so a blocked save says why.
 */
export function EditRow({
  label,
  value,
  placeholder = "Add",
  error,
  onClick,
  dataField,
  expanded,
  chevron = true,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  error?: string | null;
  onClick?: () => void;
  dataField?: string;
  expanded?: boolean;
  chevron?: boolean;
}) {
  const shown = value?.trim() ? value : placeholder;
  const valueClass = error
    ? "text-rose-600 dark:text-rose-400"
    : value?.trim()
      ? "text-zinc-500 dark:text-zinc-400"
      : "text-zinc-400 dark:text-zinc-500";
  const body = (
    <>
      <span className="shrink-0 text-zinc-900 dark:text-zinc-100">{label}</span>
      <span className={`ml-auto min-w-0 truncate text-right tabular-nums ${valueClass}`}>{error ?? shown}</span>
      {chevron ? <ChevronRight className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden /> : null}
    </>
  );
  if (!onClick) {
    return (
      <div className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-[15px]" data-field={dataField}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-field={dataField}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={`${label}: ${error ?? shown}`}
      onClick={onClick}
      className={rowBase}
    >
      {body}
    </button>
  );
}

/**
 * A bottom sheet over the page. Portaled to the body and laid inside the
 * visual viewport, so with the keyboard up it rests on the keyboard. It never
 * moves focus by itself: a list sheet opens on its choices.
 */
export function EditSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <SheetFrame titleId={titleId} onClose={onClose}>
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <p id={titleId} className="text-base font-semibold">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`-mr-2 grid size-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 ${focusRing}`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer}
    </SheetFrame>,
    document.body,
  );
}

const sheetInput =
  "min-h-12 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:[color-scheme:dark]";

/**
 * A row whose sheet holds one field. A text or number field is focused as the
 * sheet opens (inside the tap, so iOS raises the keyboard) with Done on top of
 * the keyboard. A date field is not focused: tapping it opens the native picker.
 */
export function FieldSheetRow({
  label,
  value,
  display,
  placeholder,
  error,
  dataField,
  type = "text",
  inputMode,
  prefix,
  inputPlaceholder,
  hint,
  onChange,
  extra,
}: {
  label: string;
  value: string;
  /** What the row shows, when it differs from the raw value ("$25.00"). */
  display?: string;
  placeholder?: string;
  error?: string | null;
  dataField?: string;
  type?: "text" | "number" | "date";
  inputMode?: "decimal" | "numeric" | "text";
  /** "$" or "#" in front of the field. */
  prefix?: string;
  inputPlaceholder?: string;
  hint?: string;
  onChange: (value: string) => void;
  /** More controls under the field, e.g. "No number on card". */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typing = type !== "date";
  useLayoutEffect(() => {
    if (open && typing) inputRef.current?.focus({ preventScroll: true });
  }, [open, typing]);
  const close = () => setOpen(false);
  return (
    <>
      <EditRow
        label={label}
        value={display ?? value}
        placeholder={placeholder}
        error={error}
        dataField={dataField}
        expanded={open}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <EditSheet
          title={label}
          onClose={close}
          footer={
            <StepDock layer="sheet">
              <PrimaryButton onClick={close}>Done</PrimaryButton>
            </StepDock>
          }
        >
          <label className="block">
            <span className="sr-only">{label}</span>
            <span className="relative block">
              {prefix ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-base text-zinc-400"
                >
                  {prefix}
                </span>
              ) : null}
              <input
                ref={inputRef}
                type={type}
                inputMode={inputMode}
                min={type === "number" ? 0 : undefined}
                step={type === "number" ? "0.01" : undefined}
                value={value}
                placeholder={inputPlaceholder}
                autoComplete="off"
                enterKeyHint="done"
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  close();
                }}
                className={`${sheetInput} ${prefix ? "pl-8" : ""} ${type === "date" ? "appearance-none" : ""}`}
              />
            </span>
          </label>
          {error ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
          {hint ? <p className="mt-2 text-sm text-zinc-500">{hint}</p> : null}
          {extra ? <div className="mt-3">{extra}</div> : null}
        </EditSheet>
      ) : null}
    </>
  );
}

/** A row that opens a sheet of any content: visibility, notes, Mark as sold. */
export function SheetRow({
  label,
  value,
  placeholder,
  error,
  dataField,
  title,
  children,
  footer,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  error?: string | null;
  dataField?: string;
  title?: string;
  children: (close: () => void) => ReactNode;
  footer?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <EditRow
        label={label}
        value={value}
        placeholder={placeholder}
        error={error}
        dataField={dataField}
        expanded={open}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <EditSheet
          title={title ?? label}
          onClose={close}
          footer={
            footer ? (
              footer(close)
            ) : (
              <StepDock layer="sheet">
                <PrimaryButton onClick={close}>Done</PrimaryButton>
              </StepDock>
            )
          }
        >
          {children(close)}
        </EditSheet>
      ) : null}
    </>
  );
}

export const sheetFieldClass = sheetInput;

/** "$1,250.00" from a typed amount. Empty for nothing typed. */
export function moneyRowValue(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const amount = Number(text);
  if (!Number.isFinite(amount)) return text;
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "Nov 11, 2026" from "2026-11-11". Read as a calendar date, never shifted by time zone. */
export function dateRowValue(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!match) return raw.trim();
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "7 / 99", "/ 99", or "7" from the serial number and run. */
export function serialRowValue(serialNo: string, serialRun: string): string {
  const no = serialNo.trim();
  const run = serialRun.trim();
  if (no && run) return `${no} / ${run}`;
  if (run) return `/ ${run}`;
  return no;
}
