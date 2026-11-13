"use client";

import { useId, useState } from "react";
import { PrimaryButton, QuietButton, focusRing } from "@/components/add-card/flow-ui";
import {
  LastSold,
  OtherMatches,
  SetNotes,
  withSoldGroups,
  ParallelStrip,
  RevealCard,
  RevealName,
  RevealNameSkeleton,
  SheetFrame,
  parallelOptionsFor,
} from "@/components/scan/sheet-parts";
import { COMP_COPY, type SoldsState } from "@/lib/scan/comp";
import {
  CONFIRM_COPY,
  confirmMatch,
  initialChoice,
  matchesKey,
  promoteMatch,
  readyToSave,
  type ParallelPick,
} from "@/lib/scan/confirm";
import type { ProductParallel } from "@/lib/cards/product-data";
import type { ScanMatch } from "@/lib/scan/match";

export type ConfirmSheetState =
  | { kind: "matching" }
  /** solds: the top card's last eBay solds, looked up after the card is read. */
  | { kind: "ready"; matches: ScanMatch[]; solds?: SoldsState }
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
  /** "Is this Sapphire?": read the card again as its Sapphire Edition and look its sales up. */
  onSapphire?: () => void;
  onClose: () => void;
};

/**
 * "Is this your card?" The scan reveal over the camera: the photo flips in,
 * and the card's name fills in under it step by step while the lookup runs.
 * The top match is one tap to accept; a wrong row or parallel is one tap to fix.
 */
export function ConfirmSheet({ photo, state, onConfirm, onStepByStep, onRetake, onSapphire, onClose }: Props) {
  const title = state.kind === "none" ? CONFIRM_COPY.noMatchTitle : CONFIRM_COPY.title;
  return (
    <SheetFrame title={title} busy={state.kind === "matching"} variant="scene" onClose={onClose}>
      {/* Mounted once for every state, so the card flips in once and the name lands under it. */}
      <RevealCard photo={photo} />
      {state.kind === "matching" ? <RevealNameSkeleton label={CONFIRM_COPY.finding} /> : null}
      {state.kind === "none" ? (
        <NoMatch offline={Boolean(state.offline)} onStepByStep={onStepByStep} onRetake={onRetake} />
      ) : null}
      {state.kind === "ready" ? (
        <Ready
          key={matchesKey(state.matches)}
          matches={state.matches}
          solds={state.solds}
          photo={photo}
          onSapphire={onSapphire}
          onConfirm={onConfirm}
          onStepByStep={onStepByStep}
          onRetake={onRetake}
        />
      ) : null}
    </SheetFrame>
  );
}

function Ready({
  matches,
  solds,
  photo = null,
  onSapphire,
  onConfirm,
  onStepByStep,
  onRetake,
}: {
  matches: ScanMatch[];
  solds?: SoldsState;
  /** The scan, shown beside a sold listing's photo when one is enlarged. */
  photo?: string | null;
  onSapphire?: () => void;
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
      <RevealName match={top} parallel={pick?.name ?? null} photo={photo} />
      {/* The last solds are for the card as read; picking another row hides them. */}
      <SetNotes match={top} onSapphire={top === matches[0] ? onSapphire : undefined} center />
      {solds && top === matches[0] ? (
        // A parallel the sales name is one tap, from the sales row or from its chip below.
        <LastSold solds={solds} pick={pick?.name ?? null} onPick={(label) => choose({ name: label, serialRun: top.serialRun })} />
      ) : null}

      <div>
        <ParallelStrip
          options={withYearAgoParallels(
            withSoldGroups(parallelOptionsFor(top), top === matches[0] ? solds : undefined, top.serialRun, false),
            top,
            top === matches[0] ? solds : undefined,
          )}
          pick={pick}
          deferred={deferred}
          hint={
            !pick && !deferred
              ? CONFIRM_COPY.pickParallel
              : top.parallelSource === "sales" && pick?.name === top.parallel
                ? COMP_COPY.matchedFromSales
                : null
          }
          onChoose={choose}
        />
        {pick?.serialRun ? (
          <div className="mt-4">
            <label htmlFor={serialId} className="text-13 font-medium text-zinc-500 dark:text-zinc-400">
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
              <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">/{pick.serialRun}</span>
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

      <OtherMatches rows={rows} onPromote={promote} photo={photo} />

      <div className="flex items-center justify-center gap-2 big:flex-col">
        <QuietButton onClick={onStepByStep}>{CONFIRM_COPY.noneOfThese}</QuietButton>
        <span aria-hidden className="text-zinc-300 big:hidden dark:text-white/20">
          ·
        </span>
        <QuietButton onClick={onRetake}>{CONFIRM_COPY.retake}</QuietButton>
      </div>
    </div>
  );
}

function NoMatch({
  offline,
  onStepByStep,
  onRetake,
}: {
  offline: boolean;
  onStepByStep: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-center text-sm leading-5 text-zinc-600 dark:text-zinc-400">
        {offline ? CONFIRM_COPY.offlineBody : CONFIRM_COPY.noMatchBody}
      </p>
      <PrimaryButton onClick={onStepByStep}>{CONFIRM_COPY.stepByStep}</PrimaryButton>
      <div className="flex justify-center">
        <QuietButton onClick={onRetake}>{CONFIRM_COPY.retake}</QuietButton>
      </div>
    </div>
  );
}

/** No sales yet on a numbered card with no parallel named: last year's parallels at this print run join the chips. */
function withYearAgoParallels(options: ProductParallel[], match: ScanMatch, solds: SoldsState | undefined): ProductParallel[] {
  const names = solds?.status === "done" ? (solds.similar?.parallels ?? []) : [];
  const out = [...options];
  for (const name of names) {
    if (!out.some((option) => option.name.toLowerCase() === name.toLowerCase())) out.push({ name, serialRun: match.serialRun });
  }
  return out;
}
