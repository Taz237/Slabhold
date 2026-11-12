"use client";

import { useEffect, useMemo, useState } from "react";
import { Chip, PrimaryButton, QuietButton, SectionLabel } from "@/components/add-card/flow-ui";
import { MoveArrow } from "@/components/move-arrow";
import type { ConfirmSheetState } from "@/components/scan/confirm-sheet";
import {
  CardPhoto,
  MatchSummary,
  MatchingSkeleton,
  OtherMatches,
  ParallelStrip,
  SheetFrame,
  parallelOptionsFor,
  skeletonBar,
} from "@/components/scan/sheet-parts";
import { MOVE_PILL } from "@/lib/chart/theme";
import { money } from "@/lib/format";
import { QUICK_GRADES } from "@/lib/quick-comp/grades";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  COMP_COPY,
  compIdentityFromMatch,
  compQueryString,
  scanCompGrade,
  type ScanCompResult,
} from "@/lib/scan/comp";
import { CONFIRM_COPY, confirmMatch, initialChoice, promoteMatch, readyToSave, type ParallelPick } from "@/lib/scan/confirm";
import type { ScanMatch } from "@/lib/scan/match";

/** Cached sold prices for a card and grade. GET /api/scan/comp in the app. */
export type CompLookup = (identity: QuickCompIdentity, options?: { serialRun?: number | null }) => Promise<ScanCompResult>;

type Props = {
  photo: string | null;
  state: ConfirmSheetState;
  lookup: CompLookup;
  /** Add to collection: the match with the picked parallel. save when nothing is left to ask. */
  onAdd: (match: ScanMatch, options: { save: boolean }) => void;
  onScanAnother: () => void;
  /** None of these: type the card into Quick Comp instead. */
  onSearch: () => void;
  onClose: () => void;
};

/**
 * Scan to comp. The top match's recent sold prices show as soon as the match
 * lands, with no tap. A different parallel, grade or card is one tap, and its
 * prices load in place. Cached sales only, so no sales is said plainly.
 */
export function CompSheet({ photo, state, lookup, onAdd, onScanAnother, onSearch, onClose }: Props) {
  const title = state.kind === "none" ? CONFIRM_COPY.noMatchTitle : COMP_COPY.title;
  return (
    <SheetFrame title={title} busy={state.kind === "matching"} onClose={onClose}>
      {state.kind === "matching" ? <MatchingSkeleton photo={photo} label={CONFIRM_COPY.finding} /> : null}
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
      {state.kind === "ready" ? (
        <Ready
          key={state.matches.map((match) => match.catalogId ?? match.playerName).join("|")}
          photo={photo}
          matches={state.matches}
          lookup={lookup}
          onAdd={onAdd}
          onScanAnother={onScanAnother}
          onSearch={onSearch}
        />
      ) : null}
    </SheetFrame>
  );
}

function gradeChoices(scanned: string): string[] {
  const presets: string[] = [...QUICK_GRADES];
  return presets.includes(scanned) ? presets : [scanned, ...presets];
}

function Ready({
  photo,
  matches,
  lookup,
  onAdd,
  onScanAnother,
  onSearch,
}: {
  photo: string | null;
  matches: ScanMatch[];
  lookup: CompLookup;
  onAdd: Props["onAdd"];
  onScanAnother: () => void;
  onSearch: () => void;
}) {
  const [rows, setRows] = useState(matches);
  const top = rows[0];
  const [pick, setPick] = useState<ParallelPick>(() => (top ? initialChoice(top) : null));
  const [grade, setGrade] = useState(() => (top ? scanCompGrade(top) : "Raw"));
  // Every card, parallel and grade looked up on this sheet, so switching back is instant.
  const [results, setResults] = useState<ReadonlyMap<string, ScanCompResult>>(new Map());

  const target = useMemo(
    () => (top ? compIdentityFromMatch({ ...top, parallel: pick?.name ?? "" }, grade) : null),
    [top, pick, grade],
  );
  const serialRun = pick?.serialRun ?? top?.serialRun ?? null;
  const key = target ? compQueryString(target.identity, serialRun) : "";

  useEffect(() => {
    if (!target || results.has(key)) return;
    let live = true;
    const store = (result: ScanCompResult) => {
      if (live) setResults((prev) => new Map(prev).set(key, result));
    };
    lookup(target.identity, { serialRun }).then(store, () => store({ status: "unavailable" }));
    return () => {
      live = false;
    };
  }, [key, lookup, results, serialRun, target]);

  if (!top) return null;

  function promote(index: number) {
    const next = promoteMatch(rows, index);
    setRows(next);
    setPick(initialChoice(next[0]));
    setGrade(scanCompGrade(next[0]));
  }

  function retry() {
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  function add() {
    const result = confirmMatch(top, pick, top.serialNo);
    const match = "match" in result ? result.match : { ...top, parallel: "" };
    onAdd(match, { save: readyToSave(match) });
  }

  const result = key ? results.get(key) : undefined;

  return (
    <div className="space-y-6">
      <MatchSummary photo={photo} match={top} />

      {target ? (
        <ValuePanel result={result} onRetry={retry} assumedBase={target.assumedBase} />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{COMP_COPY.needYear}</p>
      )}

      <ParallelStrip
        options={parallelOptionsFor(top)}
        // The prices shown are Base's, so Base reads selected until another parallel is tapped.
        pick={pick ?? (target?.assumedBase ? { name: "Base", serialRun: null } : null)}
        somethingElse={false}
        hint={target?.assumedBase ? COMP_COPY.assumedBase : null}
        onChoose={setPick}
      />

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
        <PrimaryButton onClick={add}>{COMP_COPY.add}</PrimaryButton>
        <div className="flex justify-center">
          <QuietButton onClick={onScanAnother}>{COMP_COPY.next}</QuietButton>
        </div>
      </div>

      <OtherMatches rows={rows} onPromote={promote} />

      <div className="flex justify-center">
        <QuietButton onClick={onSearch}>{CONFIRM_COPY.noneOfThese}</QuietButton>
      </div>
    </div>
  );
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
  onRetry,
  assumedBase,
}: {
  result: ScanCompResult | undefined;
  onRetry: () => void;
  assumedBase: boolean;
}) {
  const box = "rounded-2xl border border-zinc-200 p-4 dark:border-white/10";

  if (!result) {
    return (
      <div className={box} aria-busy="true">
        <p className="sr-only" role="status">
          {COMP_COPY.checking}
        </p>
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
        <QuietButton onClick={onRetry} className="-ml-3 mt-1">
          {COMP_COPY.retry}
        </QuietButton>
      </div>
    );
  }

  if (result.status === "none") {
    return (
      <div className={box}>
        <p className="text-[15px] font-semibold">{COMP_COPY.none}</p>
        <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{COMP_COPY.noneBody}</p>
      </div>
    );
  }

  const tone = result.trend;
  return (
    <div className={box}>
      {result.medianCents != null ? (
        <>
          <p className="text-[13px] font-medium text-zinc-500">
            {COMP_COPY.value}
            {assumedBase ? <span> · Base</span> : null}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-[28px] leading-9 font-semibold tabular-nums">{dollars(result.medianCents)}</p>
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
        <p className="text-[15px] font-semibold">{COMP_COPY.fewSales}</p>
      )}

      <p className="mt-4 text-[13px] font-medium text-zinc-500">{COMP_COPY.sales}</p>
      <ul className="mt-1 divide-y divide-zinc-200 dark:divide-white/10">
        {result.sales.slice(0, 5).map((sale, index) => (
          <li key={`${sale.soldAt ?? "sale"}-${index}`} className="flex min-h-10 items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">{saleDay(sale.soldAt)}</span>
            <span className="font-mono font-medium tabular-nums">{dollars(sale.priceCents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-500">
        {COMP_COPY.credit}
        {result.asOf ? ` · updated ${formatRelativeTime(result.asOf)}` : ""}
      </p>
    </div>
  );
}
