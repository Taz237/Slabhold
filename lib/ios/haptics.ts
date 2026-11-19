import { isNativeApp, loadNative } from "@/lib/ios/platform";

export type HapticMoment =
  | "like"
  | "post"
  | "save"
  | "follow"
  | "send"
  | "refresh"
  | "tick"
  /** A new card reaches the center of the profile carousel: the picker-wheel tick, lighter than "tick". */
  | "select"
  | "add"
  /** The scan reveal (components/scan/scan-reveal.tsx): the cropped card snaps onto the stage. */
  | "snap"
  /** The reveal's light crosses the card: a soft purr of a few ticks, never a buzz. */
  | "sweep"
  /** The reveal's card locks into its slot. */
  | "lock"
  /** The same, on a match the card itself pinned. */
  | "lockSure";

/**
 * A light tap on Like, follow, send, refresh and a chart tick; a success buzz
 * when a post goes up or a card is saved. The scan reveal's snap, sweep and
 * lock live here too. iOS app only (a no-op in any browser); the
 * native code loads on first use. Never throws and never waits.
 */
export function haptic(moment: HapticMoment): void {
  if (!isNativeApp()) return;
  void loadNative()
    .then((native) => native.playHaptic(moment))
    .catch(() => {});
}
