"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { saveScan } from "@/lib/capture";
import { ADD_SHEET_COPY, addSheetRoute, type AddSheetTile } from "@/lib/cards/add-card-sheet";
import { isNativeApp } from "@/lib/ios/platform";
import { PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
import { scannerEnabled } from "@/lib/scan/entry";
import { useFocusTrap } from "@/lib/ui/focus-trap";

const tileFocus =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

export type AddCardSheetDeps = {
  native: () => boolean;
  scanner: () => boolean;
  readPhoto: (file: File) => Promise<string>;
};

const defaultDeps: AddCardSheetDeps = {
  native: isNativeApp,
  scanner: () => scannerEnabled(),
  readPhoto: (file) => readPhotoFile(file, 960),
};

/**
 * The Add card sheet. The app shell draws it while it is open (any Add card
 * button opens it): a blurred, dimmed screen and two big tiles, Scan and
 * Upload photo. Nothing else.
 */
export function AddCardSheet({ deps: overrides, onClose }: { deps?: Partial<AddCardSheetDeps>; onClose: () => void }) {
  const deps = { ...defaultDeps, ...overrides };
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab stays on the two tiles while the sheet is open.
  useFocusTrap(dialogRef);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-add-tile]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onClose]);

  function choose(tile: AddSheetTile) {
    setError(null);
    const route = addSheetRoute(tile, { native: deps.native(), scanner: deps.scanner() });
    if (route.kind === "scanner") {
      onClose();
      router.push(route.href);
      return;
    }
    (route.source === "camera" ? cameraRef : libraryRef).current?.click();
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      saveScan(await deps.readPhoto(file));
      onClose();
      router.push("/cards/new");
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error && reason.message ? reason.message : PHOTO_READ_ERROR);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" data-slot="add-sheet">
      <button
        type="button"
        aria-label={ADD_SHEET_COPY.close}
        tabIndex={-1}
        onClick={onClose}
        className="glass-scrim absolute inset-0 bg-zinc-950/55 backdrop-blur-md motion-safe:animate-[backdrop-in_220ms_ease-out_both]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        className="relative w-full max-w-md rounded-t-[28px] border border-b-0 border-zinc-200 bg-[var(--background)] md:border-b dark:border-white/10 px-4 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(9,9,11,0.35)] motion-safe:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-[backdrop-in_160ms_ease-out_both] md:rounded-[28px] md:pb-5"
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full bg-zinc-300 dark:bg-white/20" />
        <h2 id={titleId} className="sr-only">
          {ADD_SHEET_COPY.title}
        </h2>
        <PhotoFileInputs cameraRef={cameraRef} libraryRef={libraryRef} onPick={(file) => void onPick(file)} />
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-add-tile="scan"
            disabled={busy}
            onClick={() => choose("scan")}
            className={`group flex aspect-[1/1.05] flex-col items-start justify-between rounded-3xl bg-violet-600 p-4 text-left text-white transition-transform duration-150 ease-out hover:bg-violet-500 disabled:opacity-60 motion-safe:active:scale-[0.97] motion-safe:animate-[add-tile-in_360ms_cubic-bezier(0.22,1,0.36,1)_60ms_both] ${tileFocus}`}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-white/15">
              <Camera className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">{ADD_SHEET_COPY.scan}</span>
          </button>
          <button
            type="button"
            data-add-tile="upload"
            disabled={busy}
            onClick={() => choose("upload")}
            className={`group flex aspect-[1/1.05] flex-col items-start justify-between rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-left text-zinc-900 transition-transform duration-150 ease-out hover:border-zinc-300 disabled:opacity-60 motion-safe:active:scale-[0.97] motion-safe:animate-[add-tile-in_360ms_cubic-bezier(0.22,1,0.36,1)_120ms_both] dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-50 dark:hover:border-white/20 ${tileFocus}`}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-zinc-900/[0.06] dark:bg-white/10">
              <ImagePlus className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">{ADD_SHEET_COPY.upload}</span>
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
