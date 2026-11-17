"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { HUB_COPY, quickCompScanHref, scannerEnabled } from "@/lib/scan/entry";
import type { SalesChart as SalesChartType } from "@/components/sales-chart";
import { preloadCompsList } from "@/components/card-page-parts";
import { CATALOG_SEARCH_TIMEOUT_MESSAGE } from "@/lib/catalog/catalog-search-session";
import { searchCatalogRemote } from "@/lib/catalog/search-remote";
import type { CatalogCard } from "@/lib/card-catalog";
import { money } from "@/lib/format";
import {
  createLookupGate,
  fetchQuickComp,
  identityFromCatalog,
  type QuickCompOutcome,
} from "@/lib/quick-comp/client";
import { DEFAULT_QUICK_GRADE, isPresetGrade, otherGrade, otherGradeParts, splitQueryGrade } from "@/lib/quick-comp/grades";
import { quickCompIdentityKey, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import {
  browserRecentStore,
  readRecentComps,
  rememberRecentComp,
  savedPayload,
  type RecentComp,
  type SavedPayload,
} from "@/lib/quick-comp/recent";
import type { QuickCompLimitReason } from "@/lib/quick-comp/limits";
import {
  QUICK_COMP_DAILY_MESSAGE,
  QUICK_COMP_HOURLY_MESSAGE,
  QUICK_COMP_SAFETY_MESSAGE,
  quickCompLimitMessage,
} from "@/lib/quick-comp/respond";
import { createSuggestionTyping, SUGGEST_MIN_CHARS, type SuggestionState } from "@/lib/quick-comp/typing";
import { manualYearError, readManualYear, splitManualQuery } from "@/lib/quick-comp/manual-year";
import {
  fetchPlayerFeed,
  fillFromSale,
  playerSuggestUrl,
  readPlayerSuggestions,
  wantsPlayerSuggestions,
  type FeedFilters,
  type PlayerFeedOutcome,
  type PlayerSale,
  type PlayerSuggestion,
} from "@/lib/quick-comp/player-feed";
import { catalogResultLine } from "@/lib/search/catalog-results";
import { useProductData } from "@/lib/cards/use-product-data";
import { isVersion, quickCompVersions, withVersion, type QuickVersion } from "@/lib/quick-comp/versions";
import { GradeControl } from "./grade-control";
import { VersionControl } from "./version-control";
import { QuickCompResult, identityLine } from "./quick-comp-result";
import { NoticeButton, QuickCompLoading, QuickCompNotice } from "./quick-comp-states";
import { CompsEmpty, RecentComps, ScanHero } from "./comp-home";
import { SlabholdRail } from "./slabhold-rail";
import { PlayerFeed, SaleSheet, type FeedState } from "./player-feed";
import { control, feedback, focusRing, textMuted, textSecondary } from "./tokens";

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
  | { status: "limited"; reason: QuickCompLimitReason; resetAt: string | null }
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
    if (state.reason === "safety") {
      return <QuickCompNotice state="daily-limit" title={QUICK_COMP_SAFETY_MESSAGE} caption={at ? `More from ${at}` : null} />;
    }
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
  if (state.status === "limited") return quickCompLimitMessage(state.reason);
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

export type ManualFields = { player: string; year: string; set: string; number: string };

export const MANUAL_SUBMIT = "Check sold prices";
export const MANUAL_BUSY = "Checking sold prices";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      data-manual-spinner=""
      className="size-4 shrink-0 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-[qc-busy-turn_700ms_linear_infinite]"
    />
  );
}

/**
 * Player and year, with set and number optional. The year reads however a phone
 * types it, its error shows under the field the moment it's wrong, and a tap
 * that sends shows a spinner and can't send twice.
 */
function ManualForm({
  initial,
  busy,
  note,
  onSubmit,
  onCancel,
}: {
  initial: Partial<ManualFields>;
  busy: boolean;
  /** "Gold Refractor /50, from the sale": the version Comp this card carries in. */
  note?: string | null;
  onSubmit: (fields: ManualFields) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [player, setPlayer] = useState(initial.player ?? "");
  const [year, setYear] = useState(initial.year ?? "");
  const [set, setSet] = useState(initial.set ?? "");
  const [number, setNumber] = useState(initial.number ?? "");
  const [touched, setTouched] = useState({ player: false, year: false });
  /** Blocks a second send between the tap and the parent's busy state. */
  const sent = useRef(false);
  const playerRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const playerError = player.trim() ? "" : "Add the player";
  const yearError = manualYearError(year);
  // An error shows once a field was left or a send was tried, and while a typed year can't be one.
  const showYearError = Boolean(yearError) && (touched.year || year.trim().length >= 4);
  const showPlayerError = Boolean(playerError) && touched.player;

  useEffect(() => {
    if (!busy) sent.current = false;
  }, [busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || sent.current) return;
    setTouched({ player: true, year: true });
    if (playerError) {
      playerRef.current?.focus();
      return;
    }
    if (yearError) {
      yearRef.current?.focus();
      return;
    }
    sent.current = true;
    onSubmit({ player, year, set, number });
  }

  const input = `${control} w-full px-3 text-base sm:text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500`;
  // Important, so it beats the control's own hairline color in both themes.
  const invalid = "ring-rose-600/70! dark:ring-rose-400/70!";
  const label = `mb-1.5 block text-13 leading-5 font-medium ${textSecondary}`;
  const error = "mt-1 text-xs leading-4 text-rose-700 dark:text-rose-300";
  return (
    <form data-quick-comp-state="manual" onSubmit={submit} noValidate aria-busy={busy || undefined} className="flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-zinc-950/10 dark:ring-white/10">
      <div className="flex h-5 items-center justify-between">
        <h2 className="text-15 leading-5 font-medium">Enter the card</h2>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div className="min-w-0">
          <label htmlFor={`${ids}-player`} className={label}>
            Player
          </label>
          <input
            ref={playerRef}
            id={`${ids}-player`}
            value={player}
            onChange={(event) => setPlayer(event.target.value)}
            onBlur={() => setTouched((now) => ({ ...now, player: true }))}
            maxLength={80}
            autoComplete="off"
            required
            aria-invalid={showPlayerError}
            aria-describedby={showPlayerError ? `${ids}-player-error` : undefined}
            className={`${input} ${showPlayerError ? invalid : ""}`}
          />
          {showPlayerError ? (
            <p id={`${ids}-player-error`} role="alert" className={error}>
              {playerError}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${ids}-year`} className={label}>
            Year
          </label>
          {/* Text, not the number pad: the iPhone pad has no dash for 2023-24. */}
          <input
            ref={yearRef}
            id={`${ids}-year`}
            value={year}
            onChange={(event) => setYear(event.target.value)}
            onBlur={() => setTouched((now) => ({ ...now, year: true }))}
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="YYYY"
            maxLength={12}
            required
            aria-invalid={showYearError}
            aria-describedby={showYearError ? `${ids}-year-error` : undefined}
            className={`${input} tabular-nums ${showYearError ? invalid : ""}`}
          />
          {showYearError ? (
            <p id={`${ids}-year-error`} role="alert" className={error}>
              {yearError}
            </p>
          ) : null}
        </div>
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
      {note ? <p className={`text-13 leading-5 ${textMuted}`}>{note}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          aria-disabled={busy || undefined}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 active:scale-[0.98] active:bg-violet-800 disabled:cursor-progress disabled:opacity-80 motion-safe:transition-[background-color,transform] motion-safe:duration-150 ${focusRing}`}
        >
          {busy ? <Spinner /> : null}
          {busy ? MANUAL_BUSY : MANUAL_SUBMIT}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium ring-1 ring-zinc-950/10 hover:bg-zinc-950/[0.03] active:bg-zinc-950/[0.06] dark:ring-white/10 dark:hover:bg-white/5 dark:active:bg-white/10 ${feedback} ${focusRing}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function versionNote(version: Pick<QuickCompIdentity, "parallel" | "serialRun"> | null): string | null {
  if (!version) return null;
  const parts = [version.parallel && version.parallel !== "Base" ? version.parallel : "", version.serialRun ? `/${version.serialRun}` : ""].filter(Boolean);
  return parts.length ? `${parts.join(" ")}, from the sale's title` : null;
}

export function QuickCompView({ userId }: { userId: string | null }) {
  const scanHref = quickCompScanHref(scannerEnabled());
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Set only by the arrows or the pointer, so a miss never preselects the manual option. */
  const [movedToManual, setMovedToManual] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionState>({ status: "idle" });
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [grade, setGrade] = useState(DEFAULT_QUICK_GRADE);
  const [otherOpen, setOtherOpen] = useState(false);
  /** A version tapped but not looked up yet: the row marks it at once, the lookup waits to settle. */
  const [version, setVersion] = useState<QuickVersion | null>(null);
  const [comp, setComp] = useState<CompState>({ status: "idle" });
  const [saleId, setSaleId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentComp[]>(() => readRecentComps(browserRecentStore(), userId));
  const [Chart, setChart] = useState<typeof SalesChartType | null>(null);
  const [chartAttempt, setChartAttempt] = useState(0);
  const token = useRef(0);
  const gradeTimer = useRef<number | null>(null);
  /** The manual form's starting values, and a key so a new start resets it. */
  const [manualStart, setManualStart] = useState<{ key: number; fields: Partial<ManualFields>; version: Pick<QuickCompIdentity, "parallel" | "serialRun"> | null }>({
    key: 0,
    fields: {},
    version: null,
  });
  /** A manual send is out: the button spins until the lookup lands, then the form closes. */
  const [manualBusy, setManualBusy] = useState(false);
  /** The lookup a manual send started: when it lands, the form closes. */
  const manualSend = useRef(0);
  const [players, setPlayers] = useState<{ query: string; items: PlayerSuggestion[] }>({ query: "", items: [] });
  const playerTimer = useRef<number | null>(null);
  const playerAbort = useRef<AbortController | null>(null);
  /** Player mode: whose sales, the chip a phrase turned on, and whether the feed is showing (not a card comped from it). */
  const [feedFor, setFeedFor] = useState<{ player: string; filter: Partial<FeedFilters>; key: number } | null>(null);
  const [feed, setFeed] = useState<PlayerFeedOutcome | { status: "loading" }>({ status: "loading" });
  const [feedShown, setFeedShown] = useState(false);
  const [sheetSale, setSheetSale] = useState<PlayerSale | null>(null);
  const feedToken = useRef(0);

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
  useEffect(
    () => () => {
      if (playerTimer.current !== null) window.clearTimeout(playerTimer.current);
      playerAbort.current?.abort();
    },
    [],
  );

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

  // The year's checklist parallels, loaded once a card is picked. The family list shows meanwhile.
  const { data: productData } = useProductData(picked != null);
  const pickedIdentity = picked?.identity ?? null;
  const pickedSport = picked?.catalog?.sport;
  const versions = useMemo(
    () =>
      pickedIdentity
        ? quickCompVersions(
            productData,
            { yearLabel: pickedIdentity.yearLabel, setBrand: pickedIdentity.setBrand, cardNumber: pickedIdentity.cardNumber, sport: pickedSport },
            pickedIdentity,
          )
        : [],
    [productData, pickedIdentity, pickedSport],
  );
  const versionAt = Math.max(
    0,
    versions.findIndex((item) => (version ? item.name === version.name : pickedIdentity != null && isVersion(pickedIdentity, item))),
  );

  const results = suggestions.status === "ready" ? suggestions.results : [];
  /** Player names first for a name with no digits; a card search ("2023 prizm") shows cards only. */
  const playerItems = wantsPlayerSuggestions(query) ? players.items : [];
  const playerCount = playerItems.length;
  const manualAt = playerCount + results.length;
  const showList = open && suggestions.status !== "idle" && query.trim().length > 0;
  const optionCount = manualAt + 1;

  /** Looks up a card. Returns the lookup's id: a new one, or the one already out for this card. */
  const run = useCallback(
    (next: Picked): number => {
      const key = quickCompIdentityKey(next.identity);
      // A double tap on the same card and grade while it loads does nothing more.
      if (gate.pending(next.identity) && picked && quickCompIdentityKey(picked.identity) === key) return token.current;
      const id = ++token.current;
      setVersion(null);
      setPicked(next);
      setSaleId(null);
      setComp({ status: "loading" });
      void gate.lookup(next.identity).then((outcome) => {
        if (id !== token.current) return;
        const state = outcomeToState(outcome);
        setComp(state);
        // The manual form spun until now; its card is showing, so it closes.
        if (manualSend.current === id) {
          manualSend.current = 0;
          setManualBusy(false);
          setManual(false);
        }
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
      return id;
    },
    [gate, picked, userId],
  );

  /** Player names for the typed text, 250ms after the last key. Reads names only: never a sold search. */
  function askPlayers(text: string) {
    if (playerTimer.current !== null) window.clearTimeout(playerTimer.current);
    playerTimer.current = null;
    playerAbort.current?.abort();
    playerAbort.current = null;
    const q = text.trim();
    if (!wantsPlayerSuggestions(q)) {
      setPlayers({ query: "", items: [] });
      return;
    }
    playerTimer.current = window.setTimeout(() => {
      playerTimer.current = null;
      const controller = new AbortController();
      playerAbort.current = controller;
      Promise.resolve()
        .then(() => fetch(playerSuggestUrl(q), { signal: controller.signal }))
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (!controller.signal.aborted) setPlayers({ query: q, items: readPlayerSuggestions(body) });
        })
        .catch(() => {
          if (!controller.signal.aborted) setPlayers({ query: q, items: [] });
        });
    }, 250);
  }

  function clearSearch() {
    typing.type("");
    askPlayers("");
    setQuery("");
    setOpen(false);
    setActive(0);
    setMovedToManual(false);
  }

  /** A grade typed in the search ("psa 9") wins over the chip, so it is the one looked up. */
  function gradeForPick() {
    return splitQueryGrade(query).grade ?? grade;
  }

  function selectGrade(chosen: string) {
    setGrade(chosen);
    setOtherOpen(!isPresetGrade(chosen));
  }

  function pick(card: CatalogCard, from: CatalogCard[]) {
    cancelGradeLookup();
    const chosen = gradeForPick();
    const identity = identityFromCatalog(card, chosen);
    if (!identity) return;
    selectGrade(chosen);
    clearSearch();
    setManual(false);
    setFeedShown(false);
    inputRef.current?.blur();
    run({ identity, catalog: card, alternatives: from.filter((row) => row.id !== card.id).slice(0, 3) });
  }

  function startManual(fields: Partial<ManualFields>, version: Pick<QuickCompIdentity, "parallel" | "serialRun"> | null = null) {
    setManualStart((now) => ({ key: now.key + 1, fields, version }));
    setManualBusy(false);
    setManual(true);
    setOpen(false);
  }

  /** The search text fills the form, a typed year in Year (not left in Player) and a grade left out. */
  function openManual() {
    startManual(splitManualQuery(splitQueryGrade(query).rest));
  }

  function loadFeed(player: string, filter: Partial<FeedFilters>) {
    const id = ++feedToken.current;
    setFeedFor({ player, filter, key: id });
    setFeedShown(true);
    setFeed({ status: "loading" });
    void fetchPlayerFeed(player, (url) => fetch(url, { cache: "no-store" })).then((outcome) => {
      if (id !== feedToken.current) return;
      setFeed(outcome);
      if (outcome.status === "ready") setFeedFor((now) => (now && now.key === id ? { ...now, player: outcome.body.player } : now));
    });
  }

  /** A player picked from the list: their sales, any card. A second tap while it loads does nothing more. */
  function openPlayer(item: PlayerSuggestion) {
    cancelGradeLookup();
    token.current += 1;
    clearSearch();
    setManual(false);
    setManualBusy(false);
    setPicked(null);
    setComp({ status: "idle" });
    setSheetSale(null);
    inputRef.current?.blur();
    if (feedFor && feedShown && feed.status === "loading" && feedFor.player === item.player) return;
    loadFeed(item.player, item.filter ?? {});
  }

  function backToFeed() {
    cancelGradeLookup();
    token.current += 1;
    setPicked(null);
    setComp({ status: "idle" });
    setManual(false);
    setFeedShown(true);
  }

  /** "Comp this card": the sale's printed facts into the normal Quick Comp. No year printed: the form asks. */
  function compSale(sale: PlayerSale) {
    if (!feedFor) return;
    const fill = fillFromSale(feedFor.player, sale);
    const version = { parallel: fill.parallel, serialRun: fill.serialRun };
    setSheetSale(null);
    if (fill.grade) selectGrade(fill.grade);
    const year = readManualYear(fill.year);
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // Not every test DOM scrolls.
    }
    if (!year) {
      startManual({ player: fill.player, year: "", set: fill.set, number: fill.number }, version);
      return;
    }
    cancelGradeLookup();
    setManual(false);
    setFeedShown(false);
    run({
      identity: {
        playerName: fill.player,
        year: year.year,
        yearLabel: year.yearLabel,
        setBrand: fill.set,
        cardNumber: fill.number,
        parallel: fill.parallel,
        ...(fill.serialRun ? { serialRun: fill.serialRun } : {}),
        grade: fill.grade ?? grade,
      },
      catalog: null,
      alternatives: [],
    });
  }

  /** One lookup for the grade and version still selected after the settle time. */
  function settle(nextGrade: string, nextVersion: QuickVersion | null) {
    cancelGradeLookup();
    if (!picked) return;
    const identity = { ...(nextVersion ? withVersion(picked.identity, nextVersion) : picked.identity), grade: nextGrade };
    if (quickCompIdentityKey(identity) === quickCompIdentityKey(picked.identity)) return;
    // Add to collection opens with the version comped, not the catalog row's.
    const catalog = picked.catalog ? { ...picked.catalog, parallel: identity.parallel } : null;
    const target = { ...picked, identity, catalog };
    gradeTimer.current = window.setTimeout(() => {
      gradeTimer.current = null;
      run(target);
    }, GRADE_SETTLE_MS);
  }

  function changeGrade(next: string) {
    setGrade(next);
    settle(next, version);
  }

  function changeVersion(next: QuickVersion) {
    setVersion(next);
    settle(grade, next);
  }

  function openRecent(item: RecentComp) {
    cancelGradeLookup();
    token.current += 1;
    setManual(false);
    setGrade(item.identity.grade);
    setOtherOpen(false);
    setVersion(null);
    setSaleId(null);
    setFeedShown(false);
    setPicked({ identity: item.identity, catalog: item.catalog, alternatives: [] });
    setComp({ status: "ready", payload: item.payload, savedAt: item.savedAt });
  }

  /** Enter searches: the top suggestion (or the one arrowed to) for the typed text. */
  function onEnter() {
    const text = query.trim();
    if (Array.from(text).length < SUGGEST_MIN_CHARS) return;
    if (showList && movedToManual) {
      openManual();
      return;
    }
    if (showList && active < playerCount && playerItems[active]) {
      openPlayer(playerItems[active]);
      return;
    }
    setOpen(true);
    const current = suggestions.status !== "idle" && suggestions.status !== "loading" && suggestions.query === text;
    if (current && suggestions.status === "ready") {
      const card = results[active - playerCount] ?? results[0];
      if (card) pick(card, results);
      return;
    }
    if (current && suggestions.status === "miss") {
      // No card in the catalog, but a player by that name: their sales.
      if (playerItems[0]) openPlayer(playerItems[0]);
      return;
    }
    if (current && suggestions.status === "trouble") {
      typing.type(query);
      return;
    }
    // Still loading, or the suggestions are for older text: look up the top one once they land.
    if (suggestions.status !== "loading") typing.type(query);
    typing.whenReady(text, (cards) => {
      if (cards[0]) pick(cards[0], cards);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onEnter();
      return;
    }
    if (!showList) {
      if (event.key === "ArrowDown" && query.trim()) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    // The manual option is hidden while suggestions load, so there is nothing to move to.
    if (suggestions.status === "loading") return;
    const from = movedToManual ? manualAt : active;
    const next = event.key === "ArrowDown" ? (from + 1) % optionCount : (from - 1 + optionCount) % optionCount;
    setActive(next);
    setMovedToManual(next === manualAt);
  }

  const closeSheet = useCallback(() => setSheetSale(null), []);
  const feedState: FeedState =
    feed.status === "loading"
      ? { status: "loading" }
      : feed.status === "ready"
        ? { status: "ready", sales: feed.body.sales }
        : {
            status: "notice",
            notice: (
              <CompStateNotice
                state={feed.status === "limited" ? { status: "limited", reason: feed.reason, resetAt: feed.resetAt } : feed}
                onRetry={() => feedFor && loadFeed(feedFor.player, feedFor.filter)}
              />
            ),
          };

  const manualShown = suggestions.status !== "loading";
  const activeId = !showList
    ? undefined
    : movedToManual
      ? manualShown
        ? `${listId}-manual`
        : undefined
      : active < playerCount
        ? `${listId}-p-${active}`
        : results[active - playerCount]
          ? `${listId}-${results[active - playerCount].id}`
          : undefined;
  const optionClass = (on: boolean) =>
    `flex min-h-14 w-full flex-col justify-center px-3 py-2 text-left ${feedback} ${on ? "bg-zinc-950/[0.04] dark:bg-white/[0.06]" : "hover:bg-zinc-950/[0.03] dark:hover:bg-white/[0.04]"}`;

  return (
    <div data-quick-comp="" className="flex flex-col gap-5 pt-1">
      <header>
        <h1 className="text-xl leading-7 font-semibold tracking-tight">Quick Comp</h1>
        <p className={`mt-1 text-sm leading-5 ${textSecondary}`}>Recent sold prices, without adding it to your collection</p>
      </header>

      {scanHref ? <ScanHero href={scanHref} title={HUB_COPY.compEntry} body={HUB_COPY.compEntryBody} /> : null}

      <div className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">
          {SEARCH_LABEL}
        </label>
        <div className={`${control} min-h-12 gap-2.5 rounded-2xl px-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] focus-within:ring-2 focus-within:ring-violet-600/60 dark:shadow-none ${feedback}`}>
          <Search aria-hidden="true" size={18} strokeWidth={1.5} className={`shrink-0 ${textMuted}`} />
          <input
            ref={inputRef}
            id={`${listId}-input`}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setOpen(true);
              setActive(0);
              setMovedToManual(false);
              typing.type(next);
              askPlayers(next);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              typing.cancelEnter();
              setTimeout(() => setOpen(false), 120);
            }}
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
            {suggestions.status === "miss" && playerCount === 0 ? (
              <li data-quick-comp-state="no-match" className={`px-3 pt-3 pb-1 text-sm ${textSecondary}`}>
                No match in the catalog
              </li>
            ) : null}
            {playerItems.map((item, index) => (
              <li key={`p-${item.label}`} id={`${listId}-p-${index}`} role="option" aria-selected={!movedToManual && index === active} data-player-option="">
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    setActive(index);
                    setMovedToManual(false);
                  }}
                  onClick={() => openPlayer(item)}
                  className={`${optionClass(!movedToManual && index === active)} !flex-row items-center !justify-start gap-3`}
                >
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-600/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
                    {item.filter ? <SlidersHorizontal size={15} strokeWidth={1.75} /> : <UserRound size={16} strokeWidth={1.75} />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm leading-5 font-medium">{item.label}</span>
                    <span className={`truncate text-xs leading-4 ${textMuted}`}>
                      {item.filter ? `${item.player}, recent sales` : "Recent sales, any card"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {suggestions.status === "loading" ? <SuggestionSkeleton /> : null}
            {results.map((card, index) => (
              <li key={card.id} id={`${listId}-${card.id}`} role="option" aria-selected={!movedToManual && index + playerCount === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    setActive(index + playerCount);
                    setMovedToManual(false);
                  }}
                  onClick={() => pick(card, results)}
                  className={optionClass(!movedToManual && index + playerCount === active)}
                >
                  <span className="truncate text-sm leading-5 font-medium">{card.playerName}</span>
                  <span className={`truncate text-xs leading-4 ${textMuted}`}>{catalogResultLine(card)}</span>
                </button>
              </li>
            ))}
            {manualShown ? (
              <li id={`${listId}-manual`} role="option" aria-selected={movedToManual}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    setActive(manualAt);
                    setMovedToManual(true);
                  }}
                  onClick={openManual}
                  className={`${optionClass(movedToManual)} min-h-11 text-sm font-medium text-violet-700 dark:text-violet-300`}
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
            className={`-ml-1 mt-1 inline-flex min-h-11 items-center rounded-[10px] px-1 text-13 font-medium ${textSecondary} hover:text-zinc-950 dark:hover:text-zinc-50 ${feedback} ${focusRing}`}
          >
            {MANUAL_LABEL}
          </button>
        ) : null}
      </div>

      {manual ? (
        <ManualForm
          key={manualStart.key}
          initial={manualStart.fields}
          busy={manualBusy}
          note={versionNote(manualStart.version)}
          onCancel={() => {
            setManual(false);
            setManualBusy(false);
          }}
          onSubmit={(fields) => {
            const year = readManualYear(fields.year);
            if (!year || manualBusy) return;
            // A grade change still waiting to settle must not replace this card.
            cancelGradeLookup();
            const chosen = gradeForPick();
            selectGrade(chosen);
            clearSearch();
            setFeedShown(false);
            // Comp this card's version, from the sale's title, rides along; typed by hand, it's Base.
            const version = manualStart.version;
            setManualBusy(true);
            manualSend.current = run({
              identity: {
                playerName: fields.player.trim(),
                year: year.year,
                yearLabel: year.yearLabel,
                setBrand: fields.set.trim(),
                cardNumber: fields.number.trim().replace(/^#/, ""),
                parallel: version?.parallel || "Base",
                ...(version?.serialRun ? { serialRun: version.serialRun } : {}),
                grade: chosen,
              },
              catalog: null,
              alternatives: [],
            });
          }}
        />
      ) : null}

      {feedFor && feedShown && !picked ? (
        <PlayerFeed key={feedFor.key} player={feedFor.player} state={feedState} initialFilters={feedFor.filter} onOpenSale={setSheetSale} />
      ) : null}

      {picked && feedFor && !feedShown ? (
        <button
          type="button"
          onClick={backToFeed}
          className={`-ml-1 -mb-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-[10px] px-1 text-13 font-medium ${textSecondary} hover:text-zinc-950 dark:hover:text-zinc-50 ${feedback} ${focusRing}`}
        >
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.5} />
          {feedFor.player} sales
        </button>
      ) : null}

      {picked ? (
        <section aria-labelledby="quick-comp-card" className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="quick-comp-card" className="truncate text-17 leading-6 font-semibold">
                {picked.identity.playerName}
              </h2>
              <p className={`truncate text-13 leading-5 ${textSecondary}`}>{identityLine(picked.identity)}</p>
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
          <VersionControl versions={versions} selected={versionAt} onChange={changeVersion} />
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
      ) : !manual && !(feedFor && feedShown) ? (
        <>
          {recent.length > 0 ? <RecentComps items={recent} onOpen={openRecent} /> : <CompsEmpty />}
          <SlabholdRail />
        </>
      ) : null}

      {sheetSale ? <SaleSheet sale={sheetSale} onClose={closeSheet} onComp={compSale} /> : null}
    </div>
  );
}
