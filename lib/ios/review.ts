/**
 * The one helper call sites use to ask for an App Store review at a happy
 * moment. Web-safe: on the web it does nothing, and the rules and the plugin
 * live in the native chunk (lib/ios/native.ts), loaded only inside the app.
 * Fire-and-forget; never throws.
 */
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import type { ReviewMoment } from "@/lib/ios/review-prompt";

export type { ReviewMoment };

export function askForReview(moment: ReviewMoment): void {
  if (!isNativeApp()) return;
  void loadNative()
    .then((native) => native.askNativeReview(moment))
    .catch(() => {});
}
