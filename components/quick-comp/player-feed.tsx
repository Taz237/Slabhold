"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, LayoutGrid, List, X } from "lucide-react";
import { money } from "@/lib/format";
import {
  activeFilterCount,
  chipOn,
  FEED_SORTS,
  feedChips,
  filterSales,
  NO_FILTERS,
  sortSales,
  toggleChip,
  type FeedFilters,
  type FeedSort,
  type PlayerSale,
} from "@/lib/quick-comp/player-feed";
import { feedback, focusRing, sectionLabel, textMuted, textSecondary } from "./tokens";

export const FEED_PAGE = 24;
export const COMP_THIS_CARD = "Comp this card";

/** "Nov 12", or "Nov 12, 2024" for an older year. */
export function soldDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** eBay serves each photo at several sizes in the same path: a thumb never pulls the 1600px one. */
export function photoAt(url: string, size: 300 | 500 | 1600): string {
  return url.replace(/\/s-l\d+\.(jpe?g|png|webp)(?=$|\?)/i, `/s-l${size}.$1`);
}

/** The card shape in a hairline, for a sale with no photo or a photo that broke. Never a broken-image icon. */
function CardPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
      <div className={`${compact ? "h-9 w-[1.6rem] rounded-[3px]" : "h-[46%] w-[33%] rounded-md"} border border-dashed border-zinc-950/15 dark:border-white/15`} />
    </div>
  );
}

function SalePhoto({ sale, size, compact, eager = false }: { sale: PlayerSale; size: 300 | 500 | 1600; compact?: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!sale.photo || failed) return <CardPlaceholder compact={compact} />;
  return (
    <>
      {loaded ? null : <span aria-hidden="true" className="skeleton-shimmer absolute inset-0 bg-zinc-100 dark:bg-zinc-900" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoAt(sale.photo, size)}
        alt=""
        width={size === 300 ? 112 : 400}
        height={size === 300 ? 156 : 560}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        ref={(img) => {
          if (!img?.complete) return;
          if (img.naturalWidth === 0) setFailed(true);
          else setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`relative h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}

/** Raw in the quiet tone; a slab grade in the brand's light purple. A short tag, so Geist Mono. */
function GradeTag({ sale }: { sale: PlayerSale }) {
  const graded = sale.company !== "raw";
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-[11px] leading-none font-medium tabular-nums ${
        graded ? "bg-violet-600/10 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200" : "bg-zinc-950/[0.05] text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-300"
      }`}
    >
      {sale.grade}
    </span>
  );
}

function saleLabel(sale: PlayerSale): string {
  return `${sale.title}. ${money(sale.price)}, ${sale.grade}, sold ${soldDay(sale.soldAt)}`;
}

function ListRow({ sale, onOpen }: { sale: PlayerSale; onOpen: (sale: PlayerSale) => void }) {
  return (
    <li>
      <button
        type="button"
        aria-label={saleLabel(sale)}
        onClick={() => onOpen(sale)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-zinc-950/[0.03] active:bg-zinc-950/[0.06] dark:hover:bg-white/[0.04] dark:active:bg-white/[0.08] ${feedback} ${focusRing}`}
      >
        <span className="relative h-[4.5rem] w-[3.25rem] shrink-0 overflow-hidden rounded-md ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08]">
          <SalePhoto sale={sale} size={300} compact />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-13 leading-[18px] font-medium">{sale.title}</span>
          <span className={`flex items-center gap-2 text-xs leading-4 ${textMuted}`}>
            <GradeTag sale={sale} />
            <span className="tabular-nums">{soldDay(sale.soldAt)}</span>
          </span>
        </span>
        <span className="shrink-0 self-start pt-0.5 font-mono text-15 leading-5 font-semibold tabular-nums">{money(sale.price)}</span>
      </button>
    </li>
  );
}

function GridTile({ sale, onOpen }: { sale: PlayerSale; onOpen: (sale: PlayerSale) => void }) {
  return (
    <li>
      <button
        type="button"
        aria-label={saleLabel(sale)}
        onClick={() => onOpen(sale)}
        className={`group flex w-full flex-col gap-2 rounded-2xl text-left ${focusRing}`}
      >
        <span className="relative block aspect-[5/7] w-full overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-950/[0.06] motion-safe:transition-transform motion-safe:duration-150 group-active:scale-[0.98] dark:bg-zinc-900 dark:ring-white/[0.08]">
          <SalePhoto sale={sale} size={500} />
        </span>
        <span className="flex items-center justify-between gap-2 px-0.5">
          <span className="font-mono text-15 leading-5 font-semibold tabular-nums">{money(sale.price)}</span>
          <GradeTag sale={sale} />
        </span>
        <span className={`-mt-1 line-clamp-2 px-0.5 text-xs leading-4 ${textSecondary}`}>{sale.title}</span>
        <span className={`-mt-1 px-0.5 text-xs leading-4 tabular-nums ${textMuted}`}>Sold {soldDay(sale.soldAt)}</span>
      </button>
    </li>
  );
}

function FeedSkeleton() {
  return (
    <ul aria-hidden="true" data-player-feed-state="loading" className="flex flex-col">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <li key={row} className="flex items-center gap-3 px-2 py-2">
          <span className="skeleton-shimmer block h-[4.5rem] w-[3.25rem] shrink-0 rounded-md bg-zinc-100 dark:bg-white/5" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="skeleton-shimmer block h-3.5 w-11/12 rounded-md bg-zinc-100 dark:bg-white/5" />
            <span className="skeleton-shimmer block h-3 w-24 rounded-md bg-zinc-100 dark:bg-white/5" />
          </span>
          <span className="skeleton-shimmer block h-4 w-14 self-start rounded-md bg-zinc-100 dark:bg-white/5" />
        </li>
      ))}
    </ul>
  );
}

const chipBase = `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-13 font-medium whitespace-nowrap ${feedback} ${focusRing}`;
const chipOff = "bg-white ring-1 ring-zinc-950/10 text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 dark:bg-white/[0.04] dark:ring-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.07]";
const chipOnClass = "bg-violet-600 text-white ring-1 ring-violet-600 hover:bg-violet-700 active:bg-violet-800";

export type FeedState =
  | { status: "loading" }
  | { status: "ready"; sales: PlayerSale[] }
  | { status: "notice"; notice: ReactNode };

export function PlayerFeed({
  player,
  state,
  initialFilters,
  onOpenSale,
}: {
  player: string;
  state: FeedState;
  initialFilters?: Partial<FeedFilters>;
  onOpenSale: (sale: PlayerSale) => void;
}) {
  const sortLabel = useId();
  const [sort, setSort] = useState<FeedSort>("newest");
  const [view, setView] = useState<"list" | "grid">("list");
  const [filters, setFilters] = useState<FeedFilters>({ ...NO_FILTERS, ...initialFilters });
  const [shown, setShown] = useState(FEED_PAGE);

  const sales = useMemo(() => (state.status === "ready" ? state.sales : []), [state]);
  const chips = useMemo(() => feedChips(sales), [sales]);
  const visible = useMemo(() => sortSales(filterSales(sales, filters), sort), [sales, filters, sort]);
  const filtered = activeFilterCount(filters) > 0;

  return (
    <section aria-labelledby="player-feed-title" data-player-feed="" className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="player-feed-title" className="truncate text-17 leading-6 font-semibold">
            {player}
          </h2>
          <p className={`text-13 leading-5 ${textSecondary}`} aria-live="polite">
            {state.status === "ready"
              ? sales.length === 0
                ? "Recent sold prices, any card"
                : `${filtered ? `${visible.length} of ` : ""}${sales.length} recent sale${sales.length === 1 ? "" : "s"}, any card`
              : state.status === "loading"
                ? "Loading recent sold prices"
                : "Recent sold prices, any card"}
          </p>
        </div>
        {state.status === "ready" && sales.length > 0 ? (
          <div role="group" aria-label="View" className="flex shrink-0 rounded-[10px] p-0.5 ring-1 ring-zinc-950/10 dark:ring-white/10">
            {(
              [
                ["list", "List view", List],
                ["grid", "Grid view", LayoutGrid],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`grid size-11 place-items-center rounded-lg ${feedback} ${focusRing} ${
                  view === value ? "bg-zinc-950/[0.06] text-zinc-950 dark:bg-white/10 dark:text-zinc-50" : `${textMuted} hover:text-zinc-950 dark:hover:text-zinc-50`
                }`}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {state.status === "loading" ? <FeedSkeleton /> : null}
      {state.status === "notice" ? state.notice : null}

      {state.status === "ready" && sales.length === 0 ? (
        <div data-player-feed-state="empty" className="flex flex-col items-start gap-1 rounded-2xl px-4 py-6 ring-1 ring-zinc-950/10 dark:ring-white/10">
          <p className="text-15 leading-5 font-medium">No recent sales for {player}</p>
          <p className={`text-13 leading-5 ${textMuted}`}>Try the full name, or enter the card with its year</p>
        </div>
      ) : null}

      {state.status === "ready" && sales.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            <div role="radiogroup" aria-labelledby={sortLabel} className="flex items-center gap-1">
              <span id={sortLabel} className={`mr-2 ${sectionLabel}`}>
                Sort
              </span>
              {FEED_SORTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={sort === option.value}
                  onClick={() => {
                    setSort(option.value);
                    setShown(FEED_PAGE);
                  }}
                  className={`inline-flex min-h-11 items-center rounded-lg px-3 text-13 font-medium ${feedback} ${focusRing} ${
                    sort === option.value
                      ? "bg-white text-zinc-950 ring-1 ring-violet-600/50 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-violet-400/50"
                      : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {chips.length > 0 ? (
              <div role="group" aria-label="Filters" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filtered ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(NO_FILTERS);
                      setShown(FEED_PAGE);
                    }}
                    className={`${chipBase} ${chipOff}`}
                  >
                    <X aria-hidden="true" size={14} strokeWidth={1.75} />
                    Clear
                  </button>
                ) : null}
                {chips.map((chip) => {
                  const on = chipOn(chip, filters);
                  return (
                    <button
                      key={`${chip.kind}-${chip.label}`}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setFilters((current) => toggleChip(chip, current));
                        setShown(FEED_PAGE);
                      }}
                      className={`${chipBase} ${on ? chipOnClass : chipOff} ${chip.kind === "year" ? "font-mono tabular-nums" : ""}`}
                    >
                      {on ? <Check aria-hidden="true" size={14} strokeWidth={2} /> : null}
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <div data-player-feed-state="filtered-empty" className="flex flex-col items-start gap-1 rounded-2xl px-4 py-6 ring-1 ring-zinc-950/10 dark:ring-white/10">
              <p className="text-15 leading-5 font-medium">Nothing matches these filters</p>
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className={`-ml-1 inline-flex min-h-11 items-center rounded-[10px] px-1 text-13 font-medium text-violet-700 dark:text-violet-300 ${focusRing}`}
              >
                Clear filters
              </button>
            </div>
          ) : view === "list" ? (
            <ul aria-label={`${player} sales`} className="-mx-2 flex flex-col">
              {visible.slice(0, shown).map((sale) => (
                <ListRow key={sale.id} sale={sale} onOpen={onOpenSale} />
              ))}
            </ul>
          ) : (
            <ul aria-label={`${player} sales`} className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
              {visible.slice(0, shown).map((sale) => (
                <GridTile key={sale.id} sale={sale} onOpen={onOpenSale} />
              ))}
            </ul>
          )}
          {visible.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((count) => count + FEED_PAGE)}
              className={`inline-flex min-h-11 items-center justify-center rounded-full text-sm font-medium ring-1 ring-zinc-950/10 hover:bg-zinc-950/[0.03] active:bg-zinc-950/[0.06] dark:ring-white/10 dark:hover:bg-white/5 ${feedback} ${focusRing}`}
            >
              Show more
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Fact({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-zinc-950/10 dark:ring-white/10 ${mono ? "font-mono tabular-nums" : ""} ${textSecondary}`}>
      {children}
    </span>
  );
}

/** One sale, big: its photo, what the title says, and a way to comp that card. */
export function SaleSheet({
  sale,
  onClose,
  onComp,
}: {
  sale: PlayerSale;
  onClose: () => void;
  onComp: (sale: PlayerSale) => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/50 motion-safe:animate-[backdrop-in_150ms_ease-out]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-player-sale-sheet=""
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-[var(--background)] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none ring-1 ring-zinc-950/10 sm:rounded-3xl sm:pb-4 dark:ring-white/10 motion-safe:animate-[sheet-up_220ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="flex items-center justify-between">
          <span aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-zinc-950/15 sm:hidden dark:bg-white/20" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-full ${textMuted} hover:text-zinc-950 dark:hover:text-zinc-50 ${feedback} ${focusRing}`}
          >
            <X aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="relative mx-auto mt-3 aspect-[5/7] h-[min(50dvh,24rem)] overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900 dark:ring-white/[0.08]">
          <SalePhoto sale={sale} size={1600} eager />
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <p className="font-mono text-2xl leading-8 font-semibold tabular-nums">{money(sale.price)}</p>
          <p className={`text-13 leading-5 tabular-nums ${textMuted}`}>Sold {soldDay(sale.soldAt)}</p>
        </div>
        <h2 id={titleId} className={`mt-1 text-sm leading-5 ${textSecondary}`}>
          {sale.title}
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="From the title">
          <Fact mono>{sale.grade}</Fact>
          {sale.year ? <Fact mono>{sale.year}</Fact> : null}
          {sale.set ? <Fact>{sale.set}</Fact> : null}
          {sale.number ? <Fact mono>#{sale.number}</Fact> : null}
          {sale.parallel ? <Fact>{sale.parallel}</Fact> : null}
          {sale.run ? <Fact mono>/{sale.run}</Fact> : null}
          {sale.auto ? <Fact>Auto</Fact> : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            onComp(sale);
          }}
          className={`mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-600 px-4 text-15 font-medium text-white hover:bg-violet-700 active:bg-violet-800 disabled:opacity-70 ${feedback} ${focusRing}`}
        >
          {COMP_THIS_CARD}
        </button>
        <p className={`mt-2 text-center text-xs leading-4 ${textMuted}`}>Fills in only what the title shows</p>
      </div>
    </div>
  );
}
