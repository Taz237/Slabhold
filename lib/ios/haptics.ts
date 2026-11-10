import { isNativeApp, loadNative } from "@/lib/ios/platform";

export type HapticMoment = "like" | "post" | "save" | "follow" | "send" | "refresh" | "tick";

/**
 * A light tap on Like, follow, send, refresh and a chart tick; a success buzz
 * when a post goes up or a card is saved. iOS app only; the
 * native code loads on first use. Never throws and never waits.
 */
export function haptic(moment: HapticMoment): void {
  if (!isNativeApp()) return;
  void loadNative()
    .then((native) => native.playHaptic(moment))
    .catch(() => {});
}
