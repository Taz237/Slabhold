"use client";

import type { ChangeEvent, Ref } from "react";
import { PHOTO_ACCEPT } from "@/lib/photos";

function takeFile(
  event: ChangeEvent<HTMLInputElement>,
  onPick: (file: File | undefined) => void,
) {
  onPick(event.target.files?.[0]);
  event.target.value = "";
}

/**
 * Two inputs so iOS and Android cannot stick `capture` onto the library picker.
 * Omit `cameraRef` when the screen has no Take photo action.
 */
export function PhotoFileInputs({
  cameraRef,
  libraryRef,
  onPick,
}: {
  cameraRef?: Ref<HTMLInputElement>;
  libraryRef: Ref<HTMLInputElement>;
  onPick: (file: File | undefined) => void;
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
          onChange={(event) => takeFile(event, onPick)}
        />
      ) : null}
      <input
        ref={libraryRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-label="Choose from library"
        data-photo-input="library"
        onChange={(event) => takeFile(event, onPick)}
      />
    </>
  );
}
