/**
 * What the scan screen says when camera access is off for Slabhold.
 * Its own file, loaded only with the scan screen, so the shared pages stay small.
 */
export const CAMERA_OFF_COPY = {
  title: "Camera is off for Slabhold",
  body: "Turn the camera on in Settings to scan. You can still choose a photo or type it in.",
  /** For a build that can't open Settings itself. */
  manual: "To scan, open the Settings app, tap Slabhold and turn on Camera. You can still choose a photo or type it in.",
  openSettings: "Open Settings",
} as const;
