"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { saveCompose, saveScan } from "@/lib/capture";
import { PHOTO_HEIC_ERROR, PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";

export function ScanView() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const photoSource = useRef<"camera" | "library">("library");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  function openCamera() {
    photoSource.current = "camera";
    cameraRef.current?.click();
  }

  function openLibrary() {
    photoSource.current = "library";
    libraryRef.current?.click();
  }

  function retryPhoto() {
    if (photoSource.current === "camera") openCamera();
    else openLibrary();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setPhotoError(null);
    try {
      setPhoto(await readPhotoFile(file, 960));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : PHOTO_READ_ERROR);
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <h1 className="text-2xl font-bold tracking-tight">Scan</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Photograph a card, then add it to your book or post it.
      </p>

      <PhotoFileInputs
        cameraRef={cameraRef}
        libraryRef={libraryRef}
        onPick={(file) => void onFile(file)}
      />
      {photoError ? (
        <div role="alert" className="mt-4 space-y-2">
          <p className="text-sm text-rose-600 dark:text-rose-400">{photoError}</p>
          {photoError === PHOTO_HEIC_ERROR ? null : (
            <button
              type="button"
              onClick={retryPhoto}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold"
            >
              Try again
            </button>
          )}
        </div>
      ) : null}

      {!photo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
          <button
            type="button"
            aria-label="Open camera"
            onClick={openCamera}
            className="grid h-28 w-28 place-items-center rounded-full bg-zinc-900 text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-950"
          >
            <Camera className="h-10 w-10" />
          </button>
          <p className="text-sm font-medium">{reading ? "Reading photo…" : "Open camera"}</p>
          <button
            type="button"
            onClick={openLibrary}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-300 px-4 text-sm font-medium dark:border-white/15"
          >
            <ImagePlus className="h-4 w-4" />
            Choose a photo
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-1 flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt="Scanned card"
            className="mx-auto max-h-[420px] w-full rounded-3xl object-contain"
          />
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => {
                saveScan(photo);
                router.push("/cards/new");
              }}
              className="min-h-11 rounded-full bg-zinc-900 py-3 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                saveCompose(photo);
                router.push("/compose");
              }}
              className="min-h-11 rounded-full border border-zinc-300 py-3 text-sm font-semibold dark:border-white/15"
            >
              Post about this card
            </button>
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                openCamera();
              }}
              className="min-h-11 py-2 text-sm text-zinc-500"
            >
              Retake
            </button>
            <button type="button" onClick={openLibrary} className="min-h-11 py-2 text-sm text-zinc-500">
              Choose another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
