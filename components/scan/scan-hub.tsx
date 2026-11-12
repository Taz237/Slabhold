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
import type { ScanMatch, ScanMatchResult } from "@/lib/scan/match";
import { HUB_COPY, scanReadFrom, sheetStateFrom, type ScanCapture, type ScanPurpose } from "@/lib/scan/session";

export type ScanHubDeps = {
  /** Async so no plugin code ships in /scan's first load. */
  scannerAvailable: () => Promise<boolean>;
  /** The native camera. Null when cancelled. */
  scan: () => Promise<ScanCapture | null>;
  /** A library photo, read the same way. */
  pickAndRead: () => Promise<ScanCapture | null>;
  /** Read and match against the catalog. Null when the search failed. */
  identify: (capture: ScanCapture, signal: AbortSignal) => Promise<ScanMatchResult | null>;
  compLookup: CompLookup;
  online: () => boolean;
};

async function defaultIdentify(capture: ScanCapture, signal: AbortSignal): Promise<ScanMatchResult | null> {
  const [{ INDEXED_DIRECTORY }, { searchCatalogRemote }, { loadProductData }, { matchScan }] = await Promise.all([
    import("@/lib/players/directory"),
    import("@/lib/catalog/search-remote"),
    import("@/lib/cards/product-data"),
    import("@/lib/scan/match"),
  ]);
  const read = scanReadFrom(capture, INDEXED_DIRECTORY);
  return matchScan(read, {
    directory: INDEXED_DIRECTORY,
    search: searchCatalogRemote,
    products: loadProductData,
    signal,
  });
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
      setSheet(sheetStateFrom(result, deps.online()));
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

  // The camera opens on arrival: the fewest taps from here to the card.
  useEffect(() => {
    if (!available || opened.current) return;
    opened.current = true;
    void startScan();
  }, [available, startScan]);

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
