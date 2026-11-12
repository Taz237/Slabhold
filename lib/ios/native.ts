/**
 * The iOS app's native layer: the only module that imports Capacitor plugins.
 * Never import it statically; use loadNative() from lib/ios/platform, behind
 * isNativeApp(). Web visitors never download it.
 */
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Keyboard } from "@capacitor/keyboard";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { oauthReturnPath } from "@/lib/auth/oauth";
import { appLinkPath, routeLink, routeWindowOpen, safeAppPath } from "@/lib/ios/links";
import type { PhotoSource } from "@/lib/ios/camera";
import type { HapticMoment } from "@/lib/ios/haptics";
import { apnsTokenFrom, asShareAbort, nativePermissionFrom, photoFile, photoPickFailure, pushTapPath } from "@/lib/ios/native-helpers";
import { claimReviewAsk, countLaunch, type ReviewMoment } from "@/lib/ios/review-prompt";
import type { NativePermission } from "@/lib/push/native-client";
import type { NativeShareData } from "@/lib/share/sheet";
import { SCANNER_PLUGIN, scanCaptureFrom, type RawScan } from "@/lib/ios/scanner";
import type { ScanCapture } from "@/lib/scan/session";

const LAUNCH_KEY = "slabhold.native.launch-url";

/** Our own Swift plugin (ios-app/ios/App/App/SlabholdNativePlugin.swift), build 4 and up. */
type SlabholdNativePlugin = {
  requestReview(): Promise<{ asked: boolean }>;
  setBadge(options: { count: number }): Promise<void>;
  shareFiles(options: {
    files: { name: string; mime: string; base64: string }[];
    text?: string;
  }): Promise<{ shown: boolean; completed?: boolean }>;
};
const SlabholdNative = registerPlugin<SlabholdNativePlugin>("SlabholdNative");

/** The card scanner (ios-app SlabholdScanner). lib/ios/scanner.ts checks what it returns. */
type SlabholdScannerPlugin = {
  scanCard(options: { mode: "auto" }): Promise<RawScan>;
  recognize(options: { image: string }): Promise<RawScan>;
};
const SlabholdScanner = registerPlugin<SlabholdScannerPlugin>(SCANNER_PLUGIN);

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Each launch link is followed once, not again on every reload. */
function firstTimeFor(url: string): boolean {
  try {
    if (window.sessionStorage.getItem(LAUNCH_KEY) === url) return false;
    window.sessionStorage.setItem(LAUNCH_KEY, url);
  } catch {
    // Storage blocked: follow it anyway.
  }
  return true;
}

/** A full load: for the launch URL and links opened in a new tab. */
function go(path: string) {
  if (path !== currentPath()) window.location.assign(path);
}

export type ShellDeps = {
  /** The Next router's push, so a link opened while the app is up is a soft navigation. */
  navigate: (path: string) => void;
};

function openInBrowser(url: string) {
  void Browser.open({ url, presentationStyle: "popover" }).catch(() => {});
}

/**
 * Continue with Apple / Google in the app. Google blocks sign-in inside a
 * WebView, so it opens in the in-app browser and comes back on a universal link.
 */
export function openAuthBrowser(url: string): Promise<void> {
  return Browser.open({ url, presentationStyle: "popover" });
}

const TOKEN_WAIT_MS = 15_000;
let pushToken: string | null = null;
let tokenListening = false;
const tokenWaiters = new Set<(token: string | null) => void>();

function settleToken(token: string | null) {
  if (token) pushToken = token;
  for (const resolve of [...tokenWaiters]) resolve(token ?? pushToken);
  tokenWaiters.clear();
}

/** One pair of listeners for APNs registration, kept for the app's life. */
function listenForToken() {
  if (tokenListening) return;
  tokenListening = true;
  void PushNotifications.addListener("registration", ({ value }) => settleToken(apnsTokenFrom(value))).catch(() => {});
  void PushNotifications.addListener("registrationError", () => settleToken(null)).catch(() => {});
}

/** register() and wait for the token: the new one, the last one, or null after ~15s. */
function registerForToken(): Promise<string | null> {
  listenForToken();
  return new Promise<string | null>((resolve) => {
    const timer = window.setTimeout(() => {
      tokenWaiters.delete(finish);
      resolve(pushToken);
    }, TOKEN_WAIT_MS);
    function finish(token: string | null) {
      window.clearTimeout(timer);
      resolve(token);
    }
    tokenWaiters.add(finish);
    PushNotifications.register().catch(() => {
      tokenWaiters.delete(finish);
      window.clearTimeout(timer);
      resolve(null);
    });
  });
}

/** This build has the PushNotifications plugin. False on TestFlight builds 2 and 3. */
export function nativePushAvailable(): boolean {
  try {
    return Capacitor.isPluginAvailable("PushNotifications");
  } catch {
    return false;
  }
}

/** The app's notification permission. Never prompts. Null when the plugin isn't there. */
export async function nativePushPermission(): Promise<NativePermission | null> {
  if (!nativePushAvailable()) return null;
  try {
    return nativePermissionFrom((await PushNotifications.checkPermissions()).receive);
  } catch {
    return null;
  }
}

/** Asks iOS (only if it hasn't been asked), registers, and resolves with the hex token. Null on deny or error. */
export async function nativePushEnable(): Promise<string | null> {
  if (!nativePushAvailable()) return null;
  try {
    let permission = nativePermissionFrom((await PushNotifications.checkPermissions()).receive);
    if (permission === "prompt") permission = nativePermissionFrom((await PushNotifications.requestPermissions()).receive);
    if (permission !== "granted") return null;
    return await registerForToken();
  } catch {
    return null;
  }
}

/** The current token when permission is already granted (a silent register). Never prompts. */
export async function nativePushToken(): Promise<string | null> {
  if ((await nativePushPermission()) !== "granted") return null;
  return pushToken ?? registerForToken();
}

/** Stop APNs for this app. Turning on again registers afresh. */
export async function nativePushDisable(): Promise<void> {
  pushToken = null;
  if (!nativePushAvailable()) return;
  await PushNotifications.unregister().catch(() => {});
}

/**
 * From launch: a notification tap opens its page (cold starts too, since the
 * plugin holds the tap until a listener is added), and when permission is
 * already granted the token refreshes silently. Never prompts.
 */
function startNativePush(navigate: (path: string) => void): () => void {
  if (!nativePushAvailable()) return () => {};
  const tap = PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const path = pushTapPath(notification?.data);
    if (path !== currentPath()) navigate(path);
  });
  void tap.catch(() => {});
  void PushNotifications.checkPermissions()
    .then(({ receive }) => {
      if (nativePermissionFrom(receive) === "granted") void registerForToken();
    })
    .catch(() => {});
  return () => {
    void tap.then((handle) => handle.remove()).catch(() => {});
  };
}

/**
 * Hides the launch splash, sets the status bar, hides the keyboard's accessory
 * bar, routes notification taps, follows universal links
 * (https://slabhold.app/...) and slabhold:// links, and opens other sites, and
 * window.open, in the in-app browser. Returns the undo.
 */
export function startNativeShell({ navigate }: ShellDeps): () => void {
  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
    const route = routeLink({
      href: anchor.getAttribute("href") ?? "",
      here: window.location.href,
      newTab: anchor.target === "_blank",
    });
    if (!route) return;
    event.preventDefault();
    if (route.kind === "browser") openInBrowser(route.url);
    else go(route.path);
  }
  document.addEventListener("click", onClick, true);

  const webOpen = window.open;
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const href = url === undefined ? null : routeWindowOpen({ url: String(url), here: window.location.href });
    if (!href) return webOpen.call(window, url, target, features);
    openInBrowser(href);
    return null;
  };

  const urlOpen = App.addListener("appUrlOpen", ({ url }) => {
    const link = appLinkPath(url);
    // Back from Apple or Google: close the in-app browser and finish the sign-in
    // here, in the WebView, where the PKCE verifier lives. A full load: it's a route handler.
    const signIn = oauthReturnPath(link);
    if (signIn) {
      void Browser.close().catch(() => {});
      go(signIn);
      return;
    }
    // Only our own pages; never /api, /auth or another site. Otherwise stay put.
    const path = safeAppPath(link);
    if (path && path !== currentPath()) navigate(path);
  });

  void App.getLaunchUrl()
    .then((launch) => {
      const link = launch?.url ? appLinkPath(launch.url) : null;
      const path = oauthReturnPath(link) ?? safeAppPath(link);
      if (path && launch && firstTimeFor(launch.url)) go(path);
    })
    .catch(() => {});

  // Once per app session, for the review prompt's "never on the first launch".
  try {
    countLaunch(window.localStorage, window.sessionStorage);
  } catch {
    // Storage blocked: the review prompt just never asks.
  }

  const stopPush = startNativePush(navigate);
  // No ‹ › Done strip above the keyboard. Old builds without the plugin just reject.
  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

  void StatusBar.setStyle({ style: Style.Default }).catch(() => {});
  // NativeBoot already hid it through the bridge; this is the fallback.
  void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});

  return () => {
    document.removeEventListener("click", onClick, true);
    window.open = webOpen;
    void urlOpen.then((handle) => handle.remove()).catch(() => {});
    stopPush();
  };
}

/** The iOS share sheet. Links only: the plugin takes file paths, not Files. Cancel is an AbortError. */
export async function shareSheet(data: NativeShareData): Promise<void> {
  try {
    await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title });
  } catch (error) {
    throw asShareAbort(error);
  }
}

/** Which taps are a success buzz; the rest are a light impact. */
const SUCCESS_MOMENTS: ReadonlySet<HapticMoment> = new Set<HapticMoment>(["post", "save"]);

export function playHaptic(moment: HapticMoment): Promise<void> {
  return SUCCESS_MOMENTS.has(moment)
    ? Haptics.notification({ type: NotificationType.Success })
    : Haptics.impact({ style: ImpactStyle.Light });
}

/**
 * The native camera or photo picker, as a File. Null on Cancel. A data URL,
 * not a file path: the page comes from slabhold.app and can't read the app's
 * files. getPhoto is deprecated in Camera 8 but still ships; takePhoto only
 * returns paths.
 */
export async function pickPhoto(source: PhotoSource): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      quality: 90,
      width: 2400,
      correctOrientation: true,
      saveToGallery: false,
    });
    return photoFile(photo);
  } catch (error) {
    const failure = photoPickFailure(error);
    if (failure) throw failure;
    return null;
  }
}

/** This build has our Swift plugin. False on TestFlight builds 2 and 3, and if registration failed. */
export function nativeExtrasAvailable(): boolean {
  try {
    return Capacitor.isPluginAvailable("SlabholdNative");
  } catch {
    return false;
  }
}

/** Apple's "Rate Slabhold" popup. Apple decides if it shows. False when unavailable or on error; never throws. */
export async function requestNativeReview(): Promise<boolean> {
  if (!nativeExtrasAvailable()) return false;
  try {
    return (await SlabholdNative.requestReview()).asked === true;
  } catch {
    return false;
  }
}

/**
 * Asks for a review at a happy moment when the rules allow it: not on the first
 * launch, once per app version, each moment once. Records the ask first.
 */
export async function askNativeReview(moment: ReviewMoment): Promise<boolean> {
  if (!nativeExtrasAvailable()) return false;
  let version: string | null = null;
  try {
    version = (await App.getInfo()).version || null;
  } catch {
    return false;
  }
  let allowed = false;
  try {
    allowed = claimReviewAsk(window.localStorage, moment, version);
  } catch {
    return false;
  }
  return allowed ? requestNativeReview() : false;
}

/** The red number on the app icon. 0 clears it. A no-op on builds without our plugin. */
export async function setNativeBadge(count: number): Promise<void> {
  if (!nativeExtrasAvailable()) return;
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  try {
    await SlabholdNative.setBadge({ count: safe });
  } catch {
    // Old or failed plugin: the badge stays as the last push set it.
  }
}

/** Runs when the app comes back to the front. Returns the undo. */
export function onAppResume(listener: () => void): () => void {
  const handle = App.addListener("resume", listener);
  void handle.catch(() => {});
  return () => {
    void handle.then((h) => h.remove()).catch(() => {});
  };
}

/** This build can share images through the iOS sheet (build 4 and up). */
export function nativeShareFilesAvailable(): boolean {
  return nativeExtrasAvailable();
}

export type NativeFileShareResult = "shared" | "cancelled" | "unavailable";

/** A File as plain base64 (no data: prefix), for the bridge. */
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      if (comma < 0) reject(new Error("unreadable file"));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("unreadable file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Files (a share image, say) through the iOS share sheet: Save Image,
 * Instagram, Messages. "unavailable" on builds without our plugin, when the
 * sheet couldn't show, or on any error. Never throws.
 */
export async function shareFilesNative(input: { files: File[]; text?: string }): Promise<NativeFileShareResult> {
  if (!nativeShareFilesAvailable()) return "unavailable";
  try {
    const files = await Promise.all(
      input.files.map(async (file) => ({
        name: file.name,
        mime: file.type || "application/octet-stream",
        base64: await fileBase64(file),
      })),
    );
    const result = await SlabholdNative.shareFiles(input.text ? { files, text: input.text } : { files });
    if (!result?.shown) return "unavailable";
    return result.completed ? "shared" : "cancelled";
  } catch {
    return "unavailable";
  }
}

/** This build has the card scanner (SlabholdScanner). False on older builds. */
export function scannerAvailable(): boolean {
  try {
    return Capacitor.isPluginAvailable(SCANNER_PLUGIN);
  } catch {
    return false;
  }
}

/** Opens the native card scanner. Null when cancelled. Throws only when the plugin fails. */
export async function scanCard(): Promise<ScanCapture | null> {
  return scanCaptureFrom(await SlabholdScanner.scanCard({ mode: "auto" }));
}

/** Reads a library photo with the scanner's text reader. */
export async function recognizeCardPhoto(dataUrl: string): Promise<ScanCapture | null> {
  return scanCaptureFrom(await SlabholdScanner.recognize({ image: dataUrl }));
}
