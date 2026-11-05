import { isNativeApp } from "@/lib/ios/platform";

export type HapticMoment = "like" | "post";

/**
 * A light tap on Like, a success buzz when a post goes up. iOS app only; the
 * plugin loads on first use. Never throws and never waits.
 */
export function haptic(moment: HapticMoment): void {
  if (!isNativeApp()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle, NotificationType }) =>
      moment === "like"
        ? Haptics.impact({ style: ImpactStyle.Light })
        : Haptics.notification({ type: NotificationType.Success }),
    )
    .catch(() => {});
}
