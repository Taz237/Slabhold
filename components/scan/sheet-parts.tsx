"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { Chip, RunBadge, SectionLabel, SwatchDot, focusRing } from "@/components/add-card/flow-ui";
import { money } from "@/lib/format";
import { QUICK_COMP_DAILY_MESSAGE, QUICK_COMP_HOURLY_MESSAGE } from "@/lib/quick-comp/respond";
import { COMP_COPY, lastSale, type SoldsState } from "@/lib/scan/comp";
import { CONFIRM_COPY, gradeLabel, maskCert, matchLine, type ParallelPick } from "@/lib/scan/confirm";
import type { FieldSureness, ScanMatch } from "@/lib/scan/match";
import type { ProductParallel } from "@/lib/cards/product-data";

/** The scanner's bottom sheet: a labelled modal dialog with a grabber, a title and Close. */
export function SheetFrame({
  title,
  busy = false,
  onClose,
  children,
}: {
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
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
        className="absolute inset-0 bg-zinc-950/50 motion-safe:animate-[lightbox-fade_180ms_cubic-bezier(0.22,1,0.36,1)_both]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
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
    <span className="text-zinc-500">
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
      <span aria-hidden className="font-mono text-sm text-zinc-500">
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
        <p className="text-[17px] leading-6 font-semibold">
          <Field sureness={match.sureness.player}>{match.playerName}</Field>
        </p>
        <p className="mt-1 text-sm leading-5">
          <Field sureness={match.sureness.year}>{match.yearLabel}</Field>{" "}
          <Field sureness={match.sureness.set}>{match.setBrand}</Field>{" "}
          {match.cardNumber ? <Field sureness={match.sureness.number}>{`#${match.cardNumber}`}</Field> : null}
        </p>
        {grade || match.isRookie || match.isAuto ? (
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
            {match.isRookie ? <span className="font-mono text-xs leading-5 text-zinc-500">RC</span> : null}
            {match.isAuto ? <span className="font-mono text-xs leading-5 text-zinc-500">Auto</span> : null}
          </div>
        ) : null}
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
        {hint ? <p className="mb-2 text-right text-[13px] text-zinc-500">{hint}</p> : null}
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
export function OtherMatches({ rows, onPromote }: { rows: ScanMatch[]; onPromote: (index: number) => void }) {
  if (rows.length <= 1) return null;
  return (
    <div>
      <SectionLabel>{CONFIRM_COPY.others}</SectionLabel>
      <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-white/10 dark:border-white/10">
        {rows.slice(1).map((match, index) => (
          <li key={`${match.catalogId ?? "read"}-${index}`}>
            <button
              type="button"
              onClick={() => onPromote(index + 1)}
              className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04] ${focusRing}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{match.playerName}</span>
                <span className="block truncate text-[13px] text-zinc-500">{matchLine(match)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const skeletonBar = "rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10";

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
 * The card's last eBay sold, one line under the match on the Add card sheet.
 * Looking while the live search runs, then the price and day, or plainly why
 * there isn't one. Never a made-up price.
 */
export function LastSold({ solds }: { solds: SoldsState }) {
  const box = "flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-4 py-2.5 dark:border-white/10";
  if (solds.status === "looking") {
    return (
      <div className={box} aria-busy="true">
        <p className="text-sm text-zinc-500" role="status">
          {COMP_COPY.looking}
        </p>
        <div aria-hidden className={`h-5 w-16 ${skeletonBar}`} />
      </div>
    );
  }
  const { comp } = solds;
  const sale = lastSale(comp);
  if (sale) {
    const day = saleDay(sale.soldAt);
    return (
      <div className={box}>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-500">{COMP_COPY.lastSold}</p>
          <p className="text-xs text-zinc-500">{COMP_COPY.credit}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="font-mono text-[17px] font-semibold tabular-nums">{money(sale.priceCents / 100)}</span>
          {day ? <span className="block font-mono text-xs text-zinc-500 tabular-nums">{day}</span> : null}
        </p>
      </div>
    );
  }
  const message =
    comp.status === "limited"
      ? comp.reason === "daily"
        ? QUICK_COMP_DAILY_MESSAGE
        : QUICK_COMP_HOURLY_MESSAGE
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
