"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Chip, PrimaryButton, QuietButton, RunBadge, SectionLabel, SwatchDot, focusRing } from "@/components/add-card/flow-ui";
import {
  CONFIRM_COPY,
  confirmMatch,
  gradeLabel,
  initialChoice,
  maskCert,
  matchLine,
  promoteMatch,
  type ParallelPick,
} from "@/lib/scan/confirm";
import type { FieldSureness, ScanMatch } from "@/lib/scan/match";

export type ConfirmSheetState =
  | { kind: "matching" }
  | { kind: "ready"; matches: ScanMatch[] }
  | { kind: "none"; offline?: boolean };

type Props = {
  /** The cropped scan. Null shows a designed placeholder. */
  photo: string | null;
  state: ConfirmSheetState;
  /** The top match with the sheet's parallel and serial picks applied. */
  onConfirm: (match: ScanMatch) => void;
  /** None of these, or no match: the guided Add card with the photo. */
  onStepByStep: () => void;
  onRetake: () => void;
  onClose: () => void;
};

/**
 * "Is this your card?" A bottom sheet over the camera. The top match is one
 * tap to accept; a wrong row or parallel is one tap to fix.
 */
export function ConfirmSheet({ photo, state, onConfirm, onStepByStep, onRetake, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = state.kind === "none" ? CONFIRM_COPY.noMatchTitle : CONFIRM_COPY.title;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label={CONFIRM_COPY.close}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/50 motion-safe:animate-[lightbox-fade_180ms_cubic-bezier(0.22,1,0.36,1)_both]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={state.kind === "matching"}
        tabIndex={-1}
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-[var(--background)] pb-[env(safe-area-inset-bottom)] outline-none motion-safe:animate-[composer-in_320ms_cubic-bezier(0.22,1,0.36,1)_both] md:rounded-3xl dark:border-white/10"
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-zinc-300 dark:bg-white/20" />
        <div className="flex items-center justify-between gap-2 pr-2 pl-5 pt-2">
          <h2 id={titleId} className="text-[17px] font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={CONFIRM_COPY.close}
            className={`inline-flex size-11 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-900/5 dark:hover:bg-white/10 ${focusRing}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
          {state.kind === "matching" ? <Matching photo={photo} /> : null}
          {state.kind === "none" ? (
            <NoMatch photo={photo} offline={Boolean(state.offline)} onStepByStep={onStepByStep} onRetake={onRetake} />
          ) : null}
          {state.kind === "ready" ? (
            <Ready
              key={state.matches.map((match) => match.catalogId ?? match.playerName).join("|")}
              photo={photo}
              matches={state.matches}
              onConfirm={onConfirm}
              onStepByStep={onStepByStep}
              onRetake={onRetake}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Ready({
  photo,
  matches,
  onConfirm,
  onStepByStep,
  onRetake,
}: {
  photo: string | null;
  matches: ScanMatch[];
  onConfirm: (match: ScanMatch) => void;
  onStepByStep: () => void;
  onRetake: () => void;
}) {
  const [rows, setRows] = useState(matches);
  const top = rows[0];
  const [pick, setPick] = useState<ParallelPick>(() => (top ? initialChoice(top) : null));
  // "Something else": leave the parallel for Add card to ask.
  const [deferred, setDeferred] = useState(false);
  const [serialNo, setSerialNo] = useState(top?.serialNo ?? "");
  const [error, setError] = useState<string | null>(null);
  const serialId = useId();
  const errorId = useId();

  if (!top) return null;

  function promote(index: number) {
    const next = promoteMatch(rows, index);
    setRows(next);
    setPick(initialChoice(next[0]));
    setDeferred(false);
    setSerialNo(next[0].serialNo);
    setError(null);
  }

  function choose(next: ParallelPick) {
    setPick(next);
    setDeferred(next === null);
    setError(null);
  }

  function confirm() {
    const result = confirmMatch(top, pick, serialNo);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onConfirm(result.match);
  }

  const options = top.parallelOptions.length > 0 ? top.parallelOptions : top.parallel ? [{ name: top.parallel, serialRun: top.serialRun }] : [];
  const grade = gradeLabel(top.grade);
  const cert = maskCert(top.grade?.certNumber ?? "");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[80px_1fr] items-start gap-4">
        <CardPhoto photo={photo} name={top.playerName} />
        <div className="min-w-0 pt-1">
          <p className="text-[17px] leading-6 font-semibold">
            <Field sureness={top.sureness.player}>{top.playerName}</Field>
          </p>
          <p className="mt-1 text-sm leading-5">
            <Field sureness={top.sureness.year}>{top.yearLabel}</Field>{" "}
            <Field sureness={top.sureness.set}>{top.setBrand}</Field>{" "}
            {top.cardNumber ? <Field sureness={top.sureness.number}>{`#${top.cardNumber}`}</Field> : null}
          </p>
          {grade || top.isRookie || top.isAuto ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {grade ? (
                <span className="rounded-md border border-zinc-300 px-2 py-0.5 font-mono text-xs leading-5 font-medium tabular-nums dark:border-white/20">
                  {grade}
                </span>
              ) : null}
              {cert ? (
                <span className="font-mono text-xs leading-5 text-zinc-500 tabular-nums">
                  <span className="sr-only">Cert ending </span>
                  <span aria-hidden>Cert </span>
                  {cert}
                </span>
              ) : null}
              {top.isRookie ? <span className="font-mono text-xs leading-5 text-zinc-500">RC</span> : null}
              {top.isAuto ? <span className="font-mono text-xs leading-5 text-zinc-500">Auto</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <SectionLabel>{CONFIRM_COPY.parallel}</SectionLabel>
          {!pick && !deferred ? <p className="mb-2 text-[13px] text-zinc-500">{CONFIRM_COPY.pickParallel}</p> : null}
        </div>
        <div
          role="group"
          aria-label={CONFIRM_COPY.parallel}
          className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
        >
          {options.map((option) => (
            <Chip
              key={option.name}
              selected={pick?.name === option.name}
              onClick={() => choose({ name: option.name, serialRun: option.serialRun })}
              aria-label={option.serialRun ? `${option.name}, numbered to ${option.serialRun}` : option.name}
              className="shrink-0 snap-start pl-3"
            >
              <SwatchDot name={option.name} size="sm" />
              {option.name}
              {option.serialRun ? <RunBadge run={option.serialRun} /> : null}
            </Chip>
          ))}
          <Chip selected={deferred} onClick={() => choose(null)} className="shrink-0 snap-start">
            {CONFIRM_COPY.somethingElse}
          </Chip>
        </div>
        {pick?.serialRun ? (
          <div className="mt-4">
            <label htmlFor={serialId} className="text-[13px] font-medium text-zinc-500">
              {CONFIRM_COPY.serialLabel}
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id={serialId}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={serialNo}
                onChange={(event) => {
                  setSerialNo(event.target.value.replace(/[^0-9]/g, "").slice(0, 5));
                  setError(null);
                }}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                aria-label={`Your number, out of ${pick.serialRun}`}
                className={`h-11 w-24 rounded-xl border border-zinc-300 bg-transparent px-3 font-mono text-base tabular-nums dark:border-white/15 ${focusRing}`}
              />
              <span className="font-mono text-sm text-zinc-500 tabular-nums">/{pick.serialRun}</span>
            </div>
            {error ? (
              <p id={errorId} role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <PrimaryButton onClick={confirm}>{CONFIRM_COPY.yes}</PrimaryButton>

      {rows.length > 1 ? (
        <div>
          <SectionLabel>{CONFIRM_COPY.others}</SectionLabel>
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-white/10 dark:border-white/10">
            {rows.slice(1).map((match, index) => (
              <li key={`${match.catalogId ?? "read"}-${index}`}>
                <button
                  type="button"
                  onClick={() => promote(index + 1)}
                  className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04] ${focusRing}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{match.playerName}</span>
                    <span className="block truncate text-[13px] text-zinc-500">
                      {matchLine(match)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-2">
        <QuietButton onClick={onStepByStep}>{CONFIRM_COPY.noneOfThese}</QuietButton>
        <span aria-hidden className="text-zinc-300 dark:text-white/20">
          ·
        </span>
        <QuietButton onClick={onRetake}>{CONFIRM_COPY.retake}</QuietButton>
      </div>
    </div>
  );
}

/** A value the scan wasn't sure of reads muted, and says so to screen readers. */
function Field({ sureness, children }: { sureness: FieldSureness; children: string }) {
  if (!children) return null;
  if (sureness !== "unsure") return <span>{children}</span>;
  return (
    <span className="text-zinc-500">
      {children}
      <span className="sr-only"> ({CONFIRM_COPY.notSure.toLowerCase()})</span>
    </span>
  );
}

function CardPhoto({ photo, name }: { photo: string | null; name: string }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={`Your scan of ${name}`}
        width={80}
        height={112}
        className="aspect-[5/7] w-20 rounded-lg object-cover shadow-[0_6px_16px_rgba(9,9,11,0.18)] ring-1 ring-zinc-900/10 dark:ring-white/10"
      />
    );
  }
  const initials = name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      role="img"
      aria-label="No photo"
      className="grid aspect-[5/7] w-20 place-items-center rounded-lg bg-gradient-to-b from-zinc-100 to-zinc-200 ring-1 ring-zinc-900/10 dark:from-white/[0.08] dark:to-white/[0.03] dark:ring-white/10"
    >
      <span aria-hidden className="font-mono text-sm text-zinc-500">
        {initials}
      </span>
    </div>
  );
}

function Matching({ photo }: { photo: string | null }) {
  const bar = "rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10";
  return (
    <div className="space-y-6">
      <p className="sr-only" role="status">
        {CONFIRM_COPY.finding}
      </p>
      <div className="grid grid-cols-[80px_1fr] items-start gap-4">
        {photo ? <CardPhoto photo={photo} name="this card" /> : <div className={`aspect-[5/7] w-20 ${bar}`} />}
        <div className="space-y-2 pt-2">
          <div className={`h-5 w-40 ${bar}`} />
          <div className={`h-4 w-48 ${bar}`} />
          <div className={`h-4 w-20 ${bar}`} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className={`h-11 w-24 rounded-full ${bar}`} />
        <div className={`h-11 w-24 rounded-full ${bar}`} />
        <div className={`h-11 w-24 rounded-full ${bar}`} />
      </div>
      <div className={`h-12 rounded-full ${bar}`} />
    </div>
  );
}

function NoMatch({
  photo,
  offline,
  onStepByStep,
  onRetake,
}: {
  photo: string | null;
  offline: boolean;
  onStepByStep: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[80px_1fr] items-center gap-4">
        <CardPhoto photo={photo} name="this card" />
        <p className="text-sm leading-5 text-zinc-600 dark:text-zinc-400">
          {offline ? CONFIRM_COPY.offlineBody : CONFIRM_COPY.noMatchBody}
        </p>
      </div>
      <PrimaryButton onClick={onStepByStep}>{CONFIRM_COPY.stepByStep}</PrimaryButton>
      <div className="flex justify-center">
        <QuietButton onClick={onRetake}>{CONFIRM_COPY.retake}</QuietButton>
      </div>
    </div>
  );
}
