import { isNativeApp, loadNative } from "@/lib/ios/platform";

export type HapticMoment = "like" | "post";

/**
 * A light tap on Like, a success buzz when a post goes up. iOS app only; the
 * native code loads on first use. Never throws and never waits.
 */
export function haptic(moment: HapticMoment): void {
  if (!isNativeApp()) return;
  void loadNative()
    .then((native) => native.playHaptic(moment))
    .catch(() => {});
}
