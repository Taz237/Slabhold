"use client";

import { useId, useState } from "react";
import { PrimaryButton, QuietButton, focusRing } from "@/components/add-card/flow-ui";
import {
  CardPhoto,
  MatchSummary,
  MatchingSkeleton,
  OtherMatches,
  ParallelStrip,
  SheetFrame,
  parallelOptionsFor,
} from "@/components/scan/sheet-parts";
import {
  CONFIRM_COPY,
  confirmMatch,
  initialChoice,
  promoteMatch,
  readyToSave,
  type ParallelPick,
} from "@/lib/scan/confirm";
import type { ScanMatch } from "@/lib/scan/match";

export type ConfirmSheetState =
  | { kind: "matching" }
  | { kind: "ready"; matches: ScanMatch[] }
  | { kind: "none"; offline?: boolean };

type Props = {
  /** The cropped scan. Null shows a designed placeholder. */
  photo: string | null;
  state: ConfirmSheetState;
  /**
   * The top match with the sheet's parallel and serial picks applied.
   * save: "Yes, add it" (Add card saves on open). Otherwise Add card opens on Review or what's missing.
   */
  onConfirm: (match: ScanMatch, options: { save: boolean }) => void;
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
  const title = state.kind === "none" ? CONFIRM_COPY.noMatchTitle : CONFIRM_COPY.title;
  return (
    <SheetFrame title={title} busy={state.kind === "matching"} onClose={onClose}>
      {state.kind === "matching" ? <MatchingSkeleton photo={photo} label={CONFIRM_COPY.finding} /> : null}
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
    </SheetFrame>
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
  onConfirm: (match: ScanMatch, options: { save: boolean }) => void;
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

  const canSave = readyToSave({ ...top, parallel: pick?.name ?? "" });

  function confirm(save: boolean) {
    const result = confirmMatch(top, pick, serialNo);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onConfirm(result.match, { save });
  }

  return (
    <div className="space-y-6">
      <MatchSummary photo={photo} match={top} />

      <div>
        <ParallelStrip
          options={parallelOptionsFor(top)}
          pick={pick}
          deferred={deferred}
          hint={!pick && !deferred ? CONFIRM_COPY.pickParallel : null}
          onChoose={choose}
        />
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

      <div className="space-y-2">
        <PrimaryButton onClick={() => confirm(canSave)}>{canSave ? CONFIRM_COPY.add : CONFIRM_COPY.yes}</PrimaryButton>
        {canSave ? (
          <div className="flex justify-center">
            <QuietButton onClick={() => confirm(false)}>{CONFIRM_COPY.editDetails}</QuietButton>
          </div>
        ) : null}
      </div>

      <OtherMatches rows={rows} onPromote={promote} />

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
