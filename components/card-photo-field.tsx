"use client";

import type { ReactNode, Ref } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { PhotoFileInputs } from "@/components/photo-file-inputs";

const photoButton =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none";

const photoPrimary = `${photoButton} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950`;

const photoSecondary = `${photoButton} border border-zinc-300 bg-white text-zinc-900 dark:border-white/15 dark:bg-transparent dark:text-zinc-100`;

const photoQuiet = `${photoButton} text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white`;

export function CardPhotoField({
  photo,
  photoError,
  reading = false,
  scanning,
  onTake,
  onLibrary,
  onRemove,
  onRetry,
  cameraRef,
  libraryRef,
  onPick,
  children,
}: {
  photo: string | null;
  photoError: string | null;
  reading?: boolean;
  scanning: boolean;
  onTake: () => void;
  onLibrary: () => void;
  onRemove: () => void;
  onRetry: () => void;
  cameraRef: Ref<HTMLInputElement>;
  libraryRef: Ref<HTMLInputElement>;
  onPick: (file: File | undefined) => void;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-sm font-medium">Photo</p>

      <div className="mt-3 grid gap-4 sm:grid-cols-[112px_1fr]">
        <div
          className="relative overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-100 dark:border-white/15 dark:bg-black/30"
          style={{ aspectRatio: "5 / 7" }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Card" className="h-full w-full object-cover" />
          ) : (
            <button
              type="button"
              onClick={onLibrary}
              aria-label="Choose a photo"
              className="grid h-full w-full place-items-center text-zinc-600 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
            >
              <ImagePlus size={22} />
            </button>
          )}
          {reading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 px-2 text-center">
              <Loader2 className="mb-2 animate-spin text-violet-300" size={20} />
              <p className="text-xs font-medium">Reading photo…</p>
            </div>
          ) : null}
          {scanning ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 px-2 text-center">
              <Loader2 className="mb-2 animate-spin text-violet-300" size={20} />
              <p className="text-xs font-medium">Demo lookup…</p>
              <p className="mt-1 text-[10px] text-zinc-400">Sample match, not a real scan</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <PhotoFileInputs cameraRef={cameraRef} libraryRef={libraryRef} onPick={onPick} />
          {photoError ? (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-rose-600 dark:text-rose-400">{photoError}</p>
              <button type="button" onClick={onRetry} className={photoSecondary}>
                Try again
              </button>
            </div>
          ) : null}
          {photo ? (
            <>
              <button type="button" onClick={onTake} className={photoPrimary}>
                <Camera size={16} />
                Retake
              </button>
              <button type="button" onClick={onLibrary} className={photoSecondary}>
                <ImagePlus size={16} />
                <span className="md:hidden">Choose another</span>
                <span className="hidden md:inline">Replace</span>
              </button>
              <button type="button" onClick={onRemove} className={photoQuiet}>
                Remove
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onTake} className={photoPrimary}>
                <Camera size={16} />
                Take photo
              </button>
              <button type="button" onClick={onLibrary} className={photoSecondary}>
                <ImagePlus size={16} />
                <span className="md:hidden">Choose from library</span>
                <span className="hidden md:inline">Upload photo</span>
              </button>
            </>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
