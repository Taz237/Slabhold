"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { saveCompose, saveScan } from "@/lib/capture";
import { fileToDataUrl } from "@/lib/storage";

export function ScanView() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      setPhoto(await fileToDataUrl(file, 960));
    } finally {
      setReading(false);
    }
  }

  function openPicker(capture: boolean) {
    const input = inputRef.current;
    if (!input) return;
    if (capture) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <h1 className="text-2xl font-bold tracking-tight">Scan</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Photograph a card, then add it to your book or post it.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {!photo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
          <button
            type="button"
            aria-label="Open camera"
            onClick={() => openPicker(true)}
            className="grid h-28 w-28 place-items-center rounded-full bg-zinc-900 text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-950"
          >
            <Camera className="h-10 w-10" />
          </button>
          <p className="text-sm font-medium">{reading ? "Reading photo…" : "Open camera"}</p>
          <button
            type="button"
            onClick={() => openPicker(false)}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-white/15"
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
              className="rounded-full bg-zinc-900 py-3 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                saveCompose(photo);
                router.push("/compose");
              }}
              className="rounded-full border border-zinc-300 py-3 text-sm font-semibold dark:border-white/15"
            >
              Post about this card
            </button>
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                openPicker(true);
              }}
              className="py-2 text-sm text-zinc-500"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
