import { isIosSafari, isStandaloneApp } from "@/lib/pwa/add-to-home";
import { loginPath } from "@/lib/auth/safe-next";
import type { SetupState } from "@/lib/onboarding/first-run";

/**
 * Where Add to Home Screen can happen.
 * - installed: already the home-screen app.
 * - ios-safari: Share, then Add to Home Screen.
 * - ios-browser: Chrome, Firefox or Edge on iPhone. Same Share route, top bar.
 * - android: Chrome's install prompt, or its menu.
 * - in-app: X, Instagram and other app webviews. Can't install, open a browser first.
 * - desktop: no step.
 */
export type InstallPlatform = "installed" | "ios-safari" | "ios-browser" | "android" | "in-app" | "desktop";

export type DeviceInput = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  navigatorStandalone: boolean;
  displayModeStandalone: boolean;
};

/** App webviews, most specific first. Android's generic webview marks itself "; wv)". */
const IN_APP: readonly [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/Twitter|TwitterAndroid/i, "X"],
  [/BytedanceWebview|musical_ly|TikTok|trill_/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Pinterest/i, "Pinterest"],
  [/Discord/i, "Discord"],
  [/Line\//i, "LINE"],
  [/MicroMessenger/i, "WeChat"],
  [/GSA\//i, "Google app"],
  [/; wv\)/i, "this app"],
];

/** The app whose browser this is, or null in a real browser. */
export function inAppBrowserName(userAgent: string): string | null {
  for (const [pattern, name] of IN_APP) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

function isIosFamily(input: DeviceInput): boolean {
  if (/iPhone|iPad|iPod/i.test(input.userAgent)) return true;
  return (
    input.platform === "MacIntel" &&
    (input.maxTouchPoints ?? 0) > 1 &&
    /Macintosh/i.test(input.userAgent)
  );
}

export function installPlatform(input: DeviceInput): InstallPlatform {
  if (isStandaloneApp(input)) return "installed";
  const ua = input.userAgent ?? "";
  if (inAppBrowserName(ua)) return "in-app";
  if (isIosSafari(input)) return "ios-safari";
  if (isIosFamily(input)) return "ios-browser";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** The browser to send an in-app visitor to. */
export function openInBrowserName(userAgent: string): "Safari" | "Chrome" {
  return /Android/i.test(userAgent) ? "Chrome" : "Safari";
}

/** Opens the same page in Chrome from an Android webview. */
export function androidChromeIntent(url: string): string {
  const parsed = new URL(url);
  return `intent://${parsed.host}${parsed.pathname}${parsed.search}#Intent;scheme=https;package=com.android.chrome;end`;
}

export type InstallChoice = "added" | "later";

/** Set once the onboarding step has been answered, on this device. */
export function installStepKey(userId: string) {
  return `slabhold.install-step.${userId}`;
}

export function parseInstallChoice(value: string | null): InstallChoice | null {
  return value === "added" || value === "later" ? value : null;
}

/**
 * The step comes right before first-run setup, once. It never shows in the
 * installed app or on a computer, and not to someone already partway through
 * setup (they're past this point).
 */
export function installStepShows(input: {
  platform: InstallPlatform | null;
  choice: InstallChoice | null;
  setupStored: SetupState | null;
}): boolean {
  if (input.choice || input.setupStored) return false;
  return installMenuShows(input.platform);
}

/** "Add to Home Screen" in the side menu: phones only, never in the installed app. */
export function installMenuShows(platform: InstallPlatform | null): boolean {
  return platform !== null && platform !== "installed" && platform !== "desktop";
}

/**
 * A home-screen app on iPhone may not share Safari's login. Signed out on
 * Home, it goes to a short "log in once" screen instead of the landing page.
 */
export function standaloneNeedsLogin(input: {
  platform: InstallPlatform | null;
  ready: boolean;
  signedIn: boolean;
  pathname: string;
}): boolean {
  return input.platform === "installed" && input.ready && !input.signedIn && input.pathname === "/";
}

export function standaloneLoginPath(): string {
  return `${loginPath("/")}&app=1`;
}

/**
 * Remembers the email for the installed app's login screen. iOS may copy
 * Safari's cookies into the app when it's added; localStorage never is.
 */
export const EMAIL_HINT_COOKIE = "slabhold_email_hint";

const WEEK_SECONDS = 7 * 24 * 60 * 60;

export function emailHintCookie(email: string, secure: boolean): string {
  const parts = [
    `${EMAIL_HINT_COOKIE}=${encodeURIComponent(email)}`,
    `Max-Age=${WEEK_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearEmailHintCookie(): string {
  return `${EMAIL_HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** After the installed app logs in, the hint has done its job. */
export function forgetEmailHint() {
  document.cookie = clearEmailHintCookie();
}

/**
 * The install step was answered. "Maybe later" means no installed-app login
 * is coming, so the hint goes; "added" keeps it for that first login.
 */
export function settleInstallChoice(choice: InstallChoice) {
  if (choice === "later") forgetEmailHint();
}

/**
 * "Log in once to finish setup" is only true in the installed app, between
 * the install step and its first login. The email hint marks that window, so
 * someone who just logged out of the app gets the normal login copy.
 */
export function loginFinishesSetup(input: {
  appParam: string | null;
  standalone: boolean;
  cookie: string;
}): boolean {
  return input.appParam === "1" && input.standalone && readEmailHint(input.cookie) !== null;
}

export function readEmailHint(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== EMAIL_HINT_COOKIE) continue;
    let value: string;
    try {
      value = decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  }
  return null;
}
