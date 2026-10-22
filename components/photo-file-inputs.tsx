"use client";

import type { ChangeEvent, Ref } from "react";
import { PHOTO_ACCEPT } from "@/lib/photos";

function selectedFiles(event: ChangeEvent<HTMLInputElement>): File[] {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  return files;
}

/**
 * Two inputs so iOS and Android cannot stick `capture` onto the library picker.
 * Omit `cameraRef` when the screen has no Take photo action.
 */
export function PhotoFileInputs({
  cameraRef,
  libraryRef,
  onPick,
  onPickMany,
  libraryMultiple = false,
}: {
  cameraRef?: Ref<HTMLInputElement>;
  libraryRef: Ref<HTMLInputElement>;
  onPick: (file: File | undefined) => void;
  /** Library only. The camera input stays a single shot and is the only one with capture. */
  onPickMany?: (files: File[]) => void;
  libraryMultiple?: boolean;
}) {
  return (
    <>
      {cameraRef ? (
        <input
          ref={cameraRef}
          type="file"
          accept={PHOTO_ACCEPT}
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-label="Take photo"
          data-photo-input="camera"
          onChange={(event) => onPick(selectedFiles(event)[0])}
        />
      ) : null}
      <input
        ref={libraryRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple={libraryMultiple ? true : undefined}
        className="hidden"
        tabIndex={-1}
        aria-label="Choose from library"
        data-photo-input="library"
        onChange={(event) => {
          const files = selectedFiles(event);
          if (libraryMultiple && onPickMany) onPickMany(files);
          else onPick(files[0]);
        }}
      />
    </>
  );
}
