/**
 * The iOS app's native layer: the only module that imports Capacitor plugins.
 * Never import it statically; use loadNative() from lib/ios/platform, behind
 * isNativeApp(). Web visitors never download it.
 */
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { oauthReturnPath } from "@/lib/auth/oauth";
import { appLinkPath, routeLink, routeWindowOpen } from "@/lib/ios/links";
import type { PhotoSource } from "@/lib/ios/camera";
import type { HapticMoment } from "@/lib/ios/haptics";
import { asShareAbort, photoFile, photoPickFailure } from "@/lib/ios/native-helpers";
import type { NativeShareData } from "@/lib/share/sheet";

const LAUNCH_KEY = "slabhold.native.launch-url";

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

/**
 * Hides the launch splash, sets the status bar, follows universal links
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
    const path = appLinkPath(url);
    // Back from Apple or Google: close the in-app browser and finish the sign-in
    // here, in the WebView, where the PKCE verifier lives. A full load: it's a route handler.
    const signIn = oauthReturnPath(path);
    if (signIn) {
      void Browser.close().catch(() => {});
      go(signIn);
      return;
    }
    if (path && path !== currentPath()) navigate(path);
  });

  void App.getLaunchUrl()
    .then((launch) => {
      const link = launch?.url ? appLinkPath(launch.url) : null;
      const path = oauthReturnPath(link) ?? link;
      if (path && launch && firstTimeFor(launch.url)) go(path);
    })
    .catch(() => {});

  void StatusBar.setStyle({ style: Style.Default }).catch(() => {});
  // NativeBoot already hid it through the bridge; this is the fallback.
  void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});

  return () => {
    document.removeEventListener("click", onClick, true);
    window.open = webOpen;
    void urlOpen.then((handle) => handle.remove()).catch(() => {});
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

export function playHaptic(moment: HapticMoment): Promise<void> {
  return moment === "like"
    ? Haptics.impact({ style: ImpactStyle.Light })
    : Haptics.notification({ type: NotificationType.Success });
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
