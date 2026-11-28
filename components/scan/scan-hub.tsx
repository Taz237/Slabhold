"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Camera, CameraOff, ImagePlus, ScanLine } from "lucide-react";
import { PrimaryButton, QuietButton, focusRing } from "@/components/add-card/flow-ui";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import type { CompLookup } from "@/components/scan/comp-sheet";
import { ConfirmSheet, type ConfirmSheetState } from "@/components/scan/confirm-sheet";
import { HitRevealsSetting, HitStreakBadge } from "@/components/scan/hit-reveal";
import { AddedPop } from "@/components/scan/added-pop";
import { CollectionContext } from "@/components/collection-provider";
import { haptic } from "@/lib/ios/haptics";
import { cardInputFromScan } from "@/lib/scan/quick-add";
import { nextAccent } from "@/lib/storage";
import { saveScan, saveScanMatch, saveScanMiss } from "@/lib/capture";
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import { CAMERA_DENIED, type ScanOutcome } from "@/lib/ios/scanner";
import { PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
import { needsBackStep, withBack, type ScanSource } from "@/lib/scan/back-step";
import { closestCards, closestMatch, onlyPlayerRead, readKeyOf, withPickedCard, type ClosestCard } from "@/lib/scan/closest";
import { CAMERA_OFF_COPY } from "@/lib/scan/camera-off";
import { compQueryString, type ScanCompResult } from "@/lib/scan/comp";
import { newScanId, scanAddPath, scanHandoffFrom } from "@/lib/scan/handoff";
import { HUB_ERRORS } from "@/lib/scan/hub-errors";
import type { LiveSoldsResult } from "@/lib/scan/live-solds";
import type { ScanMatch, ScanMatchResult, SoldTitle } from "@/lib/scan/match";
import { downgradesPin, keepPinned, pinOf } from "@/lib/scan/pin";
import type { PhotoLook } from "@/lib/scan/photo-look";
import { versionRereadSheet } from "@/lib/scan/version-reread";
import type { RevealRead } from "@/lib/scan/reveal";
import { HUB_COPY, scanReadFrom, sheetStateFrom, withVersionLine, type ScanCapture } from "@/lib/scan/session";

export type ScanHubDeps = {
  /** Async so no plugin code ships in /scan's first load. */
  scannerAvailable: () => Promise<boolean>;
  /** The native camera. Null when cancelled, "denied" when camera access is off. */
  scan: () => Promise<ScanOutcome>;
  /** This app build can open Slabhold's page in Settings (build 5 and up). */
  canOpenSettings: () => Promise<boolean>;
  openSettings: () => Promise<unknown>;
  /** A library photo, read the same way. */
  pickAndRead: () => Promise<ScanCapture | null>;
  /** The photo's look (border color, rainbow sheen), read on the phone. Null when unclear. Only orders "Which version?". */
  look: (image: string) => Promise<PhotoLook | null>;
  /** What the phone's own read gives before the card is matched: the reveal shows each field as it is known. Null: nothing yet. */
  peek: (capture: ScanCapture) => Promise<RevealRead | null>;
  /** Fills open fields from the phone's alternate readings, before anything reads the capture. */
  settle: (capture: ScanCapture) => Promise<ScanCapture>;
  /** Read and match against the catalog. Null when the search failed. */
  identify: (capture: ScanCapture, signal: AbortSignal) => Promise<ScanMatchResult | null>;
  /**
   * The card's last eBay solds: one live search per scan (capped), or sales we
   * already have, and the matches re-ranked with those sold titles. Null on failure.
   */
  solds: (capture: ScanCapture, matches: ScanMatch[], signal: AbortSignal) => Promise<LiveSoldsResult | null>;
  compLookup: CompLookup;
  /**
   * Only the player was read: their real cards to pick from (our checklists, and what other
   * collectors picked for the same read). Null when no player was read or we know no card of theirs.
   */
  closest: (capture: ScanCapture, signal: AbortSignal) => Promise<ScanClosest | null>;
  /** Logs a scan that didn't end on the card (what we read, what we searched, why). Never awaited, never shown. */
  logMiss: (miss: ScanMissReport) => void;
  /** The collector added the card they picked from the choices: saved so the next scan that reads the same finds it. */
  confirm: (readKey: string, card: ClosestCard) => void;
  online: () => boolean;
  /** Inside the iPhone app. There, a scanner that didn't load is an error, not "coming soon". */
  nativeApp: () => boolean;
};

/** "Picked by other collectors" shows once this many collectors picked the card: one pick is one person's word. */
export const PICKED_NOTE_MIN = 2;

export type ScanClosest = { player: string; readKey: string; cards: ClosestCard[] };
export type ScanMissReport = { capture: ScanCapture; result: ScanMatchResult | null; closest: number; leftForSearch?: boolean };

async function defaultClosest(capture: ScanCapture, signal: AbortSignal): Promise<ScanClosest | null> {
  const [{ SCAN_DIRECTORY }, { scanPlayer }, { loadPlayerCards, fetchConfirmedCards }] = await Promise.all([
    import("@/lib/players/scan-directory"),
    import("@/lib/scan/match"),
    import("@/lib/scan/closest-load"),
  ]);
  const player = scanPlayer(scanReadFrom(capture, SCAN_DIRECTORY), SCAN_DIRECTORY);
  if (!player) return null;
  const readKey = readKeyOf({ playerName: player.name, sport: player.sport });
  const [index, confirmed] = await Promise.all([loadPlayerCards(player.sport), fetchConfirmedCards(readKey, signal)]);
  const cards = closestCards(player, index, confirmed);
  return cards.length > 0 ? { player: player.name, readKey, cards } : null;
}

/** POST /api/scan/miss. The read text and what was searched: no photo, and a failure is silent. */
function defaultLogMiss(report: ScanMissReport): void {
  void (async () => {
    const [{ SCAN_DIRECTORY }, { catalogQueriesFor, scanChecklistKey, scanPlayer }, { checklistFilesFor }, { scanMissOf }] = await Promise.all([
      import("@/lib/players/scan-directory"),
      import("@/lib/scan/match"),
      import("@/lib/cards/checklist-load"),
      import("@/lib/scan/miss"),
    ]);
    const read = scanReadFrom(report.capture, SCAN_DIRECTORY);
    const checklist = scanChecklistKey(read, SCAN_DIRECTORY);
    const miss = scanMissOf({
      capture: report.capture,
      result: report.result,
      player: scanPlayer(read, SCAN_DIRECTORY) ?? { name: "", sport: "" },
      searched: { catalog: catalogQueriesFor(read, SCAN_DIRECTORY), checklist, checklistFiles: checklist ? checklistFilesFor(checklist).length : 0 },
      closest: report.closest,
      leftForSearch: report.leftForSearch,
    });
    if (!miss) return;
    await fetch("/api/scan/miss", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", keepalive: true, body: JSON.stringify(miss) });
  })().catch(() => {});
}

/** POST /api/scan/confirmed. Text only; a failure is silent. */
function defaultConfirm(readKey: string, card: ClosestCard): void {
  void fetch("/api/scan/confirmed", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", keepalive: true, body: JSON.stringify({ key: readKey, card }) }).catch(() => {});
}

/** The phone's alternate readings fill open fields (lib/scan/alternates.ts); the result is plain lines. */
async function defaultSettle(capture: ScanCapture): Promise<ScanCapture> {
  if (!capture.alternates?.length && !capture.backAlternates?.length) return capture;
  const [{ SCAN_DIRECTORY }, { withAlternates }] = await Promise.all([import("@/lib/players/scan-directory"), import("@/lib/scan/alternates")]);
  return withAlternates(capture, SCAN_DIRECTORY);
}

/** The player, set, card # and serial as the phone read them. Nothing is looked up. */
async function defaultPeek(capture: ScanCapture): Promise<RevealRead | null> {
  const [{ SCAN_DIRECTORY }, { scanPlayerName }, { revealReadFromScan }] = await Promise.all([
    import("@/lib/players/scan-directory"),
    import("@/lib/scan/match"),
    import("@/lib/scan/reveal"),
  ]);
  const read = scanReadFrom(capture, SCAN_DIRECTORY);
  return revealReadFromScan(read, scanPlayerName(read, SCAN_DIRECTORY));
}

async function defaultIdentify(capture: ScanCapture, signal: AbortSignal): Promise<ScanMatchResult | null> {
  const [{ SCAN_DIRECTORY }, { searchCatalogRemote }, { loadProductData }, { matchScan }, { loadChecklistsFor }] = await Promise.all([
    import("@/lib/players/scan-directory"),
    import("@/lib/catalog/search-remote"),
    import("@/lib/cards/product-data"),
    import("@/lib/scan/match"),
    import("@/lib/cards/checklist-load"),
  ]);
  const read = scanReadFrom(capture, SCAN_DIRECTORY);
  return matchScan(read, {
    soldTitles: defaultSoldTitles,
    directory: SCAN_DIRECTORY,
    search: searchCatalogRemote,
    products: loadProductData,
    checklists: loadChecklistsFor,
    signal,
  });
}

/** Cached eBay sold titles for a player: GET /api/scan/sold-titles. A cache read, never Trawl. */
async function defaultSoldTitles(playerName: string, signal: AbortSignal): Promise<SoldTitle[] | null> {
  const response = await fetch(`/api/scan/sold-titles?${new URLSearchParams({ player: playerName })}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return null;
  const { soldTitlesFromBody } = await import("@/lib/scan/sold-titles");
  return soldTitlesFromBody(await response.json());
}

/** POST /api/scan/solds. The read text and the ranked rows only: the photo never leaves the phone here. */
async function defaultSolds(capture: ScanCapture, matches: ScanMatch[], signal: AbortSignal): Promise<LiveSoldsResult | null> {
  const response = await fetch("/api/scan/solds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      lines: capture.lines,
      backLines: capture.backLines,
      kind: capture.kind,
      border: capture.border ?? null,
      // Names only (a border color, a sheen): the photo itself never leaves the phone here.
      look: capture.look ?? null,
      // The card this read pinned (an insert and its #): the server's re-read never drops it.
      pin: pinOf(matches[0]),
      rows: matches.filter((match) => match.catalogId).map((match) => ({
        catalogId: match.catalogId,
        playerName: match.playerName,
        sport: match.sport,
        yearLabel: match.yearLabel,
        setBrand: match.setBrand,
        cardNumber: match.cardNumber,
        parallel: match.parallel,
        isRookie: match.isRookie,
      })),
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as LiveSoldsResult;
  if (!body || !Array.isArray(body.matches) || !body.comp || typeof body.comp !== "object") return null;
  return body;
}

async function defaultCompLookup(...[identity, options]: Parameters<CompLookup>): Promise<ScanCompResult> {
  const response = await fetch(`/api/scan/comp?${compQueryString(identity, options?.serialRun, options?.query)}`, {
    cache: "no-store",
  });
  if (!response.ok) return { status: "unavailable" };
  const body = (await response.json()) as ScanCompResult;
  return body && typeof body === "object" && "status" in body ? body : { status: "unavailable" };
}

async function defaultPickAndRead(): Promise<ScanCapture | null> {
  const native = await loadNative();
  const file = await native.pickPhoto("library");
  if (!file) return null;
  return native.recognizeCardPhoto(await readPhotoFile(file, 1280));
}

const defaultDeps: ScanHubDeps = {
  scannerAvailable: async () => isNativeApp() && (await loadNative()).scannerAvailable(),
  scan: async () => (await loadNative()).scanCard(),
  canOpenSettings: async () => isNativeApp() && (await loadNative()).appSettingsAvailable(),
  openSettings: async () => (await loadNative()).openAppSettings(),
  pickAndRead: defaultPickAndRead,
  look: async (image) => (await import("@/lib/scan/photo-look-browser")).readPhotoLook(image),
  peek: defaultPeek,
  settle: defaultSettle,
  identify: defaultIdentify,
  solds: defaultSolds,
  compLookup: defaultCompLookup,
  closest: defaultClosest,
  logMiss: defaultLogMiss,
  confirm: defaultConfirm,
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  nativeApp: isNativeApp,
};

/** The pop shows this long before the collection opens. */
const ADDED_PAUSE_MS = 700;
const ADDED_PAUSE_REDUCED_MS = 250;

/**
 * /scan, the one Scan flow. With the native scanner it opens the camera straight away: the front,
 * then the back, then the reveal, then the card with what it sold for and Add to my collection. A
 * collector who only wanted the price backs out. Without the scanner (the web, or an older app
 * build) it says so and falls back to a photo and a search, so no button is a dead end.
 */
export function ScanHub({
  start = "camera",
  search = null,
  deps: overrides,
}: {
  /** "library": the Add card sheet's Upload photo. Opens the photo library instead of the camera. */
  start?: "camera" | "library";
  /** Quick Comp's search, under the Scan button: find a card's sold prices by player. */
  search?: ReactNode;
  deps?: Partial<ScanHubDeps>;
}) {
  const deps = useMemo(() => ({ ...defaultDeps, ...overrides }), [overrides]);
  const router = useRouter();
  // Null while checking: the app asks its native module; the web knows at once.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<ConfirmSheetState | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  // The back's photo, when the camera took the back too: the reveal card turns to it.
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The pop after a one-tap add, while the collection opens.
  const [added, setAdded] = useState(false);
  // Null outside the app's collection (tests, previews): Add then goes through Add card.
  const collection = useContext(CollectionContext);
  // Camera access is off for Slabhold. `settings`: this build can open the Settings app.
  const [cameraOff, setCameraOff] = useState<{ settings: boolean } | null>(null);
  const run = useRef<AbortController | null>(null);
  // The scan on the sheet, as settled, so "Is this Sapphire?" can read it again.
  const lastCapture = useRef<ScanCapture | null>(null);
  // "Flip it over": the front as scanned (before settling) and its read, while the sheet asks for the back.
  const waitingBack = useRef<{ front: ScanCapture; capture: ScanCapture; result: ScanMatchResult } | null>(null);
  // The choices on the sheet when only the player was read, and the one the collector picked from them.
  const closest = useRef<ScanClosest | null>(null);
  const pickedClosest = useRef<{ readKey: string; card: ClosestCard } | null>(null);
  // The card on the sheet, for the miss log when the collector leaves it for a search.
  const shown = useRef<{ capture: ScanCapture; result: ScanMatchResult } | null>(null);
  const opened = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  /** The card is read: it shows first, then its last solds fill in. */
  const finish = useCallback(
    async (capture: ScanCapture, result: ScanMatchResult, controller: AbortController) => {
      const first = sheetStateFrom(result, true);
      // The card shows first; its last solds fill in. With no match yet, the
      // sold titles may still find it (a logo-only set), so keep looking.
      // Only the player read is not a card yet: nothing shows until its sold titles or the pick list name one.
      if (first.kind === "ready" && !onlyPlayerRead(first.matches)) setSheet({ ...first, solds: { status: "looking" } });
      const solds = await deps.solds(capture, result.matches, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      // Later steps only add to a pinned card (an insert and its #), never replace or drop it. An
      // answer that did is about another card: its price is set aside and the version asked.
      const pin = pinOf(result.matches[0]);
      const dropped = Boolean(solds && solds.matches.length > 0 && downgradesPin(pin, solds.matches));
      const matches = solds && solds.matches.length > 0 ? keepPinned(pin, solds.matches, result.matches[0] ?? null) : result.matches;
      // No card, or only the player read (no year, set or card #): never a dead end, never a bare name.
      if (matches.length === 0 || onlyPlayerRead(matches)) {
        shown.current = null;
        if (result.unpinned) {
          deps.logMiss({ capture, result, closest: 0 });
          setSheet({ kind: "none", offline: false, unpinned: true });
          return;
        }
        // Never a dead end: with a player read, their real cards are offered to pick from.
        const found = await deps.closest(capture, controller.signal).catch(() => null);
        if (controller.signal.aborted) return;
        closest.current = found;
        deps.logMiss({ capture, result: { ...result, matches: [] }, closest: found?.cards.length ?? 0 });
        setSheet({
          kind: "none",
          offline: false,
          ...(found ? { closest: { player: found.player, cards: found.cards.map(closestMatch), confirmed: found.cards.map((card) => (card.confirmed ?? 0) >= PICKED_NOTE_MIN) } } : {}),
        });
        return;
      }
      shown.current = { capture, result: { ...result, matches } };
      // A card the collector picked themselves is theirs to name: only the scan's own read is logged.
      if (!capture.pickedLines?.length) deps.logMiss({ capture, result: { ...result, matches }, closest: 0 });
      setSheet({
        kind: "ready",
        matches,
        solds: dropped
          ? { status: "done", comp: { status: "version" }, query: null }
          : solds
            ? { status: "done", comp: solds.comp, query: solds.query, ...(solds.queries?.length ? { queries: solds.queries } : {}), ...(solds.similar ? { similar: solds.similar } : {}) }
            : { status: "done", comp: { status: "unavailable" }, query: null },
      });
    },
    [deps],
  );

  /**
   * Read and match a scan. `source`: where a front came from, so a raw card whose front can't pin
   * its year, set or card # asks for the back once ("Flip it over"). Null: never ask (a re-read,
   * or the front and back already together).
   */
  const identify = useCallback(
    async (scanned: ScanCapture, source: ScanSource | null = null) => {
      run.current?.abort();
      const controller = new AbortController();
      run.current = controller;
      waitingBack.current = null;
      closest.current = null;
      saveScanMiss(null);
      if (!scanned.pickedLines?.length) pickedClosest.current = null;
      setError(null);
      setPhoto(scanned.image);
      setBackPhoto(scanned.backImage ?? null);
      setSheet({ kind: "matching" });
      // Alternates are settled once, here, so the phone and the server read the same lines.
      const settled = await deps.settle(scanned).catch(() => scanned);
      if (controller.signal.aborted) return;
      // What the phone itself read shows under the card while the match is looked up. Never waited on.
      void deps.peek(settled).then(
        (read) => {
          if (read && !controller.signal.aborted) setSheet((now) => (now?.kind === "matching" ? { kind: "matching", read } : now));
        },
        () => {},
      );
      // A raw card's photo look orders "Which version?". A slab's photo is mostly its case and label.
      // Read once per photo: a front kept for "Flip it over" carries its look (or null) back in.
      const look = settled.look === undefined && settled.image && settled.kind !== "slab" ? await deps.look(settled.image).catch(() => null) : (settled.look ?? null);
      if (controller.signal.aborted) return;
      const capture: ScanCapture = look ? { ...settled, look } : settled;
      lastCapture.current = { ...capture, versionLine: scanned.versionLine ?? null };
      const result = await deps.identify(capture, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      const online = deps.online();
      // The search itself failed (offline): nothing more to look up.
      if (!result || !online) {
        setSheet(sheetStateFrom(result, online));
        return;
      }
      // The front alone can't pin the card: ask for the back first. No sold search runs until
      // the collector scans it or skips.
      if (source && needsBackStep(capture, result, source)) {
        waitingBack.current = { front: { ...scanned, look }, capture, result };
        setSheet({ kind: "back", matches: result.matches });
        return;
      }
      await finish(capture, result, controller);
    },
    [deps, finish],
  );

  /** "Scan the back": the camera again; both sides are then read as one. A cancel keeps the step. */
  const scanBack = useCallback(async () => {
    const waiting = waitingBack.current;
    if (!waiting) return;
    let back: ScanOutcome = null;
    try {
      back = await deps.scan();
    } catch {
      setError(HUB_COPY.readFailed);
      return;
    }
    if (back === CAMERA_DENIED) {
      setCameraOff({ settings: await deps.canOpenSettings().catch(() => false) });
      return;
    }
    if (!back || waitingBack.current !== waiting) return;
    waitingBack.current = null;
    await identify(withBack(waiting.front, back), null);
  }, [deps, identify]);

  /** "Skip": the front's read goes on as it was, with its last solds. */
  const skipBack = useCallback(() => {
    const waiting = waitingBack.current;
    if (!waiting) return;
    waitingBack.current = null;
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    void finish(waiting.capture, waiting.result, controller);
  }, [finish]);

  /**
   * The collector says the card is the Sapphire Edition (it often prints nothing to say so): the
   * same scan is read again as if it printed SAPPHIRE, and its sales are looked up as that set.
   */
  const asSapphire = useCallback(() => {
    const capture = lastCapture.current;
    if (!capture || capture.lines.some((line) => /\bsapphire\b/i.test(line))) return;
    void identify({ ...capture, lines: [...capture.lines, "SAPPHIRE"] });
  }, [identify]);

  /**
   * The collector picked the slab's version ("Which version?"): the same scan is read again as if
   * the label printed it, and that version's sales are looked up by the label's wording. The sheet
   * stays as they left it (the row they promoted, the serial they typed). A failed or offline read
   * keeps the pick and says sold prices are unavailable.
   */
  const asVersion = useCallback(
    async (version: string, rows: ScanMatch[]) => {
      const capture = lastCapture.current;
      if (!capture || rows.length === 0) return;
      run.current?.abort();
      const controller = new AbortController();
      run.current = controller;
      const next = withVersionLine(capture, version);
      lastCapture.current = next;
      setSheet({ kind: "ready", matches: rows, solds: { status: "looking" } });
      if (!deps.online()) {
        setSheet(versionRereadSheet(rows, null));
        return;
      }
      const solds = await deps.solds(next, rows, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      setSheet(versionRereadSheet(rows, solds));
    },
    [deps],
  );

  /** A card picked from the closest choices: the same scan, read again as that card, with its sold prices. */
  const pickClosest = useCallback(
    (index: number) => {
      const found = closest.current;
      const capture = lastCapture.current;
      const card = found?.cards[index];
      if (!found || !capture || !card) return;
      pickedClosest.current = { readKey: found.readKey, card };
      void identify(withPickedCard(capture, card), null);
    },
    [identify],
  );

  const startScan = useCallback(async () => {
    let capture: ScanOutcome = null;
    setError(null);
    try {
      capture = await deps.scan();
    } catch {
      setCameraOff(null);
      setError(HUB_COPY.readFailed);
      return;
    }
    if (capture === CAMERA_DENIED) {
      // Not a cancel: say why nothing opened, and how to turn it back on.
      setSheet(null);
      setCameraOff({ settings: await deps.canOpenSettings().catch(() => false) });
      return;
    }
    setCameraOff(null);
    if (!capture) {
      setSheet(null);
      return;
    }
    await identify(capture, "camera");
  }, [deps, identify]);

  const pickFromLibrary = useCallback(async () => {
    let capture: ScanCapture | null = null;
    try {
      capture = await deps.pickAndRead();
    } catch {
      setError(HUB_COPY.readFailed);
      return;
    }
    if (capture) await identify(capture, "library");
  }, [deps, identify]);

  useEffect(() => {
    let live = true;
    deps.scannerAvailable().then(
      (yes) => {
        if (live) setAvailable(yes);
      },
      () => {
        if (live) setAvailable(false);
      },
    );
    return () => {
      live = false;
    };
  }, [deps]);

  // The camera (or, from Upload photo, the library) opens on arrival: the fewest taps from here to the card.
  useEffect(() => {
    if (!available || opened.current) return;
    opened.current = true;
    const open = start === "library" ? pickFromLibrary : startScan;
    void open();
  }, [available, pickFromLibrary, start, startScan]);

  useEffect(() => () => run.current?.abort(), []);

  /**
   * "Add to my collection": one tap. A card with everything read (and its version picked) is
   * saved right here: a pop, a light haptic, then the collection. No sheet after it, no detour.
   * Anything still missing (a year, a card #) goes to Add card, which asks for it.
   */
  function toAddCard(match: ScanMatch, options: { save: boolean }) {
    // The collector confirmed the card they picked from the choices: the next scan that reads the same finds it first.
    const picked = pickedClosest.current;
    if (picked && match.yearLabel === picked.card.yearLabel && match.setBrand === picked.card.setBrand && match.cardNumber === picked.card.cardNumber) {
      deps.confirm(picked.readKey, picked.card);
      pickedClosest.current = null;
    }
    const input = collection && options.save ? cardInputFromScan(match, { photo, accent: nextAccent(collection.cards.length), isPublic: false }) : null;
    if (collection && input) {
      collection.addCard(input);
      haptic("add");
      run.current?.abort();
      setSheet(null);
      setAdded(true);
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      window.setTimeout(() => router.push("/collection"), reduce ? ADDED_PAUSE_REDUCED_MS : ADDED_PAUSE_MS);
      return;
    }
    const id = newScanId();
    if (photo) saveScan(photo);
    saveScanMatch(scanHandoffFrom(match, id, { autoSave: options.save }));
    router.push(scanAddPath(id));
  }

  function stepByStep() {
    // A card was shown and the collector left it: logged, so we can see what we got wrong.
    if (shown.current && !shown.current.capture.pickedLines?.length) deps.logMiss({ ...shown.current, closest: 0, leftForSearch: true });
    // A miss with the player read: the card they type in next is remembered for that read (once it saves).
    saveScanMiss(sheet?.kind === "none" && closest.current ? closest.current.readKey : null);
    if (photo) saveScan(photo);
    router.push("/cards/new");
  }

  async function onWebPhoto(file: File | undefined) {
    if (!file) return;
    try {
      saveScan(await readPhotoFile(file, 960));
      router.push("/cards/new");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : PHOTO_READ_ERROR);
    }
  }

  const closeSheet = () => {
    run.current?.abort();
    waitingBack.current = null;
    setSheet(null);
  };

  return (
    <div className="flex flex-col">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{HUB_COPY.title}</h1>
        <HitStreakBadge />
      </div>
      <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{HUB_COPY.body}</p>
      <p className="mt-3 text-13 text-zinc-500 dark:text-zinc-400">{HUB_COPY.unlimited}</p>

      {available === false ? (
        <p className="mt-6 rounded-2xl border border-zinc-200 p-4 text-sm leading-5 text-zinc-600 dark:border-white/10 dark:text-zinc-400">
          {deps.nativeApp() ? HUB_ERRORS.scannerDown : HUB_COPY.readerSoon}
        </p>
      ) : null}

      {cameraOff ? (
        <div role="alert" className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
          <div className="flex items-start gap-3">
            <CameraOff className="mt-0.5 size-5 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0">
              <h2 className="text-15 font-semibold">{CAMERA_OFF_COPY.title}</h2>
              <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                {cameraOff.settings ? CAMERA_OFF_COPY.body : CAMERA_OFF_COPY.manual}
              </p>
            </div>
          </div>
          {cameraOff.settings ? (
            <QuietButton onClick={() => void deps.openSettings().catch(() => {})} className="mt-3 w-full justify-center border border-zinc-200 dark:border-white/15">
              {CAMERA_OFF_COPY.openSettings}
            </QuietButton>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {available === null ? (
          <div aria-hidden className="skeleton-shimmer h-14 rounded-full" />
        ) : available ? (
          <>
            <PrimaryButton onClick={() => void startScan()} className="min-h-14 gap-2 text-15">
              <ScanLine className="size-5" strokeWidth={1.75} aria-hidden />
              {HUB_COPY.scan}
            </PrimaryButton>
            <div className="flex items-center justify-center gap-2">
              <QuietButton onClick={() => void pickFromLibrary()}>
                <ImagePlus className="size-4" aria-hidden />
                {HUB_COPY.library}
              </QuietButton>
              <span aria-hidden className="text-zinc-300 dark:text-white/20">
                ·
              </span>
              <TypeItLink />
            </div>
          </>
        ) : (
          <>
            <PhotoFileInputs cameraRef={cameraRef} libraryRef={libraryRef} onPick={(file) => void onWebPhoto(file)} />
            <PrimaryButton onClick={() => cameraRef.current?.click()} className="min-h-14 gap-2 text-15">
              <Camera className="size-5" aria-hidden />
              {HUB_COPY.scan}
            </PrimaryButton>
            <div className="flex items-center justify-center gap-2">
              <QuietButton onClick={() => libraryRef.current?.click()}>
                <ImagePlus className="size-4" aria-hidden />
                {HUB_COPY.library}
              </QuietButton>
              <span aria-hidden className="text-zinc-300 dark:text-white/20">
                ·
              </span>
              <TypeItLink />
            </div>
          </>
        )}
      </div>

      {search ? (
        <section aria-labelledby="scan-search" className="mt-8 border-t border-zinc-200 pt-6 dark:border-white/10">
          <h2 id="scan-search" className="text-15 font-semibold">
            {HUB_COPY.searchTitle}
          </h2>
          <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{HUB_COPY.searchBody}</p>
          <div className="mt-3">{search}</div>
        </section>
      ) : null}

      <div className="mt-8 border-t border-zinc-200 pt-5 dark:border-white/10">
        <HitRevealsSetting />
      </div>

      {added ? <AddedPop photo={photo} /> : null}
      {sheet ? (
        <ConfirmSheet
          photo={photo}
          backPhoto={backPhoto}
          lookup={deps.compLookup}
          state={sheet}
          onConfirm={toAddCard}
          onStepByStep={stepByStep}
          onRetake={() => void startScan()}
          onSapphire={asSapphire}
          onVersion={asVersion}
          onScanBack={() => void scanBack()}
          onSkipBack={skipBack}
          onPickClosest={pickClosest}
          onClose={closeSheet}
        />
      ) : null}
    </div>
  );
}

function TypeItLink() {
  return (
    <Link
      href="/cards/new"
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-[#A78BFA] ${focusRing}`}
    >
      {HUB_COPY.typeIt}
    </Link>
  );
}
