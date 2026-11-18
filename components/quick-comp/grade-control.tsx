"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import {
  OTHER_COMPANIES,
  OTHER_GRADE,
  QUICK_GRADES,
  isPresetGrade,
  otherGrade,
  otherGradeNumbers,
  otherGradeParts,
} from "@/lib/quick-comp/grades";
import { feedback, focusRing, sectionLabel } from "./tokens";

const OPTIONS = [...QUICK_GRADES, OTHER_GRADE] as const;

const segment = `flex min-h-11 items-center justify-center rounded-lg px-2 text-13 font-medium tabular-nums ${feedback} ${focusRing}`;
const segmentOn = "bg-white text-zinc-950 ring-1 ring-violet-600/50 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-violet-400/50";
const segmentOff = "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50";
const select = `min-h-11 w-full rounded-[10px] bg-white px-3 text-sm ring-1 ring-zinc-950/10 dark:bg-white/[0.04] dark:ring-white/10 ${focusRing}`;

/**
 * Raw · PSA 10 · PSA 9 · BGS 9.5 · SGC 10 · Other, as one radiogroup.
 * Arrow keys move and pick, like native radios. Each pick is its own lookup.
 */
export function GradeControl({
  grade,
  otherOpen,
  onChange,
  onOpenOther,
}: {
  grade: string;
  otherOpen: boolean;
  /** `preset` from a segment, `other` from the selects. */
  onChange: (grade: string, from: "preset" | "other") => void;
  onOpenOther: () => void;
}) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = otherOpen || !isPresetGrade(grade) ? OTHER_GRADE : grade;
  const parts = otherGradeParts(grade);

  function choose(option: string) {
    if (option === OTHER_GRADE) onOpenOther();
    else onChange(option, "preset");
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + OPTIONS.length) % OPTIONS.length;
    refs.current[next]?.focus();
    choose(OPTIONS[next]);
  }

  return (
    <div>
      <p id={labelId} className={sectionLabel}>
        Grade
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-zinc-950/[0.04] p-1 sm:grid-cols-6 dark:bg-white/[0.04]"
      >
        {OPTIONS.map((option, index) => {
          const on = option === current;
          return (
            <button
              key={option}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(option)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`${segment} ${on ? segmentOn : segmentOff}`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {current === OTHER_GRADE ? (
        <div className="mt-2 grid grid-cols-2 big:grid-cols-1 gap-2">
          <label className="block">
            <span className="sr-only">Grading company</span>
            <select
              value={parts.company}
              onChange={(event) => {
                const numbers = otherGradeNumbers(event.target.value);
                const number = numbers.includes(parts.number) ? parts.number : (numbers[0] ?? "10");
                onChange(otherGrade(event.target.value, number), "other");
              }}
              className={select}
            >
              {OTHER_COMPANIES.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Grade</span>
            <select
              value={parts.number}
              onChange={(event) => onChange(otherGrade(parts.company, event.target.value), "other")}
              className={`${select} tabular-nums`}
            >
              {otherGradeNumbers(parts.company).map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
