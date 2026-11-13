"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, ScanLine } from "lucide-react";
import { PrimaryButton, QuietButton, focusRing } from "@/components/add-card/flow-ui";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { CompSheet, type CompLookup } from "@/components/scan/comp-sheet";
import { ConfirmSheet, type ConfirmSheetState } from "@/components/scan/confirm-sheet";
import { saveScan, saveScanMatch } from "@/lib/capture";
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import { PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
import { compQueryString, type ScanCompResult } from "@/lib/scan/comp";
import { newScanId, scanAddPath, scanHandoffFrom } from "@/lib/scan/handoff";
import type { LiveSoldsResult } from "@/lib/scan/live-solds";
import type { ScanMatch, ScanMatchResult, SoldTitle } from "@/lib/scan/match";
import { HUB_COPY, scanReadFrom, sheetStateFrom, type ScanCapture, type ScanPurpose } from "@/lib/scan/session";

export type ScanHubDeps = {
  /** Async so no plugin code ships in /scan's first load. */
  scannerAvailable: () => Promise<boolean>;
  /** The native camera. Null when cancelled. */
  scan: () => Promise<ScanCapture | null>;
  /** A library photo, read the same way. */
  pickAndRead: () => Promise<ScanCapture | null>;
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
  online: () => boolean;
};

/** The phone's alternate readings fill open fields (lib/scan/alternates.ts); the result is plain lines. */
async function defaultSettle(capture: ScanCapture): Promise<ScanCapture> {
  if (!capture.alternates?.length && !capture.backAlternates?.length) return capture;
  const [{ INDEXED_DIRECTORY }, { withAlternates }] = await Promise.all([import("@/lib/players/directory"), import("@/lib/scan/alternates")]);
  return withAlternates(capture, INDEXED_DIRECTORY);
}

async function defaultIdentify(capture: ScanCapture, signal: AbortSignal): Promise<ScanMatchResult | null> {
  const [{ INDEXED_DIRECTORY }, { searchCatalogRemote }, { loadProductData }, { matchScan }] = await Promise.all([
    import("@/lib/players/directory"),
    import("@/lib/catalog/search-remote"),
    import("@/lib/cards/product-data"),
    import("@/lib/scan/match"),
  ]);
  const read = scanReadFrom(capture, INDEXED_DIRECTORY);
  return matchScan(read, {
    soldTitles: defaultSoldTitles,
    directory: INDEXED_DIRECTORY,
    search: searchCatalogRemote,
    products: loadProductData,
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
  pickAndRead: defaultPickAndRead,
  settle: defaultSettle,
  identify: defaultIdentify,
  solds: defaultSolds,
  compLookup: defaultCompLookup,
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
};

/**
 * /scan. With the native scanner it opens the camera straight away: snap,
 * then the sheet. Add confirms into Add card; comp shows what it sold for.
 * Without it (the web, or an older app build) it says so and falls back to a
 * photo and a search, so no button is a dead end.
 */
export function ScanHub({
  purpose,
  start = "camera",
  deps: overrides,
}: {
  purpose: ScanPurpose;
  /** "library": the Add card sheet's Upload photo. Opens the photo library instead of the camera. */
  start?: "camera" | "library";
  deps?: Partial<ScanHubDeps>;
}) {
  const deps = useMemo(() => ({ ...defaultDeps, ...overrides }), [overrides]);
  const router = useRouter();
  // Null while checking: the app asks its native module; the web knows at once.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<ConfirmSheetState | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef<AbortController | null>(null);
  const opened = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const identify = useCallback(
    async (scanned: ScanCapture) => {
      run.current?.abort();
      const controller = new AbortController();
      run.current = controller;
      setError(null);
      setPhoto(scanned.image);
      setSheet({ kind: "matching" });
      // Alternates are settled once, here, so the phone and the server read the same lines.
      const capture = await deps.settle(scanned).catch(() => scanned);
      if (controller.signal.aborted) return;
      const result = await deps.identify(capture, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      const online = deps.online();
      const first = sheetStateFrom(result, online);
      // The search itself failed (offline): nothing more to look up.
      if (!result || !online) {
        setSheet(first);
        return;
      }
      // The card shows first; its last solds fill in. With no match yet, the
      // sold titles may still find it (a logo-only set), so keep looking.
      if (first.kind === "ready") setSheet({ ...first, solds: { status: "looking" } });
      const solds = await deps.solds(capture, result.matches, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      const matches = solds && solds.matches.length > 0 ? solds.matches : result.matches;
      if (matches.length === 0) {
        setSheet({ kind: "none", offline: false });
        return;
      }
      setSheet({
        kind: "ready",
        matches,
        solds: solds
          ? { status: "done", comp: solds.comp, query: solds.query, ...(solds.similar ? { similar: solds.similar } : {}) }
          : { status: "done", comp: { status: "unavailable" }, query: null },
      });
    },
    [deps],
  );

  const startScan = useCallback(async () => {
    let capture: ScanCapture | null = null;
    try {
      capture = await deps.scan();
    } catch {
      setError(HUB_COPY.readFailed);
      return;
    }
    if (!capture) {
      setSheet(null);
      return;
    }
    await identify(capture);
  }, [deps, identify]);

  const pickFromLibrary = useCallback(async () => {
    let capture: ScanCapture | null = null;
    try {
      capture = await deps.pickAndRead();
    } catch {
      setError(HUB_COPY.readFailed);
      return;
    }
    if (capture) await identify(capture);
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

  function toAddCard(match: ScanMatch, options: { save: boolean }) {
    const id = newScanId();
    if (photo) saveScan(photo);
    saveScanMatch(scanHandoffFrom(match, id, { autoSave: options.save }));
    router.push(scanAddPath(id));
  }

  function stepByStep() {
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

  const comp = purpose === "comp";
  const closeSheet = () => {
    run.current?.abort();
    setSheet(null);
  };

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <h1 className="text-2xl font-semibold tracking-tight">{comp ? HUB_COPY.compTitle : HUB_COPY.addTitle}</h1>
      <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{comp ? HUB_COPY.compBody : HUB_COPY.addBody}</p>
      <p className="mt-3 text-[13px] text-zinc-500">{HUB_COPY.unlimited}</p>

      {available === false ? (
        <p className="mt-6 rounded-2xl border border-zinc-200 p-4 text-sm leading-5 text-zinc-600 dark:border-white/10 dark:text-zinc-400">
          {comp ? HUB_COPY.compReaderSoon : HUB_COPY.readerSoon}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      {/* The actions sit low, where a thumb reaches. */}
      <div className="mt-auto space-y-3 pt-10 pb-2">
        {available === null ? (
          <div aria-hidden className="h-14 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-white/10" />
        ) : available ? (
          <>
            <PrimaryButton onClick={() => void startScan()} className="min-h-14 gap-2 text-[15px]">
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
              <TypeItLink comp={comp} />
            </div>
          </>
        ) : comp ? (
          <Link
            href="/comp"
            className={`inline-flex min-h-14 w-full items-center justify-center rounded-full bg-violet-600 px-6 text-[15px] font-semibold text-white hover:bg-violet-500 ${focusRing}`}
          >
            {HUB_COPY.findByName}
          </Link>
        ) : (
          <>
            <PhotoFileInputs cameraRef={cameraRef} libraryRef={libraryRef} onPick={(file) => void onWebPhoto(file)} />
            <PrimaryButton onClick={() => cameraRef.current?.click()} className="min-h-14 gap-2 text-[15px]">
              <Camera className="size-5" strokeWidth={1.75} aria-hidden />
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
              <TypeItLink comp={false} />
            </div>
          </>
        )}
      </div>

      {sheet && !comp ? (
        <ConfirmSheet
          photo={photo}
          state={sheet}
          onConfirm={toAddCard}
          onStepByStep={stepByStep}
          onRetake={() => void startScan()}
          onClose={closeSheet}
        />
      ) : null}
      {sheet && comp ? (
        <CompSheet
          photo={photo}
          state={sheet}
          lookup={deps.compLookup}
          onAdd={toAddCard}
          onScanAnother={() => void startScan()}
          onSearch={() => router.push("/comp")}
          onClose={closeSheet}
        />
      ) : null}
    </div>
  );
}

function TypeItLink({ comp }: { comp: boolean }) {
  return (
    <Link
      href={comp ? "/comp" : "/cards/new"}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-[#A78BFA] ${focusRing}`}
    >
      {HUB_COPY.typeIt}
    </Link>
  );
}
