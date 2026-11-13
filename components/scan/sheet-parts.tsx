"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { Chip, RunBadge, SectionLabel, SwatchDot, focusRing } from "@/components/add-card/flow-ui";
import { money } from "@/lib/format";
import { quickCompLimitMessage } from "@/lib/quick-comp/respond";
import { COMP_COPY, lastSale, type SoldsState } from "@/lib/scan/comp";
import { CONFIRM_COPY, gradeLabel, maskCert, matchLine, type ParallelPick } from "@/lib/scan/confirm";
import type { FieldSureness, ScanMatch } from "@/lib/scan/match";
import type { ProductParallel } from "@/lib/cards/product-data";
import { isUnnamedRunLabel } from "@/lib/scan/scan-sales";
import { ListingThumb } from "@/components/scan/listing-photo";

/** The scanner's bottom sheet: a labelled modal dialog with a grabber, a title and Close. */
export function SheetFrame({
  title,
  busy = false,
  variant = "sheet",
  onClose,
  children,
}: {
  title: string;
  busy?: boolean;
  /**
   * "scene": the scan reveal. Taller, over a blurred and dimmed screen, with a
   * small title so the card leads. "sheet": the plain bottom sheet.
   */
  variant?: "sheet" | "scene";
  onClose: () => void;
  children: ReactNode;
}) {
  const scene = variant === "scene";
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label={CONFIRM_COPY.close}
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 motion-safe:animate-[lightbox-fade_180ms_cubic-bezier(0.22,1,0.36,1)_both] ${
          scene ? "glass-scrim bg-zinc-950/70 backdrop-blur-xl" : "bg-zinc-950/50"
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        tabIndex={-1}
        className={`relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-[var(--background)] pb-[env(safe-area-inset-bottom)] outline-none motion-safe:animate-[composer-in_320ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both] md:rounded-3xl dark:border-white/10 ${
          scene ? "max-h-[94dvh] rounded-t-[28px] shadow-[0_-16px_48px_rgba(9,9,11,0.4)]" : "max-h-[88dvh]"
        }`}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-zinc-300 dark:bg-white/20" />
        <div className="flex items-center justify-between gap-2 pr-2 pl-5 pt-2">
          <h2
            id={titleId}
            className={scene ? "text-13 font-medium text-zinc-500 dark:text-zinc-400" : "text-17 font-semibold tracking-tight"}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={CONFIRM_COPY.close}
            className={`inline-flex size-11 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-zinc-900/5 dark:hover:bg-white/10 ${focusRing}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">{children}</div>
      </div>
    </div>
  );
}

/** A value the scan wasn't sure of reads muted, and says so to screen readers. */
function Field({ sureness, children }: { sureness: FieldSureness; children: string }) {
  if (!children) return null;
  if (sureness !== "unsure") return <span>{children}</span>;
  return (
    <span className="text-zinc-500 dark:text-zinc-400">
      {children}
      <span className="sr-only"> ({CONFIRM_COPY.notSure.toLowerCase()})</span>
    </span>
  );
}

export function CardPhoto({ photo, name }: { photo: string | null; name: string }) {
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
      <span aria-hidden className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
        {initials}
      </span>
    </div>
  );
}

/** The scan photo next to the player, card line, grade and the last 4 of the cert. */
export function MatchSummary({ photo, match }: { photo: string | null; match: ScanMatch }) {
  const grade = gradeLabel(match.grade);
  const cert = maskCert(match.grade?.certNumber ?? "");
  return (
    <div className="grid grid-cols-[80px_1fr] items-start gap-4">
      <CardPhoto photo={photo} name={match.playerName} />
      <div className="min-w-0 pt-1">
        <p className="text-17 leading-6 font-semibold">
          <Field sureness={match.sureness.player}>{match.playerName || CONFIRM_COPY.playerOpen}</Field>
        </p>
        <p className="mt-1 text-sm leading-5">
          <Field sureness={match.sureness.year}>{match.yearLabel}</Field>{" "}
          <Field sureness={match.sureness.set}>{match.setBrand}</Field>{" "}
          {match.cardNumber ? <Field sureness={match.sureness.number}>{`#${match.cardNumber}`}</Field> : null}
        </p>
        {match.subset ? <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{match.subset}</p> : null}
        {match.playerNew ? <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{CONFIRM_COPY.playerNew}</p> : null}
        {grade || match.isRookie || match.isAuto || match.firstBowman || match.serialRun ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {grade ? (
              <span className="rounded-md border border-zinc-300 px-2 py-0.5 font-mono text-xs leading-5 font-medium tabular-nums dark:border-white/20">
                {grade}
              </span>
            ) : null}
            {cert ? (
              <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400 tabular-nums">
                <span className="sr-only">Cert ending </span>
                <span aria-hidden>Cert </span>
                {cert}
              </span>
            ) : null}
            {match.serialRun ? (
              // The print run the card showed, even with the parallel still open.
              <span className="font-mono text-xs leading-5 font-medium tabular-nums">
                <span className="sr-only">Numbered </span>
                {match.serialNo ? `${match.serialNo}/${match.serialRun}` : `/${match.serialRun}`}
              </span>
            ) : null}
            {match.isRookie ? <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400">RC</span> : null}
            {match.firstBowman ? <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400">1st Bowman</span> : null}
            {match.isAuto ? <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400">Auto</span> : null}
          </div>
        ) : null}
        <div className="mt-2 empty:hidden">
          <ListingThumb match={match} scan={photo} label />
        </div>
      </div>
    </div>
  );
}

/** The order the scan reveal fills a card's name in: player, year and set, number, parallel, then tags. */
export const REVEAL_STAGES = ["player", "set", "number", "parallel", "tags"] as const;
export type RevealStage = (typeof REVEAL_STAGES)[number];
/** Time between one part of the name and the next. Quick: the whole name lands in under 700ms. */
export const REVEAL_STEP_MS = 130;

/** Each part slides in after the one before it; with reduced motion it simply fades in. */
function stageMotion(stage: RevealStage): { className: string; style: { animationDelay: string } } {
  return {
    className:
      "motion-safe:animate-[name-fill-in_320ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both]",
    style: { animationDelay: `${REVEAL_STAGES.indexOf(stage) * REVEAL_STEP_MS}ms` },
  };
}

/**
 * The scan reveal's card: the photo, big and centered, flips in once. It stays
 * mounted while the name fills in under it, so it never flips twice. Reduced
 * motion fades it in instead.
 */
export function RevealCard({ photo }: { photo: string | null }) {
  return (
    <div className="flex justify-center pt-1 pb-5" data-reveal="scan-card">
      <div className="w-36 motion-safe:animate-[card-flip-in_620ms_cubic-bezier(0.2,0.7,0.2,1)_both] motion-reduce:animate-[add-fade_200ms_ease-out_both] [backface-visibility:hidden]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt="Your scan"
            width={144}
            height={202}
            className="aspect-[5/7] w-36 rounded-xl object-cover shadow-[0_18px_40px_rgba(9,9,11,0.35)] ring-1 ring-zinc-900/10 dark:ring-white/10"
          />
        ) : (
          <div
            role="img"
            aria-label="No photo"
            className="grid aspect-[5/7] w-36 place-items-center rounded-xl bg-gradient-to-b from-zinc-100 to-zinc-200 shadow-[0_18px_40px_rgba(9,9,11,0.25)] ring-1 ring-zinc-900/10 dark:from-white/[0.08] dark:to-white/[0.03] dark:ring-white/10"
          >
            <span aria-hidden className="size-8 rounded-full bg-zinc-900/[0.06] dark:bg-white/10" />
          </div>
        )}
      </div>
    </div>
  );
}

/** While the scan is matched: the name's lines as skeletons, never a spinner. */
export function RevealNameSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 pb-2" data-reveal="name-skeleton">
      <p className="sr-only" role="status">
        {label}
      </p>
      <div aria-hidden className="h-6 w-44 rounded-md skeleton-shimmer" />
      <div aria-hidden className="h-4 w-52 rounded-md skeleton-shimmer" />
      <div aria-hidden className="h-4 w-24 rounded-md skeleton-shimmer" />
    </div>
  );
}

/**
 * The card's name, filled in step by step under the flipped card: player,
 * then year and set, then the number, then the parallel picked so far, then
 * the grade, cert (last 4) and tags. A value the scan wasn't sure of reads muted.
 */
export function RevealName({ match, parallel, photo = null }: { match: ScanMatch; parallel: string | null; photo?: string | null }) {
  const grade = gradeLabel(match.grade);
  const cert = maskCert(match.grade?.certNumber ?? "");
  const player = stageMotion("player");
  const set = stageMotion("set");
  const number = stageMotion("number");
  const pick = stageMotion("parallel");
  const tags = stageMotion("tags");
  return (
    <div className="flex flex-col items-center text-center" data-reveal="name">
      <p data-stage="player" className={`text-[1.375rem] leading-7 font-semibold tracking-tight ${player.className}`} style={player.style}>
        <Field sureness={match.sureness.player}>{match.playerName || CONFIRM_COPY.playerOpen}</Field>
      </p>
      <p className="mt-1 text-15 leading-5 text-zinc-600 dark:text-zinc-300">
        <span data-stage="set" className={`inline-block ${set.className}`} style={set.style}>
          <Field sureness={match.sureness.year}>{match.yearLabel}</Field>{" "}
          <Field sureness={match.sureness.set}>{match.setBrand}</Field>
        </span>
        {match.cardNumber ? (
          <>
            {" "}
            <span data-stage="number" className={`inline-block font-mono tabular-nums ${number.className}`} style={number.style}>
              <Field sureness={match.sureness.number}>{`#${match.cardNumber}`}</Field>
            </span>
          </>
        ) : null}
      </p>
      {parallel ? (
        <p
          data-stage="parallel"
          className={`mt-2 inline-flex items-center gap-1.5 text-sm font-medium ${pick.className}`}
          style={pick.style}
        >
          <SwatchDot name={parallel} size="sm" />
          <Field sureness={match.sureness.parallel}>{parallel}</Field>
        </p>
      ) : null}
      {match.subset ? (
        <p className={`mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400 ${pick.className}`} style={pick.style}>
          {match.subset}
        </p>
      ) : null}
      {match.playerNew ? (
        <p className={`mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400 ${tags.className}`} style={tags.style}>
          {CONFIRM_COPY.playerNew}
        </p>
      ) : null}
      {grade || cert || match.isRookie || match.isAuto || match.firstBowman || match.serialRun ? (
        <div data-stage="tags" className={`mt-3 flex flex-wrap items-center justify-center gap-2 ${tags.className}`} style={tags.style}>
          {grade ? (
            <span className="rounded-md border border-zinc-300 px-2 py-0.5 font-mono text-xs leading-5 font-medium tabular-nums dark:border-white/20">
              {grade}
            </span>
          ) : null}
          {cert ? (
            <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400 tabular-nums">
              <span className="sr-only">Cert ending </span>
              <span aria-hidden>Cert </span>
              {cert}
            </span>
          ) : null}
          {match.serialRun ? (
            <span className="font-mono text-xs leading-5 font-medium tabular-nums">
              <span className="sr-only">Numbered </span>
              {match.serialNo ? `${match.serialNo}/${match.serialRun}` : `/${match.serialRun}`}
            </span>
          ) : null}
          {match.isRookie ? <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400">RC</span> : null}
          {match.firstBowman ? <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400">1st Bowman</span> : null}
          {match.isAuto ? <span className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400">Auto</span> : null}
        </div>
      ) : null}
      <div className={`mt-2 empty:hidden ${tags.className}`} style={tags.style}>
        <ListingThumb match={match} scan={photo} label />
      </div>
    </div>
  );
}

/** The parallel options for this match: the matcher's list, or the one it read. */
export function parallelOptionsFor(match: ScanMatch): ProductParallel[] {
  if (match.parallelOptions.length > 0) return match.parallelOptions;
  return match.parallel ? [{ name: match.parallel, serialRun: match.serialRun }] : [];
}

/** One tap per parallel: a scrolling row of swatch chips. */
export function ParallelStrip({
  options,
  pick,
  deferred = false,
  hint,
  somethingElse = true,
  onChoose,
}: {
  options: ProductParallel[];
  pick: ParallelPick;
  /** "Something else" is selected. */
  deferred?: boolean;
  /** Shown beside the label, e.g. "Pick the parallel". */
  hint?: string | null;
  somethingElse?: boolean;
  onChoose: (next: ParallelPick) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>{CONFIRM_COPY.parallel}</SectionLabel>
        {hint ? <p className="mb-2 text-right text-13 text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
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
            onClick={() => onChoose({ name: option.name, serialRun: option.serialRun })}
            aria-label={option.serialRun ? `${option.name}, numbered to ${option.serialRun}` : option.name}
            className="shrink-0 snap-start pl-3"
          >
            <SwatchDot name={option.name} size="sm" />
            {option.name}
            {option.serialRun ? <RunBadge run={option.serialRun} /> : null}
          </Chip>
        ))}
        {somethingElse ? (
          <Chip selected={deferred} onClick={() => onChoose(null)} className="shrink-0 snap-start">
            {CONFIRM_COPY.somethingElse}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

/** "Or one of these": tapping a row makes it the top match. */
export function OtherMatches({
  rows,
  onPromote,
  photo = null,
}: {
  rows: ScanMatch[];
  onPromote: (index: number) => void;
  /** The scan, shown beside a listing's photo when one is enlarged. */
  photo?: string | null;
}) {
  if (rows.length <= 1) return null;
  return (
    <div>
      <SectionLabel>{CONFIRM_COPY.others}</SectionLabel>
      <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-white/10 dark:border-white/10">
        {rows.slice(1).map((match, index) => (
          <li key={`${match.catalogId ?? "read"}-${index}`} className="flex items-center gap-2 py-1 pl-2 big:flex-col big:items-start">
            {/* That exact card's photo from a sold listing, or an empty card. Its own tap target: it enlarges. */}
            <ListingThumb match={match} scan={photo} />
            <button
              type="button"
              onClick={() => onPromote(index + 1)}
              className={`flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-r-2xl py-2 pr-4 text-left big:w-full hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04] ${focusRing}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{match.playerName}</span>
                <span className="block truncate text-13 text-zinc-500 dark:text-zinc-400">{matchLine(match)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const skeletonBar = "skeleton-shimmer rounded-md";

/** Skeletons while the scan is matched. Never a spinner. */
export function MatchingSkeleton({ photo, label }: { photo: string | null; label: string }) {
  return (
    <div className="space-y-6">
      <p className="sr-only" role="status">
        {label}
      </p>
      <div className="grid grid-cols-[80px_1fr] items-start gap-4">
        {photo ? <CardPhoto photo={photo} name="this card" /> : <div className={`aspect-[5/7] w-20 ${skeletonBar}`} />}
        <div className="space-y-2 pt-2">
          <div className={`h-5 w-40 ${skeletonBar}`} />
          <div className={`h-4 w-48 ${skeletonBar}`} />
          <div className={`h-4 w-20 ${skeletonBar}`} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className={`h-11 w-24 rounded-full ${skeletonBar}`} />
        <div className={`h-11 w-24 rounded-full ${skeletonBar}`} />
        <div className={`h-11 w-24 rounded-full ${skeletonBar}`} />
      </div>
      <div className={`h-12 rounded-full ${skeletonBar}`} />
    </div>
  );
}

export { skeletonBar };

function saleDay(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Recent sales that name more than one parallel, with the card's still open:
 * each group's count and newest price, and nothing priced until it's picked.
 */
type GroupRow = { label: string; nSales: number; lastPriceCents?: number | null };

/** A sold group the collector can tap to price their card as that parallel. A run-only group isn't a parallel. */
function tappable(label: string): boolean {
  return !isUnnamedRunLabel(label);
}

function GroupRows({ groups, onPick }: { groups: readonly GroupRow[]; onPick?: (label: string) => void }) {
  return (
    <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
      {groups.map((group) => {
        const body = (
          <>
            <span>
              {group.label}
              <span className="text-zinc-500 dark:text-zinc-400">
                {" · "}
                <span className="font-mono tabular-nums">{group.nSales}</span> {group.nSales === 1 ? "sale" : "sales"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {group.lastPriceCents != null ? (
                <span className="font-mono font-medium tabular-nums">{money(group.lastPriceCents / 100)}</span>
              ) : null}
              {onPick && tappable(group.label) ? <ChevronRight aria-hidden className="size-4 text-zinc-400" /> : null}
            </span>
          </>
        );
        return (
          <li key={group.label}>
            {onPick && tappable(group.label) ? (
              <button
                type="button"
                onClick={() => onPick(group.label)}
                aria-label={`Show ${group.label} sales, ${group.nSales} ${group.nSales === 1 ? "sale" : "sales"}`}
                className={`-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 text-left text-sm hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04] ${focusRing}`}
              >
                {body}
              </button>
            ) : (
              <div className="flex min-h-10 items-center justify-between gap-3 text-sm">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SplitGroups({
  groups,
  missing,
  onPick,
}: {
  groups: { label: string; nSales: number; lastPriceCents: number | null; lastSoldAt: string | null }[];
  /** "Base": an unnumbered card had no Base sales, only other parallels. */
  missing?: "Base";
  /** Tap a group to price the card as that parallel. */
  onPick?: (label: string) => void;
}) {
  return (
    <div role="status">
      <p className="text-sm font-medium">{missing ? COMP_COPY.noBase : groups.length === 1 ? COMP_COPY.splitOne : COMP_COPY.split}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {missing ? COMP_COPY.noBaseBody : groups.length === 1 ? COMP_COPY.splitOneBody : COMP_COPY.splitBody}
      </p>
      <GroupRows groups={groups} onPick={onPick} />
    </div>
  );
}

/** Under a Base price on an unnumbered card: the other parallels recent sales name, one tap each. */
export function OtherGroups({ groups, onPick }: { groups: readonly { label: string; nSales: number }[]; onPick: (label: string) => void }) {
  if (groups.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-13 font-medium text-zinc-500 dark:text-zinc-400">{COMP_COPY.otherGroups}</p>
      <GroupRows groups={groups} onPick={onPick} />
    </div>
  );
}

/**
 * The card's last eBay sold, one line under the match on the Add card sheet.
 * Looking while the live search runs, then the price and day, or plainly why
 * there isn't one. Never a made-up price.
 */
export function LastSold({
  solds,
  pick = null,
  onPick,
}: {
  solds: SoldsState;
  /** The parallel picked on the sheet: when the sales name it, its own last sale shows. */
  pick?: string | null;
  /** Tap a parallel the sales name to pick it. */
  onPick?: (label: string) => void;
}) {
  const box = "flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-4 py-2.5 big:flex-wrap dark:border-white/10";
  if (solds.status === "looking") {
    return (
      <div className={box} aria-busy="true">
        <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
          {COMP_COPY.looking}
        </p>
        <div aria-hidden className={`h-5 w-16 ${skeletonBar}`} />
      </div>
    );
  }
  const { comp } = solds;
  if (comp.status === "split") {
    // The picked parallel is one the sales name: its own last sale, the way a priced card shows.
    const picked = pick ? comp.groups.find((group) => group.label.toLowerCase() === pick.toLowerCase()) : undefined;
    if (picked && picked.lastPriceCents != null) {
      const day = saleDay(picked.lastSoldAt);
      return (
        <div className={box} data-slot="last-sold-picked">
          <div className="min-w-0">
            <p className="text-13 font-medium text-zinc-500 dark:text-zinc-400">
              {COMP_COPY.lastSold} · {picked.label}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{COMP_COPY.credit}</p>
          </div>
          <p className="shrink-0 text-right">
            <span className="font-mono text-17 font-semibold tabular-nums">{money(picked.lastPriceCents / 100)}</span>
            {day ? <span className="block font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{day}</span> : null}
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
        <SplitGroups groups={comp.groups} missing={comp.missing} onPick={onPick} />
      </div>
    );
  }
  const sale = lastSale(comp);
  if (sale) {
    const day = saleDay(sale.soldAt);
    return (
      <div className={box}>
        <div className="min-w-0">
          <p className="text-13 font-medium text-zinc-500 dark:text-zinc-400">
            {COMP_COPY.lastSold}
            {comp.status === "ok" && comp.parallel ? ` · ${comp.parallel}` : ""}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{COMP_COPY.credit}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="font-mono text-17 font-semibold tabular-nums">{money(sale.priceCents / 100)}</span>
          {day ? <span className="block font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{day}</span> : null}
        </p>
      </div>
    );
  }
  const message =
    comp.status === "ok" && comp.unclean
      ? COMP_COPY.notClean
      : comp.status === "limited"
        ? quickCompLimitMessage(comp.reason)
        : comp.status === "unavailable"
          ? COMP_COPY.unavailable
          : comp.status === "none" && comp.searched
            ? COMP_COPY.noneSearched
            : COMP_COPY.none;
  return (
    <div className={box} role="status">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
    </div>
  );
}

/** The parallels the scan's sales name join the chips, so one tapped from the sales list reads selected. */
export function withSoldGroups(
  options: ProductParallel[],
  solds: SoldsState | undefined,
  serialRun: number | null,
  assumedBase: boolean,
): ProductParallel[] {
  if (solds?.status !== "done") return options;
  const comp = solds.comp;
  const groups: { label: string }[] = comp.status === "ok" || comp.status === "split" ? [...(comp.groups ?? [])] : [];
  // A price named by its sales' parallel ("Last sold · Black") offers that parallel too.
  if (comp.status === "ok" && comp.parallel && !groups.some((group) => group.label === comp.parallel)) groups.push({ label: comp.parallel });
  const out = [...options];
  const has = (name: string) => out.some((option) => option.name.toLowerCase() === name.toLowerCase());
  // The Base the sheet is showing reads first and selected.
  if (assumedBase && groups.length > 0 && !has("Base")) out.unshift({ name: "Base", serialRun: null });
  for (const group of groups) {
    if (isUnnamedRunLabel(group.label) || has(group.label)) continue;
    out.push({ name: group.label, serialRun });
  }
  // No sales yet on a numbered card with no parallel named: last year's parallels at this print run, to tap.
  for (const name of solds.similar?.parallels ?? []) if (!has(name)) out.push({ name, serialRun });
  return out;
}

/**
 * Under the card's name: how the set was settled, or the one question left about it. Sapphire
 * Edition shares its checklist with the regular set and often prints nothing to tell them apart,
 * so it is asked, never guessed.
 */
export function SetNotes({ match, onSapphire, center = false }: { match: ScanMatch; onSapphire?: () => void; center?: boolean }) {
  const fromSales = match.setSource === "sales";
  const ask = !fromSales && Boolean(match.sapphireOption) && Boolean(onSapphire);
  if (!fromSales && !ask) return null;
  return (
    <div className={center ? "flex justify-center" : ""} data-slot="set-notes">
      {fromSales ? <p className="text-13 leading-5 text-zinc-500 dark:text-zinc-400">{CONFIRM_COPY.sapphireFromSales}</p> : null}
      {ask ? (
        <button
          type="button"
          onClick={onSapphire}
          aria-label={`${CONFIRM_COPY.sapphireAsk} Switch to ${match.sapphireOption} and look up its sales`}
          className={`inline-flex min-h-11 items-center rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-900/[0.03] dark:border-white/20 dark:hover:bg-white/[0.04] ${focusRing}`}
        >
          {CONFIRM_COPY.sapphireAsk}
        </button>
      ) : null}
    </div>
  );
}
