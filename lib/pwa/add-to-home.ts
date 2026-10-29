/** Other iOS browsers and in-app webviews. Add to Home Screen is Safari-only. */
const NOT_SAFARI =
  /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|Chrome|Chromium|Android|Firefox|EdgA|Edg\//i;

export function addToHomeDismissKey(userId: string) {
  return `slabhold.add-to-home.dismissed.${userId}`;
}

export function isIosSafari(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  const ua = input.userAgent ?? "";
  const iphoneFamily = /iPhone|iPad|iPod/i.test(ua);
  // iPadOS can send a Macintosh UA. Touch points keep a real Mac out.
  const ipadDesktop =
    !iphoneFamily &&
    input.platform === "MacIntel" &&
    (input.maxTouchPoints ?? 0) > 1 &&
    /Macintosh/i.test(ua) &&
    /Safari/i.test(ua);
  if (!iphoneFamily && !ipadDesktop) return false;
  if (NOT_SAFARI.test(ua)) return false;
  return /Safari/i.test(ua);
}

/** Installed home-screen app: iOS navigator.standalone or the display-mode media query. */
export function isStandaloneApp(input: {
  navigatorStandalone: boolean;
  displayModeStandalone: boolean;
}): boolean {
  return input.navigatorStandalone || input.displayModeStandalone;
}

/** The old timeline card. Gone for anyone who answered the onboarding step. */
export function shouldShowAddToHomeTip(input: {
  signedIn: boolean;
  dismissed: boolean;
  /** The Add to Home Screen onboarding step was answered on this device. */
  stepAnswered?: boolean;
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  navigatorStandalone: boolean;
  displayModeStandalone: boolean;
}): boolean {
  if (!input.signedIn || input.dismissed || input.stepAnswered) return false;
  if (
    isStandaloneApp({
      navigatorStandalone: input.navigatorStandalone,
      displayModeStandalone: input.displayModeStandalone,
    })
  ) {
    return false;
  }
  return isIosSafari(input);
}
