"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, ScanLine } from "lucide-react";
import { PrimaryButton, QuietButton, focusRing } from "@/components/add-card/flow-ui";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { CompSheet, type CompLookup } from "@/components/scan/comp-sheet";
import { ConfirmSheet, type ConfirmOptions, type ConfirmSheetState } from "@/components/scan/confirm-sheet";
import { trackEvent } from "@/lib/analytics";
import { saveScan, saveScanMatch } from "@/lib/capture";
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import { PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
import { compQueryString, type ScanCompResult } from "@/lib/scan/comp";
import { newScanId, scanAddPath, scanHandoffFrom } from "@/lib/scan/handoff";
import type { ScanMatch, ScanMatchResult } from "@/lib/scan/match";
import { HUB_COPY, scanReadFrom, sheetStateFrom, type ScanCapture, type ScanPurpose } from "@/lib/scan/session";

export type ScanHubDeps = {
  /** Async so no plugin code ships in /scan's first load. */
  scannerAvailable: () => Promise<boolean>;
  /** The native camera. Null when cancelled, "denied" when camera access is off. */
  scan: () => Promise<ScanCapture | null | "denied">;
  /** Slabhold's page in Settings, to turn the camera back on. */
  openSettings: () => Promise<boolean>;
  /** Learning from fixes: what the collector chose over the scan's pick. Off behind NEXT_PUBLIC_SCAN_FIXES. */
  recordFix: (readKey: string, before: ScanMatch, after: ScanMatch) => Promise<void>;
  /** Counts only: no card text, images or ids (lib/analytics.ts drops anything else). */
  track: (name: string, props?: Record<string, string>) => void;
  /** A library photo, read the same way. */
  pickAndRead: () => Promise<ScanCapture | null>;
  /** Read and match against the catalog. Null when the search failed. */
  identify: (capture: ScanCapture, signal: AbortSignal) => Promise<ScanMatchResult | null>;
  compLookup: CompLookup;
  online: () => boolean;
};

async function defaultIdentify(capture: ScanCapture, signal: AbortSignal): Promise<ScanMatchResult | null> {
  const [{ INDEXED_DIRECTORY }, { searchCatalogRemote }, { loadProductData }, { matchScan }, fixes] = await Promise.all([
    import("@/lib/players/directory"),
    import("@/lib/catalog/search-remote"),
    import("@/lib/cards/product-data"),
    import("@/lib/scan/match"),
    import("@/lib/scan/fixes"),
  ]);
  const read = scanReadFrom(capture, INDEXED_DIRECTORY);
  const readKey = fixes.readKeyOf(read);
  const learning = fixes.scanFixesEnabled() && readKey;
  const [result, boosts] = await Promise.all([
    matchScan(read, {
      directory: INDEXED_DIRECTORY,
      search: searchCatalogRemote,
      products: loadProductData,
      signal,
    }),
    learning ? import("@/lib/scan/fix-store").then((store) => store.loadFixBoosts(readKey)) : Promise.resolve([]),
  ]);
  if (!result) return null;
  return { ...fixes.applyFixBoosts(result, readKey, boosts), readKey };
}

async function defaultRecordFix(readKey: string, before: ScanMatch, after: ScanMatch): Promise<void> {
  const fixes = await import("@/lib/scan/fixes");
  if (!fixes.scanFixesEnabled()) return;
  const fix = fixes.fixFrom(readKey, before, after);
  if (!fix) return;
  await (await import("@/lib/scan/fix-store")).recordScanFix(fix);
}

async function defaultCompLookup(identity: Parameters<CompLookup>[0]): Promise<ScanCompResult> {
  const response = await fetch(`/api/scan/comp?${compQueryString(identity)}`, { cache: "no-store" });
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
  openSettings: async () => (await loadNative()).openCameraSettings(),
  track: (name, props) => trackEvent(name, props),
  recordFix: defaultRecordFix,
  pickAndRead: defaultPickAndRead,
  identify: defaultIdentify,
  compLookup: defaultCompLookup,
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
};

/**
 * /scan. With the native scanner it opens the camera straight away: snap,
 * then the sheet. Add confirms into Add card; comp shows what it sold for.
 * Without it (the web, or an older app build) it says so and falls back to a
 * photo and a search, so no button is a dead end.
 */
export function ScanHub({ purpose, deps: overrides }: { purpose: ScanPurpose; deps?: Partial<ScanHubDeps> }) {
  const deps = useMemo(() => ({ ...defaultDeps, ...overrides }), [overrides]);
  const router = useRouter();
  // Null while checking: the app asks its native module; the web knows at once.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<ConfirmSheetState | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  // The scan as it came back, so a fix can be recorded against it.
  const lastResult = useRef<ScanMatchResult | null>(null);
  const run = useRef<AbortController | null>(null);
  const opened = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const identify = useCallback(
    async (capture: ScanCapture) => {
      run.current?.abort();
      const controller = new AbortController();
      run.current = controller;
      setError(null);
      setPhoto(capture.image);
      setSheet({ kind: "matching" });
      const result = await deps.identify(capture, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      deps.track("scan_matched", {
        result: !result || result.matches.length === 0 ? "none" : result.settled ? "settled" : "unsure",
      });
      lastResult.current = result;
      setSheet(sheetStateFrom(result, deps.online()));
    },
    [deps],
  );

  const startScan = useCallback(async () => {
    let capture: ScanCapture | null | "denied" = null;
    try {
      capture = await deps.scan();
    } catch {
      setError(HUB_COPY.readFailed);
      return;
    }
    if (capture === "denied") {
      deps.track("scan_camera_denied");
      setSheet(null);
      setDenied(true);
      return;
    }
    setDenied(false);
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

  useEffect(() => {
    deps.track("scan_opened", { source: purpose === "comp" ? "scan_comp" : "scan" });
  }, [deps, purpose]);

  // The camera opens on arrival: the fewest taps from here to the card.
  useEffect(() => {
    if (!available || opened.current) return;
    opened.current = true;
    void startScan();
  }, [available, startScan]);

  useEffect(() => () => run.current?.abort(), []);

  function toAddCard(match: ScanMatch, options: ConfirmOptions) {
    deps.track("scan_added", { result: options.save ? "one_tap" : "edit" });
    if (options.changedRow) deps.track("scan_fixed", { result: "row" });
    if (options.changedParallel) deps.track("scan_fixed", { result: "parallel" });
    const scanned = lastResult.current;
    if ((options.changedRow || options.changedParallel) && scanned?.readKey && scanned.matches[0]) {
      void deps.recordFix(scanned.readKey, scanned.matches[0], match).catch(() => {});
    }
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

      {denied ? (
        <div role="alert" className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
          <p className="text-[15px] font-semibold">{HUB_COPY.cameraOffTitle}</p>
          <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{HUB_COPY.cameraOffBody}</p>
          <PrimaryButton onClick={() => void deps.openSettings()} className="mt-4">
            {HUB_COPY.openSettings}
          </PrimaryButton>
        </div>
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
            {/* With the camera off, Open Settings above is the one main action. */}
            {denied ? null : (
              <PrimaryButton onClick={() => void startScan()} className="min-h-14 gap-2 text-[15px]">
                <ScanLine className="size-5" strokeWidth={1.75} aria-hidden />
                {HUB_COPY.scan}
              </PrimaryButton>
            )}
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
