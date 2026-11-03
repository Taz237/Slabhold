"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type { SalesChart as SalesChartType } from "@/components/sales-chart";
import { preloadCompsList } from "@/components/card-page-parts";
import { CATALOG_SEARCH_TIMEOUT_MESSAGE } from "@/lib/catalog/catalog-search-session";
import { searchCatalogRemote } from "@/lib/catalog/search-remote";
import type { CatalogCard } from "@/lib/card-catalog";
import { parseYearLabel } from "@/lib/card-options";
import { money } from "@/lib/format";
import {
  createLookupGate,
  fetchQuickComp,
  identityFromCatalog,
  type QuickCompOutcome,
} from "@/lib/quick-comp/client";
import { DEFAULT_QUICK_GRADE, otherGrade, otherGradeParts } from "@/lib/quick-comp/grades";
import { quickCompIdentityKey, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import {
  browserRecentStore,
  readRecentComps,
  rememberRecentComp,
  savedPayload,
  type RecentComp,
  type SavedPayload,
} from "@/lib/quick-comp/recent";
import { QUICK_COMP_DAILY_MESSAGE, QUICK_COMP_HOURLY_MESSAGE } from "@/lib/quick-comp/respond";
import { createSuggestionTyping, type SuggestionState } from "@/lib/quick-comp/typing";
import { catalogResultLine } from "@/lib/search/catalog-results";
import { GradeControl } from "./grade-control";
import { QuickCompResult, identityLine } from "./quick-comp-result";
import { NoticeButton, QuickCompLoading, QuickCompNotice } from "./quick-comp-states";
import { control, feedback, focusRing, sectionLabel, textMuted, textSecondary } from "./tokens";

export const SEARCH_LABEL = "Player, year, set or number";
export const MANUAL_LABEL = "Can't find it? Enter player and year";
export const ERROR_TITLE = "Sales are taking a break";
export const OFFLINE_TITLE = "You're offline";
/** Arrow keys select each grade they pass; only the grade still selected after this looks up. */
export const GRADE_SETTLE_MS = 400;

type Picked = {
  identity: QuickCompIdentity;
  catalog: CatalogCard | null;
  alternatives: CatalogCard[];
};

export type CompState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; payload: SavedPayload; savedAt: string | null }
  | { status: "limited"; reason: "daily" | "hourly"; resetAt: string | null }
  | { status: "error" }
  | { status: "offline" };

function resetTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Errors, limits and offline, in the comp card's own shape. */
export function CompStateNotice({ state, onRetry }: { state: CompState; onRetry: () => void }) {
  if (state.status === "limited") {
    const at = resetTime(state.resetAt);
    return state.reason === "daily" ? (
      <QuickCompNotice state="daily-limit" title={QUICK_COMP_DAILY_MESSAGE} caption={at ? `New comps from ${at}` : null} />
    ) : (
      <QuickCompNotice state="hourly-limit" title={QUICK_COMP_HOURLY_MESSAGE} />
    );
  }
  if (state.status === "offline") {
    return (
      <QuickCompNotice
        state="offline"
        title={OFFLINE_TITLE}
        caption="Saved comps still open"
        action={<NoticeButton onClick={onRetry}>Try again</NoticeButton>}
      />
    );
  }
  if (state.status === "error") {
    return (
      <QuickCompNotice
        state="error"
        title={ERROR_TITLE}
        caption="We couldn't load recent sold prices"
        action={<NoticeButton onClick={onRetry}>Try again</NoticeButton>}
      />
    );
  }
  return null;
}

function outcomeToState(outcome: QuickCompOutcome): CompState {
  if (outcome.status === "ready") return { status: "ready", payload: savedPayload(outcome.payload), savedAt: null };
  if (outcome.status === "limited") return { status: "limited", reason: outcome.reason, resetAt: outcome.resetAt };
  return outcome;
}

function announce(picked: Picked | null, state: CompState): string {
  if (!picked) return "";
  if (state.status === "loading") return "Loading recent sold prices";
  if (state.status === "ready") {
    if (state.payload.median == null || state.payload.comps.length === 0) return "No recent sold prices for this card and grade";
    const n = state.payload.comps.length;
    return `${picked.identity.playerName}, ${picked.identity.grade}: ${money(state.payload.median)} from ${n} sale${n === 1 ? "" : "s"}`;
  }
  if (state.status === "limited") return state.reason === "daily" ? QUICK_COMP_DAILY_MESSAGE : QUICK_COMP_HOURLY_MESSAGE;
  if (state.status === "error") return ERROR_TITLE;
  if (state.status === "offline") return OFFLINE_TITLE;
  return "";
}

function SuggestionSkeleton() {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <li key={row} aria-hidden="true" className="flex min-h-14 flex-col justify-center gap-1.5 px-3">
          <span className="skeleton-shimmer block h-3.5 w-36 rounded-md bg-zinc-100 dark:bg-white/5" />
          <span className="skeleton-shimmer block h-3 w-52 rounded-md bg-zinc-100 dark:bg-white/5" />
        </li>
      ))}
    </>
  );
}

function ManualForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (fields: { player: string; year: string; set: string; number: string }) => void;
  onCancel: () => void;
}) {
  const [player, setPlayer] = useState(initial);
  const [year, setYear] = useState("");
  const [set, setSet] = useState("");
  const [number, setNumber] = useState("");
  const [tried, setTried] = useState(false);
  const yearOk = parseYearLabel(year) != null;
  const playerOk = player.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!playerOk || !yearOk) return;
    onSubmit({ player, year, set, number });
  }

  const input = `${control} w-full px-3 text-base sm:text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500`;
  const label = `mb-1.5 block text-[13px] leading-5 font-medium ${textSecondary}`;
  return (
    <form data-quick-comp-state="manual" onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-zinc-950/10 dark:ring-white/10">
      <div className="flex h-5 items-center justify-between">
        <h2 className="text-[15px] leading-5 font-medium">Enter the card</h2>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="block min-w-0">
          <span className={label}>Player</span>
          <input
            value={player}
            onChange={(event) => setPlayer(event.target.value)}
            maxLength={80}
            autoComplete="off"
            required
            aria-invalid={tried && !playerOk}
            className={input}
          />
        </label>
        <label className="block">
          <span className={label}>Year</span>
          <input
            value={year}
            onChange={(event) => setYear(event.target.value)}
            inputMode="numeric"
            placeholder="2023"
            maxLength={9}
            required
            aria-invalid={tried && !yearOk}
            className={`${input} tabular-nums`}
          />
        </label>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="block min-w-0">
          <span className={label}>
            Set <span className={`font-normal ${textMuted}`}>optional</span>
          </span>
          <input value={set} onChange={(event) => setSet(event.target.value)} maxLength={80} placeholder="Prizm" className={input} />
        </label>
        <label className="block">
          <span className={label}>
            Number <span className={`font-normal ${textMuted}`}>optional</span>
          </span>
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            maxLength={20}
            placeholder="136"
            className={`${input} tabular-nums`}
          />
        </label>
      </div>
      {tried && (!playerOk || !yearOk) ? (
        <p role="alert" className="text-[13px] leading-5 text-rose-700 dark:text-rose-300">
          {!playerOk ? "Add the player" : "Add a year like 2023 or 2023-24"}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 ${feedback} ${focusRing}`}
        >
          Check sold prices
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium ring-1 ring-zinc-950/10 hover:bg-zinc-950/[0.03] dark:ring-white/10 dark:hover:bg-white/5 ${feedback} ${focusRing}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function RecentList({ items, onOpen }: { items: RecentComp[]; onOpen: (item: RecentComp) => void }) {
  return (
    <section data-quick-comp-state="recent" aria-labelledby="quick-comp-recent">
      <h2 id="quick-comp-recent" className={sectionLabel}>
        Recent on this device
      </h2>
      <ul className="mt-2 divide-y divide-zinc-950/5 rounded-2xl bg-white ring-1 ring-zinc-950/5 dark:divide-white/[0.06] dark:bg-zinc-900/60 dark:ring-white/[0.06]">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className={`flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-zinc-950/[0.02] dark:hover:bg-white/[0.03] ${feedback} ${focusRing}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-5 font-medium">{item.identity.playerName}</span>
                <span className={`block truncate text-xs leading-4 ${textMuted}`}>{identityLine(item.identity)}</span>
              </span>
              <span className="shrink-0 text-sm leading-5 font-medium tabular-nums">
                {item.payload.median != null && item.payload.comps.length > 0 ? money(item.payload.median) : <span className={textMuted}>No sales</span>}
              </span>
              <ChevronRight aria-hidden="true" size={16} strokeWidth={1.5} className={`shrink-0 ${textMuted}`} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QuickCompView({ userId }: { userId: string | null }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionState>({ status: "idle" });
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [grade, setGrade] = useState(DEFAULT_QUICK_GRADE);
  const [otherOpen, setOtherOpen] = useState(false);
  const [comp, setComp] = useState<CompState>({ status: "idle" });
  const [saleId, setSaleId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentComp[]>(() => readRecentComps(browserRecentStore(), userId));
  const [Chart, setChart] = useState<typeof SalesChartType | null>(null);
  const [chartAttempt, setChartAttempt] = useState(0);
  const token = useRef(0);
  const gradeTimer = useRef<number | null>(null);

  function cancelGradeLookup() {
    if (gradeTimer.current !== null) window.clearTimeout(gradeTimer.current);
    gradeTimer.current = null;
  }
  useEffect(() => cancelGradeLookup, []);

  const gate = useMemo(() => createLookupGate((identity) => fetchQuickComp(identity, (url) => fetch(url, { cache: "no-store" }))), []);
  const typing = useMemo(
    () => createSuggestionTyping({ search: searchCatalogRemote, onChange: setSuggestions }),
    [],
  );
  useEffect(() => () => typing.dispose(), [typing]);

  // The #157 comp card and the sales list each load from their own chunk.
  useEffect(preloadCompsList, []);
  useEffect(() => {
    let cancelled = false;
    void import("@/components/sales-chart")
      .then((mod) => {
        if (!cancelled) setChart(() => mod.SalesChart);
      })
      .catch(() => {
        if (!cancelled) setTimeout(() => setChartAttempt((n) => (n < 2 ? n + 1 : n)), 1500);
      });
    return () => {
      cancelled = true;
    };
  }, [chartAttempt]);

  const results = suggestions.status === "ready" ? suggestions.results : [];
  const showList = open && suggestions.status !== "idle" && query.trim().length > 0;
  const optionCount = results.length + 1;

  const run = useCallback(
    (next: Picked) => {
      const key = quickCompIdentityKey(next.identity);
      // A double tap on the same card and grade while it loads does nothing more.
      if (gate.pending(next.identity) && picked && quickCompIdentityKey(picked.identity) === key) return;
      const id = ++token.current;
      setPicked(next);
      setSaleId(null);
      setComp({ status: "loading" });
      void gate.lookup(next.identity).then((outcome) => {
        if (id !== token.current) return;
        const state = outcomeToState(outcome);
        setComp(state);
        if (state.status === "ready") {
          setRecent(
            rememberRecentComp(browserRecentStore(), userId, {
              key,
              identity: next.identity,
              catalog: next.catalog,
              payload: state.payload,
              savedAt: new Date().toISOString(),
            }),
          );
        }
      });
    },
    [gate, picked, userId],
  );

  function clearSearch() {
    typing.type("");
    setQuery("");
    setOpen(false);
    setActive(0);
  }

  function pick(card: CatalogCard, from: CatalogCard[]) {
    cancelGradeLookup();
    const identity = identityFromCatalog(card, grade);
    if (!identity) return;
    clearSearch();
    setManual(false);
    inputRef.current?.blur();
    run({ identity, catalog: card, alternatives: from.filter((row) => row.id !== card.id).slice(0, 3) });
  }

  function openManual() {
    setManual(true);
    setOpen(false);
  }

  function changeGrade(next: string) {
    setGrade(next);
    cancelGradeLookup();
    if (!picked || picked.identity.grade === next) return;
    const target = { ...picked, identity: { ...picked.identity, grade: next } };
    gradeTimer.current = window.setTimeout(() => {
      gradeTimer.current = null;
      run(target);
    }, GRADE_SETTLE_MS);
  }

  function openRecent(item: RecentComp) {
    cancelGradeLookup();
    token.current += 1;
    setManual(false);
    setGrade(item.identity.grade);
    setOtherOpen(false);
    setSaleId(null);
    setPicked({ identity: item.identity, catalog: item.catalog, alternatives: [] });
    setComp({ status: "ready", payload: item.payload, savedAt: item.savedAt });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
      return;
    }
    if (!showList) {
      if (event.key === "ArrowDown" && query.trim()) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + optionCount) % optionCount);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const card = results[active];
      if (card) pick(card, results);
      else openManual();
    }
  }

  const activeId = showList ? (results[active] ? `${listId}-${results[active].id}` : `${listId}-manual`) : undefined;
  const optionClass = (on: boolean) =>
    `flex min-h-14 w-full flex-col justify-center px-3 py-2 text-left ${feedback} ${on ? "bg-zinc-950/[0.04] dark:bg-white/[0.06]" : "hover:bg-zinc-950/[0.03] dark:hover:bg-white/[0.04]"}`;

  return (
    <div data-quick-comp="" className="flex flex-col gap-5 pt-1">
      <header>
        <h1 className="text-xl leading-7 font-semibold tracking-tight">Comp a card</h1>
        <p className={`mt-1 text-sm leading-5 ${textSecondary}`}>Recent sold prices, without adding it to your collection</p>
      </header>

      <div className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">
          {SEARCH_LABEL}
        </label>
        <div className={`${control} gap-2 px-3 focus-within:ring-violet-600/60`}>
          <Search aria-hidden="true" size={16} strokeWidth={1.5} className={`shrink-0 ${textMuted}`} />
          <input
            ref={inputRef}
            id={`${listId}-input`}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setOpen(true);
              setActive(0);
              typing.type(next);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={showList}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            placeholder={SEARCH_LABEL}
            enterKeyHint="search"
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-zinc-500 sm:text-sm dark:placeholder:text-zinc-400"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSearch}
              className={`-mr-2 grid size-11 shrink-0 place-items-center rounded-[10px] ${textMuted} hover:text-zinc-900 dark:hover:text-zinc-100 ${feedback} ${focusRing}`}
            >
              <X aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>

        {showList ? (
          <ul
            id={`${listId}-list`}
            role="listbox"
            aria-label="Cards"
            aria-busy={suggestions.status === "loading" || undefined}
            className="absolute inset-x-0 top-full z-20 mt-2 max-h-[22rem] overflow-y-auto rounded-xl bg-[var(--background)] py-1 shadow-[0_8px_24px_rgb(0_0_0/0.08)] ring-1 ring-zinc-950/10 dark:shadow-none dark:ring-white/10"
          >
            {suggestions.status === "loading" ? <SuggestionSkeleton /> : null}
            {suggestions.status === "trouble" ? (
              <li className={`px-3 py-3 text-sm ${textSecondary}`}>
                {CATALOG_SEARCH_TIMEOUT_MESSAGE}
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => typing.type(query)}
                  className={`ml-2 min-h-11 font-medium text-violet-700 dark:text-violet-300 ${focusRing}`}
                >
                  Try again
                </button>
              </li>
            ) : null}
            {suggestions.status === "miss" ? (
              <li data-quick-comp-state="no-match" className={`px-3 pt-3 pb-1 text-sm ${textSecondary}`}>
                No match in the catalog
              </li>
            ) : null}
            {results.map((card, index) => (
              <li key={card.id} id={`${listId}-${card.id}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(card, results)}
                  className={optionClass(index === active)}
                >
                  <span className="truncate text-sm leading-5 font-medium">{card.playerName}</span>
                  <span className={`truncate text-xs leading-4 ${textMuted}`}>{catalogResultLine(card)}</span>
                </button>
              </li>
            ))}
            {suggestions.status !== "loading" ? (
              <li id={`${listId}-manual`} role="option" aria-selected={active >= results.length}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(results.length)}
                  onClick={openManual}
                  className={`${optionClass(active >= results.length)} min-h-11 text-sm font-medium text-violet-700 dark:text-violet-300`}
                >
                  {MANUAL_LABEL}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}

        {!manual && !showList ? (
          <button
            type="button"
            onClick={openManual}
            className={`-ml-1 mt-1 inline-flex min-h-11 items-center rounded-[10px] px-1 text-[13px] font-medium ${textSecondary} hover:text-zinc-950 dark:hover:text-zinc-50 ${feedback} ${focusRing}`}
          >
            {MANUAL_LABEL}
          </button>
        ) : null}
      </div>

      {manual ? (
        <ManualForm
          initial={query.trim()}
          onCancel={() => setManual(false)}
          onSubmit={(fields) => {
            const year = parseYearLabel(fields.year);
            if (!year) return;
            // A grade change still waiting to settle must not replace this card.
            cancelGradeLookup();
            setManual(false);
            clearSearch();
            run({
              identity: {
                playerName: fields.player.trim(),
                year: year.year,
                yearLabel: year.yearLabel,
                setBrand: fields.set.trim(),
                cardNumber: fields.number.trim().replace(/^#/, ""),
                parallel: "Base",
                grade,
              },
              catalog: null,
              alternatives: [],
            });
          }}
        />
      ) : null}

      {picked ? (
        <section aria-labelledby="quick-comp-card" className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="quick-comp-card" className="truncate text-[17px] leading-6 font-semibold">
                {picked.identity.playerName}
              </h2>
              <p className={`truncate text-[13px] leading-5 ${textSecondary}`}>{identityLine(picked.identity)}</p>
            </div>
          </div>
          <GradeControl
            grade={grade}
            otherOpen={otherOpen}
            onOpenOther={() => {
              setOtherOpen(true);
              const parts = otherGradeParts(grade);
              const next = otherGrade(parts.company, parts.number);
              if (next !== grade) changeGrade(next);
            }}
            onChange={(next, from) => {
              if (from === "preset") setOtherOpen(false);
              changeGrade(next);
            }}
          />
        </section>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announce(picked, comp)}
      </p>

      {picked ? (
        <div>
          {comp.status === "loading" ? (
            <QuickCompLoading />
          ) : comp.status === "ready" ? (
            <QuickCompResult
              identity={picked.identity}
              catalog={picked.catalog}
              payload={comp.payload}
              Chart={Chart}
              savedAt={comp.savedAt}
              onRefresh={() => run({ ...picked, alternatives: picked.alternatives })}
              alternatives={picked.alternatives}
              onAlternative={(card) => pick(card, [picked.catalog, ...picked.alternatives].filter((row): row is CatalogCard => row != null))}
              selectedSaleId={saleId}
              onSelectSale={setSaleId}
            />
          ) : (
            <CompStateNotice state={comp} onRetry={() => run(picked)} />
          )}
        </div>
      ) : !manual ? (
        recent.length > 0 ? (
          <RecentList items={recent} onOpen={openRecent} />
        ) : (
          <p data-quick-comp-state="idle" className={`text-sm leading-5 ${textMuted}`}>
            Search a player to see what the card sells for
          </p>
        )
      ) : null}
    </div>
  );
}
