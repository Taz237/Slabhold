"use client";

import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/utm";

/** First page load records campaign parameters. Later visits keep that first touch. */
export function CaptureUtm() {
  useEffect(() => {
    captureFirstTouch(window.location.search, window.localStorage);
  }, []);
  return null;
}
