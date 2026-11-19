"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rowsWithVersion, versionReadKey } from "@/lib/scan/version-reread";
import { Chip, PrimaryButton, QuietButton, SectionLabel } from "@/components/add-card/flow-ui";
import { MoveArrow } from "@/components/move-arrow";
import type { ConfirmSheetState } from "@/components/scan/confirm-sheet";
import { SalesDots } from "@/components/scan/sales-dots";
import {
  CardPhoto,
  FlipStep,
  MatchSummary,
  OtherMatches,
  SetNotes,
  withSoldGroups,
  ParallelStrip,
  SheetFrame,
  SplitGroups,
  OtherGroups,
  VersionList,
  skeletonBar,
} from "@/components/scan/sheet-parts";
import { MOVE_PILL } from "@/lib/chart/theme";
import { money } from "@/lib/format";
import { QUICK_GRADES } from "@/lib/quick-comp/grades";
import { quickCompLimitMessage } from "@/lib/quick-comp/respond";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  COMP_COPY,
  compIdentityFromMatch,
  compQueryString,
  scanCompGrade,
  type ScanCompResult,
  type SoldsState,
} from "@/lib/scan/comp";
import { CONFIRM_COPY, confirmMatch, initialChoice, matchesKey, promoteMatch, readyToSave, versionLabel, type ParallelPick } from "@/lib/scan/confirm";
import type { ScanEstimate } from "@/lib/scan/estimate";
import type { ScanMatch } from "@/lib/scan/match";
import { isUnnamedRunLabel } from "@/lib/scan/scan-sales";
import { versionChoicesFor, versionFromSerial, versionRows } from "@/lib/scan/version-list";
import { REVEAL_COPY, REVEAL_LAND_MS, REVEAL_REDUCED_MS, landingDelayMs, matchIsSure, revealFields, revealFieldsFromRead } from "@/lib/scan/reveal";
import { haptic } from "@/lib/ios/haptics";
import { matchWithChosenGrade, QUICK_ADD_COPY } from "@/lib/scan/quick-add";
import { PickCard } from "@/components/scan/pick-card";
import { RevealFields, RevealSpinCard, type RevealLanding } from "@/components/scan/scan-reveal";

/**
 * Sold prices for another parallel or grade on this sheet. GET /api/scan/comp
 * in the app: saved sales, plus the scan's own live search again (query),
 * never a new Trawl call.
 */
export type CompLookup = (
  identity: QuickCompIdentity,
  options?: { serialRun?: number | null; query?: string | readonly string[] | null },
) => Promise<ScanCompResult>;

type Props = {
  photo: string | null;
  /** The back's photo, when the camera took the back too: the reveal card turns to it. */
  backPhoto?: string | null;
  state: ConfirmSheetState;
  lookup: CompLookup;
  /** Add to collection: the match with the picked parallel. save when nothing is left to ask. */
  onAdd: (match: ScanMatch, options: { save: boolean }) => void;
  onScanAnother: () => void;
  /** None of these: type the card into Quick Comp instead. */
  onSearch: () => void;
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

/**
 * Scan to comp: a price check, nothing gets added. The card shows as soon as
 * it's read, then its last eBay solds fill in (one live search per scan, or
 * sales we already have). A different parallel, grade or card is one tap, and
 * its prices load in place from the same search. No sales is said plainly.
 */
export function CompSheet({ photo, backPhoto = null, state, lookup, onAdd, onScanAnother, onSearch, onSapphire, onVersion, onScanBack, onSkipBack, onClose }: Props) {
  const steps = useScanSteps(state);
  const title = state.kind === "none" ? CONFIRM_COPY.noMatchTitle : steps.view === "list" ? REVEAL_COPY.pickTitle : COMP_COPY.title;
  return (
    <SheetFrame title={title} busy={state.kind === "matching"} onClose={onClose}>
      {state.kind === "back" ? (
        <div className="space-y-6">
          <div className="flex justify-center">
            <CardPhoto photo={photo} name="this card" />
          </div>
          <FlipStep match={state.matches[0]} onScanBack={onScanBack ?? onScanAnother} onSkip={onSkipBack ?? onClose} />
        </div>
      ) : null}
      {state.kind === "none" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-[80px_1fr] items-center gap-4">
            <CardPhoto photo={photo} name="this card" />
            <p className="text-sm leading-5 text-zinc-600 dark:text-zinc-400">
              {state.offline ? CONFIRM_COPY.offlineBody : CONFIRM_COPY.noMatchBody}
            </p>
          </div>
          <PrimaryButton onClick={onSearch}>{COMP_COPY.search}</PrimaryButton>
          <div className="flex justify-center">
            <QuietButton onClick={onScanAnother}>{CONFIRM_COPY.retake}</QuietButton>
          </div>
        </div>
      ) : null}
      {state.kind === "matching" || state.kind === "ready" ? (
        <ScanSteps
          state={state}
          steps={steps}
          photo={photo}
          backPhoto={backPhoto}
          lookup={lookup}
          onAdd={onAdd}
          onScanAnother={onScanAnother}
          onSearch={onSearch}
          onSapphire={onSapphire}
          onVersion={onVersion}
        />
      ) : null}
    </SheetFrame>
  );
}

/**
 * Under "No sales yet": what last year's same card sold for, for other players. Set apart by a
 * rule and its own label, in the muted value style (never the big price), so it can't be read as
 * this card's value.
 */
function SimilarEstimate({ estimate }: { estimate: ScanEstimate }) {
  return (
    <section data-slot="similar-estimate" aria-label={COMP_COPY.estimate} className="mt-4 border-t border-zinc-200 pt-4 dark:border-white/10">
      <p className="text-13 font-medium text-zinc-500 dark:text-zinc-400">{COMP_COPY.estimate}</p>
      <p className="mt-1 font-mono text-xl leading-7 font-medium text-zinc-700 tabular-nums dark:text-zinc-300">
        <span className="sr-only">About </span>
        <span aria-hidden>~</span>
        {dollars(estimate.medianCents)}
      </p>
      <p className="mt-1 text-sm leading-5 text-zinc-600 tabular-nums dark:text-zinc-400">
        {estimate.lowCents !== estimate.highCents
          ? `${COMP_COPY.estimateRange} ${dollars(estimate.lowCents)} and ${dollars(estimate.highCents)} · `
          : ""}
        {estimate.nSales} sales of {estimate.basis}
      </p>
      <p className="mt-4 text-13 font-medium text-zinc-500 dark:text-zinc-400">{COMP_COPY.estimateExamples}</p>
      <ul className="mt-1 divide-y divide-zinc-200 dark:divide-white/10">
        {estimate.examples.map((sale, index) => (
          <li key={`${sale.player}-${index}`} className="flex min-h-10 items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {sale.player}
              <span className="text-zinc-500 dark:text-zinc-400"> · {saleDay(sale.soldAt)}</span>
            </span>
            <span className="shrink-0 font-mono font-medium tabular-nums">{dollars(sale.priceCents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-4 text-zinc-500 dark:text-zinc-400">
        {COMP_COPY.estimateNote} {COMP_COPY.credit}
      </p>
    </section>
  );
}


/** A long row of chips: the picked one moves to the front, so it is never off screen. */
function pickedInView<T extends { name: string }>(options: T[], pick: ParallelPick): T[] {
  const at = pick ? options.findIndex((option) => option.name === pick.name) : -1;
  return at > 3 ? [options[at], ...options.slice(0, at), ...options.slice(at + 1)] : options;
}

function gradeChoices(scanned: string): string[] {
  const presets: string[] = [...QUICK_GRADES];
  return presets.includes(scanned) ? presets : [scanned, ...presets];
}

/**
 * The price screen for one card, Quick Comp style: its value from recent sold prices, its parallel
 * and grade one tap each, and a big Add to collection. `scanMatch` is the card the scan's own live
 * search priced (the top match as it arrived): its sales only ever show for that card.
 * With `onBack` (the card was picked from "Pick your card"), the way out is back to the list.
 */
export function CardPrice({
  photo,
  matches,
  scanMatch = matches[0],
  solds,
  lookup,
  onAdd,
  onScanAnother,
  onSearch,
  onSapphire,
  onVersion,
  onBack,
  arrive = false,
}: {
  /** The reveal's card just landed in the photo's slot: everything else comes up under it, as one piece. */
  arrive?: boolean;
  photo: string | null;
  matches: ScanMatch[];
  scanMatch?: ScanMatch;
  solds?: SoldsState;
  lookup: CompLookup;
  onAdd: Props["onAdd"];
  onScanAnother: () => void;
  onSearch: () => void;
  onSapphire?: () => void;
  onVersion?: (version: string, rows: ScanMatch[]) => void;
  onBack?: () => void;
}) {
  const [rows, setRows] = useState(matches);
  const top = rows[0];
  // A read serial that exactly one checklist version fits picks it; anything less stays open.
  const [pick, setPick] = useState<ParallelPick>(() => (top ? (initialChoice(top) ?? versionFromSerial(top)) : null));
  const [grade, setGrade] = useState(() => (top ? scanCompGrade(top) : "Raw"));
  // Every card, parallel and grade looked up on this sheet, so switching back is instant.
  const [results, setResults] = useState<ReadonlyMap<string, ScanCompResult>>(new Map());

  const target = useMemo(
    () => (top ? compIdentityFromMatch({ ...top, parallel: pick?.name ?? "" }, grade) : null),
    [top, pick, grade],
  );
  const serialRun = pick?.serialRun ?? top?.serialRun ?? null;
  // A numbered card, an autograph and a named variation are never Base: with the parallel open, nothing reads as Base.
  // A slab waiting on its version ("Which version?") is never shown as Base: nothing is priced until the pick.
  const awaitingVersion = solds?.status === "done" && solds.comp.status === "version";
  // Never a silent Base: with the version neither read off the card nor picked, nothing is priced.
  // "Which version?" asks, with the card's real parallels (or Base alone, to say so in one tap).
  const versionOpen = !pick;
  const assumedBase = false;
  // Set when Add was tapped before the version: the button says so instead of guessing.
  const [addError, setAddError] = useState<string | null>(null);
  const key = target ? compQueryString(target.identity, serialRun) : "";
  // The card the live search priced: the top match as it arrived, with its own parallel and grade.
  const [scanKey] = useState(() => {
    const first = scanMatch ? compIdentityFromMatch({ ...scanMatch, parallel: initialChoice(scanMatch)?.name ?? "" }, scanCompGrade(scanMatch)) : null;
    return first ? compQueryString(first.identity, scanMatch?.serialRun ?? null) : "";
  });
  // Every search the scan ran, so another parallel or grade is filtered from the same sales the scan counted.
  const query = solds?.status === "done" ? (solds.queries?.length ? solds.queries : solds.query) : null;
  const looking = solds?.status === "looking" && key === scanKey;
  // Try again on the scan's own card looks it up again instead of reusing the scan's answer.
  const [retriedScan, setRetriedScan] = useState(false);
  const fromScan = solds?.status === "done" && key === scanKey && !retriedScan ? solds.comp : undefined;

  // The version the collector picked (on any row they promoted): the scan is read again with it as
  // the label's own line, and its sales load. A row's own parallel, set by promoting it, is not a pick.
  // After a read, another version reads again, and any tap after a failed read tries again.
  const [picked, setPicked] = useState(false);
  const [taps, setTaps] = useState(0);
  const readKey = versionReadKey(solds, pick, picked, taps);
  // Each tap is read once, even if the sheet re-renders before the read starts.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!readKey || !pick || !onVersion || asked.current === readKey) return;
    asked.current = readKey;
    onVersion(pick.name, rowsWithVersion(rows, pick, rows[0]?.serialNo ?? ""));
  }, [readKey, pick, rows, onVersion]);
  // A slab read as one version: the sheet's sales are that version's. Another pick waits for its
  // own read, never a cached lookup. A grade change on the same version looks up as before.
  const versionRead = solds?.status === "done" && Boolean(solds.version) && Boolean(onVersion);
  const versionPending = versionRead && solds?.status === "done" && pick?.name !== solds.version;

  useEffect(() => {
    if (!target || versionOpen || results.has(key) || looking || fromScan || awaitingVersion || versionPending) return;
    let live = true;
    const store = (result: ScanCompResult) => {
      if (live) setResults((prev) => new Map(prev).set(key, result));
    };
    lookup(target.identity, { serialRun, query }).then(store, () => store({ status: "unavailable" }));
    return () => {
      live = false;
    };
  }, [awaitingVersion, fromScan, key, looking, lookup, query, results, serialRun, target, versionOpen, versionPending]);

  if (!top) return null;

  function promote(index: number) {
    const next = promoteMatch(rows, index);
    setRows(next);
    setPick(initialChoice(next[0]));
    setGrade(scanCompGrade(next[0]));
    setPicked(false);
  }

  function retry() {
    // A slab's version read failed: read it again, never a cached lookup.
    if (versionRead && key === scanKey && pick && onVersion) {
      onVersion(pick.name, rowsWithVersion(rows, pick, rows[0]?.serialNo ?? ""));
      return;
    }
    if (key === scanKey) setRetriedScan(true);
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  /** One tap: the card as read, with the version picked. Never before the version: no silent Base. */
  function add() {
    if (!pick) {
      setAddError(QUICK_ADD_COPY.pickFirst);
      return;
    }
    const result = confirmMatch(top, pick, top.serialNo);
    // A numbered card whose own number didn't read still adds: the number can be filled in later.
    const read = "match" in result ? result.match : { ...top, parallel: pick.name, serialRun: pick.serialRun, serialNo: "", sureness: { ...top.sureness, parallel: "sure" as const } };
    // The grade the Grade chip shows is the grade saved: a slab set to Raw saves raw, and the reverse.
    const match = matchWithChosenGrade(read, grade);
    onAdd(match, { save: readyToSave(match) });
  }

  // With the version open, only the sales the search split by parallel show (tap one to pick it);
  // anything else waits for the pick.
  // Sales named by the print run alone ("/299": a numbered card whose sales name no color) are this
  // card's too, and never called Base, so they show.
  const scanNamed =
    fromScan?.status === "split" || (fromScan?.status === "ok" && fromScan.parallel && isUnnamedRunLabel(fromScan.parallel)) ? fromScan : undefined;
  const result: ScanCompResult | undefined = versionOpen
    ? looking
      ? undefined
      : (scanNamed ?? { status: "version" })
    : key
      ? (fromScan ?? results.get(key))
      : undefined;
  // No list of ours for this card: Base alone, to say it in one tap. Never on a card that can't be Base.
  const canBeBase = top.serialRun == null && !top.isAuto && !top.subset;
  // Every version on the checklist for this card (only those at its print run, once a serial is read).
  const listed = versionChoicesFor(top);
  const versionChoices = listed.length > 0 ? listed : canBeBase ? [{ name: "Base", serialRun: null }] : [];
  // "Pick your version": the whole list, one row each, while the version is open. The sales that
  // name a version sit on its row, so no box of sold groups stands in front of the list.
  const versionList = versionOpen && target ? versionRows(versionChoices, top, solds) : null;
  const pickFromList = versionList != null && versionList.rows.length > 0;
  const choose = (next: ParallelPick) => {
    setPicked(next !== null);
    if (next) setTaps((count) => count + 1);
    setPick(next);
    setAddError(null);
  };

  return (
    <div className={`space-y-6 ${arrive ? SHEET_RISE_REST : ""}`} data-arrive={arrive ? "" : undefined}>
      <MatchSummary photo={photo} match={top} rise={arrive ? SHEET_RISE : undefined} />
      <SetNotes match={top} onSapphire={matchesKey([top]) === matchesKey([scanMatch]) ? onSapphire : undefined} />

      {pickFromList && versionList ? (
        <VersionList
          rows={versionList.rows}
          unnamed={versionList.unnamed}
          looking={looking}
          // An unnumbered card whose sales were all another parallel: said plainly, never a Base price.
          note={fromScan?.status === "split" && fromScan.missing ? COMP_COPY.noBase : null}
          insertName={top.insertName}
          onChoose={choose}
        />
      ) : target ? (
        <ValuePanel
          result={result}
          looking={looking}
          onRetry={retry}
          assumedBase={assumedBase}
          serialRun={serialRun}
          insertName={top.insertName}
          onPick={(label) => {
            setPick({ name: label, serialRun: top.serialRun });
            setAddError(null);
          }}
          // Only beside the scan's own "No sales yet": another parallel or grade tapped has no estimate.
          estimate={fromScan && solds?.status === "done" ? (solds.similar?.estimate ?? null) : null}
        />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{top.playerName ? COMP_COPY.needYear : COMP_COPY.needPlayer}</p>
      )}

      {pickFromList ? null : (
        <ParallelStrip
        options={pickedInView(withSoldGroups(versionChoices, solds, top.serialRun, assumedBase), pick)}
        pick={pick}
        somethingElse={false}
        insertName={top.insertName}
        hint={
          versionOpen
            ? CONFIRM_COPY.whichVersion
            : top.parallelSource === "card" && pick?.name === top.parallel
              ? COMP_COPY.matchedFromPhoto
            : top.parallelSource === "sales" && pick?.name === top.parallel
              ? COMP_COPY.matchedFromSalesTap
              : // The chips offered are last year's parallels at this print run, not a read of this card.
                !pick && solds?.status === "done" && (solds.similar?.parallels.length ?? 0) > 0
                ? COMP_COPY.yearAgoParallels
                : null
        }
        onChoose={choose}
        />
      )}

      <div>
        <SectionLabel>{COMP_COPY.grade}</SectionLabel>
        <div
          role="group"
          aria-label={COMP_COPY.grade}
          className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
        >
          {gradeChoices(scanCompGrade(top)).map((choice) => (
            <Chip
              key={choice}
              selected={grade === choice}
              onClick={() => setGrade(choice)}
              className="shrink-0 snap-start font-mono tabular-nums"
            >
              {choice}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <PrimaryButton onClick={add} className="min-h-14 text-15" aria-describedby={addError ? "scan-add-error" : undefined}>
          {QUICK_ADD_COPY.add}
        </PrimaryButton>
        {addError ? (
          <p id="scan-add-error" role="alert" className="text-center text-sm text-rose-600 dark:text-rose-400">
            {addError}
          </p>
        ) : null}
        <div className="flex justify-center">
          <QuietButton onClick={onScanAnother}>{COMP_COPY.next}</QuietButton>
        </div>
      </div>

      {onBack ? (
        <div className="flex justify-center">
          <QuietButton onClick={onBack}>{REVEAL_COPY.pickAnother}</QuietButton>
        </div>
      ) : (
        <>
          <OtherMatches rows={rows} onPromote={promote} photo={photo} />
          <div className="flex justify-center">
            <QuietButton onClick={onSearch}>{CONFIRM_COPY.noneOfThese}</QuietButton>
          </div>
        </>
      )}
    </div>
  );
}

/** Where the scan is: being read, its reveal landing, the list to pick from, or one card's price. */
export type ScanView = "reading" | "reveal" | "list" | "card";

/**
 * The scan's steps after the camera. Being read: the card turns. Read: it lands on its front and its
 * details type in, then (unless the collector taps through) "Pick your card" when the match is
 * unsure, or straight to the card's price when it's sure. The sheet holds this so its title follows.
 */
export function useScanSteps(state: ConfirmSheetState) {
  const matches = state.kind === "ready" ? state.matches : null;
  // The card picked, by who it is (not its parallel): a re-read for a version, or sales that name its
  // parallel, keep the price screen on the same card.
  const [picked, setPicked] = useState<string | null>(null);
  // "Not this one? Pick another" on a card shown without the list: the list, on request.
  const [listAsked, setListAsked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // A new scan starts over: its reveal plays, nothing is picked.
  if (state.kind === "matching" && (revealed || picked || listAsked)) {
    setRevealed(false);
    setPicked(null);
    setListAsked(false);
  }
  const reveal = useCallback(() => setRevealed(true), []);
  const at = picked && matches ? matches.findIndex((match) => cardIdentity(match) === picked) : -1;
  const sure = matches ? matchIsSure(matches) : false;
  const index = at >= 0 ? at : sure && !listAsked ? 0 : null;
  const view: ScanView = !matches ? "reading" : !revealed ? "reveal" : index != null ? "card" : "list";
  return {
    view,
    index,
    /** Only a card shown from the list, or one of several, can go back to the list. */
    canPickAnother: Boolean(matches && matches.length > 1),
    reveal,
    /** The card view comes next (not the list): where the reveal's card lands. */
    toCard: sure && !listAsked,
    pick: (next: number) => {
      if (matches?.[next]) setPicked(cardIdentity(matches[next]));
    },
    backToList: () => {
      setPicked(null);
      setListAsked(true);
    },
  };
}

/** Who a card is, apart from its parallel: the player, year, set and card #. */
function cardIdentity(match: ScanMatch): string {
  return [match.playerName, match.yearLabel, match.setBrand, match.cardNumber].join("~");
}

export function ScanSteps({
  state,
  steps,
  photo,
  backPhoto = null,
  lookup,
  onAdd,
  onScanAnother,
  onSearch,
  onSapphire,
  onVersion,
}: {
  state: Extract<ConfirmSheetState, { kind: "matching" | "ready" }>;
  steps: ReturnType<typeof useScanSteps>;
  photo: string | null;
  backPhoto?: string | null;
  lookup: CompLookup;
  onAdd: Props["onAdd"];
  onScanAnother: () => void;
  onSearch: () => void;
  onSapphire?: () => void;
  onVersion?: (version: string, rows: ScanMatch[]) => void;
}) {
  const ready = state.kind === "ready" ? state : null;
  const key = ready ? matchesKey(ready.matches) : "";
  const top = ready?.matches[0] ?? null;
  const { view, index, reveal, toCard } = steps;
  const root = useRef<HTMLDivElement>(null);
  // When this scan's card came onto the stage. Null: the sheet opened on a card already read.
  const startedAt = useRef<number | null>(null);
  const [phase, setPhase] = useState<"reading" | "final" | "landing">("reading");
  const [landing, setLanding] = useState<RevealLanding | null>(null);
  // The card just landed: the sheet under it comes up once.
  const [arrived, setArrived] = useState(false);
  // A new scan starts over.
  if (!ready && (phase !== "reading" || arrived)) {
    setPhase("reading");
    setArrived(false);
  }
  const reading = !ready;
  useEffect(() => {
    if (reading) startedAt.current = performance.now();
  }, [reading, photo]);

  // The match is in. A read that beat the first sweep lets it finish (the one sweep it gets); a
  // slower one gets a last brighter pass. Then the card turns and glides to its slot, locks in with
  // a firmer haptic, and the sheet comes up under it. Never a wait beyond that.
  const sure = ready ? matchIsSure(ready.matches) : false;
  useEffect(() => {
    if (view !== "reveal") return;
    const lock = () => {
      haptic(sure ? "lockSure" : "lock");
      setArrived(true);
      reveal();
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      const timer = window.setTimeout(lock, REVEAL_REDUCED_MS);
      return () => window.clearTimeout(timer);
    }
    const { finalSweep, delayMs } = landingDelayMs(startedAt.current == null ? 0 : performance.now() - startedAt.current);
    const timers = [
      window.setTimeout(() => {
        if (finalSweep) setPhase("final");
      }, 0),
      window.setTimeout(() => {
        setLanding(landingFor(root.current, toCard));
        setPhase("landing");
      }, delayMs),
      window.setTimeout(lock, delayMs + REVEAL_LAND_MS),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [view, reveal, sure, toCard]);

  useEffect(() => {
    if (!arrived) return;
    const timer = window.setTimeout(() => setArrived(false), 800);
    return () => window.clearTimeout(timer);
  }, [arrived]);

  if (ready && view === "card" && index != null && ready.matches[index]) {
    return (
      <CardPrice
        key={`${key}#${index}`}
        arrive={arrived}
        photo={photo}
        matches={promoteMatch(ready.matches, index)}
        scanMatch={ready.matches[0]}
        solds={ready.solds}
        lookup={lookup}
        onAdd={onAdd}
        onScanAnother={onScanAnother}
        onSearch={onSearch}
        onSapphire={index === 0 ? onSapphire : undefined}
        onVersion={onVersion}
        onBack={steps.canPickAnother ? steps.backToList : undefined}
      />
    );
  }
  if (ready && view === "list") {
    return (
      <div className={`space-y-6 ${arrived ? `${SHEET_RISE_REST} ${SCENE_HEIGHT}` : ""}`}>
        <RevealSpinCard photo={photo} backPhoto={backPhoto} motion="rest" size="small" />
        <PickCard matches={ready.matches} onPick={steps.pick} photo={photo} />
        <div className="flex justify-center">
          <QuietButton onClick={onSearch}>{CONFIRM_COPY.noneOfThese}</QuietButton>
        </div>
      </div>
    );
  }
  // What was read so far: the phone's own read while the card is matched, then the match itself.
  const lines = top ? revealFields(top) : revealFieldsFromRead(state.kind === "matching" ? state.read : null);
  return (
    <div ref={root} onClick={ready ? reveal : undefined} className={`flex flex-col ${SCENE_HEIGHT}`}>
      <RevealSpinCard key={photo ?? "none"} photo={photo} backPhoto={backPhoto} motion={ready ? phase : "reading"} landing={landing} />
      <div className="pt-4">
        <RevealFields lines={lines} leaving={phase === "landing"} />
      </div>
    </div>
  );
}

/**
 * The reveal fills the sheet to its full height (the scene sheet's 94dvh, less its grabber, title
 * row and padding), so the sheet is already as tall as the card's own sheet: the card lands in its
 * slot and nothing under it jumps.
 */
const SCENE_HEIGHT = "min-h-[calc(94dvh-5.625rem-env(safe-area-inset-bottom))]";

/** The sheet under the landed card: one fade and slide up, the whole piece together. Reduced motion: a fade. */
const SHEET_RISE = "motion-safe:animate-[reveal-sheet-rise_320ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both]";
/** The same, for everything on the sheet but the card's own row (its photo is where the card landed). */
const SHEET_RISE_REST =
  "motion-safe:[&>*:not(:first-child)]:animate-[reveal-sheet-rise_320ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:[&>*:not(:first-child)]:animate-[add-fade_200ms_ease-out_both]";

/**
 * Where the reveal's card lands: the photo's slot on the card's sheet (top left, 80 wide), or the
 * small card above "Pick your card" (centered, 96 wide). Null when the page has no layout (tests).
 */
function landingFor(root: HTMLElement | null, toCard: boolean): RevealLanding | null {
  const card = root?.querySelector<HTMLElement>('[data-reveal="scan-card"] > div');
  if (!root || !card) return null;
  const box = root.getBoundingClientRect();
  const from = card.getBoundingClientRect();
  if (!from.width) return null;
  const width = toCard ? 80 : 96;
  const left = toCard ? box.left : box.left + (box.width - width) / 2;
  const top = toCard ? box.top : box.top + 4;
  return { x: left - from.left, y: top - from.top, scale: width / from.width };
}

const TREND_TEXT = { up: "Trending up", down: "Trending down", flat: "Steady" } as const;

function saleDay(iso: string | null): string {
  if (!iso) return "Recent";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function dollars(cents: number): string {
  return money(cents / 100);
}

function ValuePanel({
  result,
  looking,
  onRetry,
  assumedBase,
  serialRun = null,
  onPick,
  estimate = null,
  insertName,
}: {
  result: ScanCompResult | undefined;
  /** The card is this insert (Rookie Code): its plain version reads as the insert, never "Base". */
  insertName?: string;
  /** Last year's similar cards, only under "No sales yet". */
  estimate?: ScanEstimate | null;
  /** Tap another parallel the sales name, to price the card as it. */
  onPick?: (label: string) => void;
  /** The card's print run, shown with the parallel the sales are for. */
  serialRun?: number | null;
  /** The live eBay search is running: say so, it takes a few seconds. */
  looking: boolean;
  onRetry: () => void;
  assumedBase: boolean;
}) {
  const box = "rounded-2xl border border-zinc-200 p-4 dark:border-white/10";

  if (!result) {
    return (
      <div className={box} aria-busy="true">
        {looking ? (
          <p className="mb-3 text-13 font-medium text-zinc-500 dark:text-zinc-400" role="status">
            {COMP_COPY.looking}
          </p>
        ) : (
          <p className="sr-only" role="status">
            {COMP_COPY.checking}
          </p>
        )}
        <div className={`h-4 w-12 ${skeletonBar}`} />
        <div className={`mt-2 h-8 w-32 ${skeletonBar}`} />
        <div className={`mt-3 h-4 w-56 ${skeletonBar}`} />
        <div className={`mt-5 h-4 w-full ${skeletonBar}`} />
        <div className={`mt-2 h-4 w-full ${skeletonBar}`} />
      </div>
    );
  }

  if (result.status === "unavailable") {
    return (
      <div className={box} role="alert">
        <p className="text-sm font-medium">{COMP_COPY.unavailable}</p>
        <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{COMP_COPY.unavailableBody}</p>
        <QuietButton onClick={onRetry} className="-ml-3 mt-1">
          {COMP_COPY.retry}
        </QuietButton>
      </div>
    );
  }

  if (result.status === "split") {
    return (
      <div className={box}>
        <SplitGroups groups={result.groups} missing={result.missing} onPick={onPick} insertName={insertName} />
      </div>
    );
  }

  if (result.status === "limited") {
    return (
      <div className={box} role="status">
        <p className="text-sm font-medium">{quickCompLimitMessage(result.reason)}</p>
      </div>
    );
  }

  if (result.status === "version") {
    return (
      <div className={box} role="status" data-slot="pick-version">
        <p className="text-sm font-medium">{COMP_COPY.pickVersion}</p>
      </div>
    );
  }

  if (result.status === "none") {
    return (
      <div className={box}>
        <p className="text-15 font-semibold">{result.searched ? COMP_COPY.noneSearched : COMP_COPY.none}</p>
        {result.searched ? (
          <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{COMP_COPY.noneSearchedBody}</p>
        ) : null}
        {result.searched && estimate ? <SimilarEstimate estimate={estimate} /> : null}
      </div>
    );
  }

  const tone = result.trend;
  return (
    <div className={box}>
      {result.medianCents != null ? (
        <>
          <p className="text-13 font-medium text-zinc-500 dark:text-zinc-400">
            {COMP_COPY.value}
            {result.parallel ? (
              // Named by the sales it's priced from, so a Fuchsia /299 is never called Base.
              <span>
                {" · "}
                {versionLabel(result.parallel, insertName)}
                {serialRun && result.parallel !== "Base" && !isUnnamedRunLabel(result.parallel) ? (
                  <span className="font-mono tabular-nums"> /{serialRun}</span>
                ) : null}
              </span>
            ) : assumedBase ? (
              <span> · Base</span>
            ) : null}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-[1.75rem] leading-9 font-semibold tabular-nums">{dollars(result.medianCents)}</p>
            {tone ? (
              <span
                className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium ${MOVE_PILL[tone]}`}
              >
                <MoveArrow tone={tone} />
                {TREND_TEXT[tone]}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
            {result.lowCents != null && result.highCents != null && result.lowCents !== result.highCents
              ? `${COMP_COPY.range} ${dollars(result.lowCents)} and ${dollars(result.highCents)} · `
              : ""}
            {COMP_COPY.basedOn} {result.nSales} {result.nSales === 1 ? "sale" : "sales"}
          </p>
        </>
      ) : (
        <p className="text-15 font-semibold">{COMP_COPY.fewSales}</p>
      )}

      <SalesDots sales={result.sales} medianCents={result.medianCents} lowCents={result.lowCents} highCents={result.highCents} />

      <p className="mt-4 text-13 font-medium text-zinc-500 dark:text-zinc-400">
        {COMP_COPY.sales}
        {result.parallel ? (
          <span>
            {" · "}
            {versionLabel(result.parallel, insertName)}
            {serialRun && !isUnnamedRunLabel(result.parallel) ? <span className="font-mono tabular-nums"> /{serialRun}</span> : null}
          </span>
        ) : null}
      </p>
      <ul className="mt-1 divide-y divide-zinc-200 dark:divide-white/10">
        {result.sales.slice(0, 5).map((sale, index) => (
          <li key={`${sale.soldAt ?? "sale"}-${index}`} className="flex min-h-10 items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">{saleDay(sale.soldAt)}</span>
            <span className="font-mono font-medium tabular-nums">{dollars(sale.priceCents)}</span>
          </li>
        ))}
      </ul>
      {onPick && result.parallel === "Base" && result.groups ? (
        <OtherGroups groups={result.groups.filter((group) => group.label !== "Base")} onPick={onPick} />
      ) : null}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        {COMP_COPY.credit}
        {result.asOf ? ` · updated ${formatRelativeTime(result.asOf)}` : ""}
      </p>
    </div>
  );
}
