"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Chip,
  PrimaryButton,
  QuietButton,
  RunBadge,
  SectionLabel,
  SwatchDot,
  focusRing,
} from "@/components/add-card/flow-ui";
import { GRADE_NUMBERS, isValidCardNumber } from "@/lib/card-options";
import {
  GRADE_CHIP_COMPANIES,
  SERIAL_RUN_CHIPS,
  gradeNeedsNumber,
  serialNoError,
  type ParallelOption,
  type SerialChoice,
} from "@/lib/cards/add-flow";
import { parallelMatchKey } from "@/lib/cards/parallels";

const inputClass =
  "min-h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-lg font-semibold tracking-tight text-zinc-900 outline-none placeholder:font-medium placeholder:text-zinc-400 focus:border-violet-500 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:placeholder:text-zinc-500";

const panelClass =
  "mt-2 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 motion-safe:animate-[add-fade_160ms_ease-out] dark:border-white/10 dark:bg-white/[0.03]";

/** Card #. Text input mode, because numbers like SS-ZN exist. */
export function NumberStep({
  value,
  noNumber,
  onChange,
  onNoNumber,
  onNext,
}: {
  value: string;
  noNumber: boolean;
  onChange: (value: string) => void;
  onNoNumber: (noNumber: boolean) => void;
  onNext: () => void;
}) {
  const [tried, setTried] = useState(false);
  const ok = noNumber || isValidCardNumber(value);
  const error = tried && !ok ? "Use letters, numbers and dashes, like 136 or SS-ZN." : null;

  function next() {
    setTried(true);
    if (ok) onNext();
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sr-only">Card number</span>
        <span className="relative block">
          <span
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-semibold text-zinc-400"
            aria-hidden
          >
            #
          </span>
          <input
            data-field="cardNumber"
            value={value}
            disabled={noNumber}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "card-number-error" : undefined}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              next();
            }}
            placeholder="136 or SS-ZN"
            className={`${inputClass} pl-9 uppercase placeholder:normal-case`}
          />
        </span>
      </label>
      {error ? (
        <p id="card-number-error" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
        <span className="grid size-11 shrink-0 place-items-center">
          <input
            type="checkbox"
            checked={noNumber}
            onChange={(event) => onNoNumber(event.target.checked)}
            className="size-5 accent-violet-500"
          />
        </span>
        No number on card
      </label>
      <PrimaryButton onClick={next}>Next</PrimaryButton>
    </div>
  );
}

/** Which parallel. Swatch chips, Base first and big, with a run badge when the checklist knows it. */
export function ParallelStep({
  value,
  options,
  loading,
  isAuto,
  onAuto,
  onPick,
  onNotSure,
}: {
  value: string;
  options: readonly ParallelOption[];
  loading: boolean;
  isAuto: boolean;
  onAuto: (isAuto: boolean) => void;
  onPick: (option: ParallelOption) => void;
  onNotSure: () => void;
}) {
  const [query, setQuery] = useState("");
  const [unsure, setUnsure] = useState(false);
  const current = parallelMatchKey(value);
  const base = options.find((option) => parallelMatchKey(option.name) === "base") ?? {
    name: "Base",
    serialRun: null,
  };
  const rest = options.filter((option) => parallelMatchKey(option.name) !== "base");
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? rest.filter((option) => option.name.toLowerCase().includes(needle)) : rest),
    [needle, rest],
  );
  const exact = options.some((option) => option.name.toLowerCase() === needle);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">Signed card? Autos price very differently.</p>
        <Chip selected={isAuto} onClick={() => onAuto(!isAuto)} aria-label="Auto (signed)">
          Auto
        </Chip>
      </div>

      <button
        type="button"
        aria-pressed={current === "base"}
        onClick={() => onPick(base)}
        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 text-left transition-[border-color,transform] duration-150 motion-safe:active:scale-[0.98] motion-reduce:transition-none ${focusRing} ${
          current === "base"
            ? "border-violet-600 bg-violet-600/10 ring-1 ring-violet-600"
            : "border-zinc-200 bg-white hover:border-violet-400 dark:border-white/10 dark:bg-white/[0.04]"
        }`}
      >
        <SwatchDot name="Base" size="lg" />
        <span className="min-w-0">
          <span className="block text-base font-bold tracking-tight">Base</span>
          <span className="block text-xs text-zinc-500">No color, no shine, no number</span>
        </span>
      </button>

      {options.length > 12 ? (
        <label className="relative block">
          <span className="sr-only">Search parallels</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (shown[0]) onPick(shown[0]);
              else if (query.trim()) onPick({ name: query.trim(), serialRun: null });
            }}
            placeholder={`Search ${options.length} parallels`}
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white pr-3 pl-10 text-sm outline-none focus:border-violet-500 dark:border-white/10 dark:bg-white/5"
          />
        </label>
      ) : null}

      <ul className="grid grid-cols-2 gap-2">
        {loading
          ? Array.from({ length: 6 }, (_, index) => (
              <li key={`skeleton-${index}`} aria-hidden>
                <span className="skeleton-shimmer block h-12 rounded-xl" />
              </li>
            ))
          : shown.map((option) => {
              const selected = parallelMatchKey(option.name) === current;
              return (
                <li key={option.name}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={
                      option.serialRun
                        ? `${option.name}, numbered to ${option.serialRun}`
                        : option.name
                    }
                    onClick={() => onPick(option)}
                    className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm font-semibold transition-[border-color,transform] duration-150 motion-safe:active:scale-[0.97] motion-reduce:transition-none ${focusRing} ${
                      selected
                        ? "border-violet-600 bg-violet-600/10 ring-1 ring-violet-600"
                        : "border-zinc-200 bg-white hover:border-violet-400 dark:border-white/10 dark:bg-white/[0.04]"
                    }`}
                  >
                    <SwatchDot name={option.name} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    {option.serialRun ? <RunBadge run={option.serialRun} /> : null}
                  </button>
                </li>
              );
            })}
      </ul>

      {needle && !exact ? (
        <Chip onClick={() => onPick({ name: query.trim(), serialRun: null })}>
          Use &ldquo;{query.trim()}&rdquo;
        </Chip>
      ) : null}
      {!loading && needle && shown.length === 0 ? (
        <p className="text-sm text-zinc-500">No parallel by that name. Type it exactly as on the card.</p>
      ) : null}

      <div>
        <QuietButton aria-expanded={unsure} onClick={() => setUnsure((open) => !open)}>
          Not sure?
        </QuietButton>
        {unsure ? (
          <div className={panelClass}>
            <p className="text-sm font-semibold">How to tell</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              <li>Check the border color. Base cards usually have a plain border.</li>
              <li>Tilt it under a light. A rainbow shine means a refractor or Prizm.</li>
              <li>Look for a stamped number on the back, like 23/99.</li>
            </ul>
            <button
              type="button"
              onClick={onNotSure}
              className={`inline-flex min-h-11 items-center rounded-full border border-zinc-300 px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-100 dark:hover:bg-white/5 ${focusRing}`}
            >
              I&apos;m not sure, save it anyway
            </button>
            <p className="text-xs text-zinc-500">
              We won&apos;t show a price until you pick the parallel.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Numbered? Chips for common runs, then an optional "Your number". */
export function SerialStep({
  serialRun,
  serialNo,
  knownRun,
  onChoose,
  onSerialNo,
  onNext,
}: {
  serialRun: string;
  serialNo: string;
  knownRun: number | null;
  onChoose: (choice: SerialChoice, advance: boolean) => void;
  onSerialNo: (value: string) => void;
  onNext: () => void;
}) {
  const run = Number(serialRun);
  const hasRun = Number.isInteger(run) && run >= 1;
  const listed = (SERIAL_RUN_CHIPS as readonly number[]).includes(run) || run === 1;
  const [other, setOther] = useState(hasRun && !listed ? String(run) : "");
  const [otherOpen, setOtherOpen] = useState(hasRun && !listed);
  const [tried, setTried] = useState(false);
  const error = serialNoError(serialNo, serialRun);
  const shownError = error && (tried || serialNo.trim() !== "") ? error : null;

  function applyOther() {
    const value = Number(other);
    if (Number.isInteger(value) && value >= 1 && value <= 10000) {
      onChoose(value === 1 ? { kind: "one_of_one" } : { kind: "run", run: value }, value === 1);
    }
  }

  return (
    <div className="space-y-5">
      {knownRun ? (
        <p className="rounded-xl bg-violet-500/10 px-3 py-2 text-sm text-violet-800 dark:text-[#A78BFA]">
          The checklist says /{knownRun}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Chip selected={!hasRun} onClick={() => onChoose({ kind: "none" }, true)}>
          Not numbered
        </Chip>
        {SERIAL_RUN_CHIPS.map((chip) => (
          <Chip
            key={chip}
            selected={run === chip}
            onClick={() => {
              setOtherOpen(false);
              onChoose({ kind: "run", run: chip }, false);
            }}
            className="tabular-nums"
          >
            /{chip}
          </Chip>
        ))}
        <Chip selected={run === 1} onClick={() => onChoose({ kind: "one_of_one" }, true)}>
          1/1
        </Chip>
        <Chip selected={otherOpen} onClick={() => setOtherOpen(true)}>
          Other
        </Chip>
      </div>

      {otherOpen ? (
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-zinc-400" aria-hidden>
            /
          </span>
          <input
            value={other}
            inputMode="numeric"
            aria-label="Print run"
            placeholder="e.g. 149"
            onChange={(event) => setOther(event.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyOther();
            }}
            className={`${inputClass} max-w-40 tabular-nums`}
          />
          <Chip onClick={applyOther}>Set</Chip>
        </div>
      ) : null}

      {hasRun && run > 1 ? (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-500">
              Your number <span className="text-zinc-400">(optional)</span>
            </span>
            <span className="flex items-center gap-2">
              <input
                value={serialNo}
                inputMode="numeric"
                aria-label={`Your number, out of ${run}`}
                aria-invalid={shownError ? true : undefined}
                aria-describedby={shownError ? "serial-no-error" : undefined}
                placeholder="23"
                onChange={(event) => onSerialNo(event.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  setTried(true);
                  if (!error) onNext();
                }}
                className={`${inputClass} max-w-32 tabular-nums`}
              />
              <span className="text-lg font-semibold text-zinc-500 tabular-nums">/{run}</span>
            </span>
          </label>
          {shownError ? (
            <p id="serial-no-error" role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {shownError}
            </p>
          ) : null}
          <PrimaryButton
            onClick={() => {
              setTried(true);
              if (!error) onNext();
            }}
          >
            Next
          </PrimaryButton>
        </div>
      ) : null}

      <QuietButton onClick={() => onChoose({ kind: "unsure" }, true)}>Not sure</QuietButton>
    </div>
  );
}

/** Graded or raw. Raw moves on; a grader shows its numbers. */
export function GradeStep({
  company,
  number,
  onCompany,
  onNumber,
}: {
  company: string;
  number: string;
  onCompany: (company: string) => void;
  onNumber: (number: string) => void;
}) {
  const needsNumber = gradeNeedsNumber(company);
  const numbers = needsNumber ? (GRADE_NUMBERS[company] ?? GRADE_NUMBERS.Other) : [];
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Company</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {GRADE_CHIP_COMPANIES.map((item) => (
            <Chip
              key={item.value}
              selected={item.value === company || (!needsNumber && item.label === "Raw")}
              onClick={() => onCompany(item.value)}
            >
              {item.label}
            </Chip>
          ))}
          <QuietButton onClick={() => onCompany("Not sure")}>Not sure</QuietButton>
        </div>
      </div>
      {needsNumber ? (
        <div className="motion-safe:animate-[add-fade_160ms_ease-out]">
          <SectionLabel>{company} grade</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {numbers.map((grade) => (
              <Chip
                key={grade}
                selected={grade === number}
                onClick={() => onNumber(grade)}
                className="w-full px-2 tabular-nums"
              >
                {grade}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
