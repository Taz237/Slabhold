"use client";

import { PrimaryButton, QuietButton } from "@/components/add-card/flow-ui";
import { ScanSteps, usePickedRow, type CompLookup } from "@/components/scan/comp-sheet";
import { RevealCard, SheetFrame, FlipStep } from "@/components/scan/sheet-parts";
import type { SoldsState } from "@/lib/scan/comp";
import { CONFIRM_COPY } from "@/lib/scan/confirm";
import type { ScanMatch } from "@/lib/scan/match";
import { REVEAL_COPY, type RevealFound } from "@/lib/scan/reveal";

export type ConfirmSheetState =
  /** found: what the card's own text gave so far (the player, the card #), shown as the reveal fills in. */
  | { kind: "matching"; found?: RevealFound }
  /** "Flip it over": the front alone couldn't pin the year, set or card #. Its read waits here. */
  | { kind: "back"; matches: ScanMatch[] }
  /** solds: the top card's last eBay solds, looked up after the card is read. */
  | { kind: "ready"; matches: ScanMatch[]; solds?: SoldsState }
  /** unpinned: what we found conflicts with the card's back, so nothing is shown ("We couldn't pin this one down"). */
  | { kind: "none"; offline?: boolean; unpinned?: boolean };

type Props = {
  /** The cropped scan. Null shows a designed placeholder. */
  photo: string | null;
  /** The back's photo, when the camera took the back too: the reveal card turns to it. */
  backPhoto?: string | null;
  /** Sold prices for another parallel or grade on the price screen. None: they show as unavailable. */
  lookup?: CompLookup;
  state: ConfirmSheetState;
  /**
   * The picked card with its parallel and grade from the price screen: "Add to collection".
   * save: nothing is left to ask (Add card saves on open). Otherwise Add card opens on what's missing.
   */
  onConfirm: (match: ScanMatch, options: { save: boolean }) => void;
  /** None of these, or no match: the guided Add card with the photo. */
  onStepByStep: () => void;
  onRetake: () => void;
  /** "Is this Sapphire?": read the card again as its Sapphire Edition and look its sales up. */
  onSapphire?: () => void;
  /** "Which version?": read the slab again as the version picked and look that version's sales up. */
  onVersion?: (version: string, rows: ScanMatch[]) => void;
  /** "Scan the back" on the Flip it over step. */
  onScanBack?: () => void;
  /** "Skip" on the Flip it over step: go on with the front as read. */
  onSkipBack?: () => void;
  onClose: () => void;
};

/** Without a lookup (tests, previews), another parallel's prices say they're unavailable. */
const NO_LOOKUP: CompLookup = async () => ({ status: "unavailable" });

/**
 * Scan to add. The reveal over the camera: the collector's own photos turn while the card is read,
 * its fields filling in as each is found, then "Pick your card" lists the top matches. One tap
 * opens that card's price screen, Quick Comp style, with a big Add to collection.
 */
export function ConfirmSheet({ photo, backPhoto = null, lookup = NO_LOOKUP, state, onConfirm, onStepByStep, onRetake, onSapphire, onVersion, onScanBack, onSkipBack, onClose }: Props) {
  const [picked, setPicked] = usePickedRow(state);
  const title =
    state.kind === "none"
      ? state.unpinned
        ? CONFIRM_COPY.unpinnedTitle
        : CONFIRM_COPY.noMatchTitle
      : state.kind === "ready"
        ? picked == null
          ? REVEAL_COPY.pickTitle
          : REVEAL_COPY.yourCard
        : REVEAL_COPY.reading;
  return (
    <SheetFrame title={title} busy={state.kind === "matching"} variant="scene" onClose={onClose}>
      {state.kind === "matching" || state.kind === "ready" ? (
        <ScanSteps
          state={state}
          picked={picked}
          onPicked={setPicked}
          photo={photo}
          backPhoto={backPhoto}
          lookup={lookup}
          onAdd={onConfirm}
          onScanAnother={onRetake}
          onSearch={onStepByStep}
          onSapphire={onSapphire}
          onVersion={onVersion}
        />
      ) : null}
      {state.kind === "back" || state.kind === "none" ? <RevealCard photo={photo} /> : null}
      {state.kind === "back" ? <FlipStep match={state.matches[0]} onScanBack={onScanBack ?? onRetake} onSkip={onSkipBack ?? onClose} /> : null}
      {state.kind === "none" ? (
        <NoMatch offline={Boolean(state.offline)} unpinned={Boolean(state.unpinned)} onStepByStep={onStepByStep} onRetake={onRetake} />
      ) : null}
    </SheetFrame>
  );
}

function NoMatch({
  offline,
  unpinned,
  onStepByStep,
  onRetake,
}: {
  offline: boolean;
  unpinned: boolean;
  onStepByStep: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-center text-sm leading-5 text-zinc-600 dark:text-zinc-400">
        {offline ? CONFIRM_COPY.offlineBody : unpinned ? CONFIRM_COPY.unpinnedBody : CONFIRM_COPY.noMatchBody}
      </p>
      <PrimaryButton onClick={onStepByStep}>{unpinned ? CONFIRM_COPY.search : CONFIRM_COPY.stepByStep}</PrimaryButton>
      <div className="flex justify-center">
        <QuietButton onClick={onRetake}>{CONFIRM_COPY.retake}</QuietButton>
      </div>
    </div>
  );
}
