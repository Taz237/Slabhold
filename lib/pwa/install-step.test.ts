import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_HINT_COOKIE,
  androidChromeIntent,
  clearEmailHintCookie,
  emailHintCookie,
  inAppBrowserName,
  installMenuShows,
  installPlatform,
  installStepKey,
  installStepShows,
  openInBrowserName,
  parseInstallChoice,
  readEmailHint,
  standaloneLoginPath,
  standaloneNeedsLogin,
} from "./install-step";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 600000000)";
const IPHONE_X =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.50";
const IPHONE_FACEBOOK =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5]";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36";
const ANDROID_TIKTOK =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 trill_340000 BytedanceWebview/d8a21c6";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const iphone = {
  userAgent: IPHONE_SAFARI,
  platform: "iPhone",
  maxTouchPoints: 5,
  navigatorStandalone: false,
  displayModeStandalone: false,
};

describe("installPlatform", () => {
  it("knows the installed app first, whatever the browser", () => {
    assert.equal(installPlatform({ ...iphone, navigatorStandalone: true }), "installed");
    assert.equal(
      installPlatform({ ...iphone, userAgent: ANDROID_CHROME, displayModeStandalone: true }),
      "installed",
    );
  });

  it("tells iPhone Safari from other iPhone browsers", () => {
    assert.equal(installPlatform(iphone), "ios-safari");
    assert.equal(
      installPlatform({ ...iphone, userAgent: IPAD_DESKTOP, platform: "MacIntel" }),
      "ios-safari",
    );
    assert.equal(installPlatform({ ...iphone, userAgent: IPHONE_CHROME }), "ios-browser");
  });

  it("spots in-app browsers on iPhone and Android", () => {
    assert.equal(installPlatform({ ...iphone, userAgent: IPHONE_INSTAGRAM }), "in-app");
    assert.equal(installPlatform({ ...iphone, userAgent: IPHONE_X }), "in-app");
    assert.equal(installPlatform({ ...iphone, userAgent: IPHONE_FACEBOOK }), "in-app");
    assert.equal(installPlatform({ ...iphone, userAgent: ANDROID_WEBVIEW, platform: "Linux" }), "in-app");
    assert.equal(installPlatform({ ...iphone, userAgent: ANDROID_TIKTOK, platform: "Linux" }), "in-app");
  });

  it("reads Android Chrome as android and computers as desktop", () => {
    assert.equal(installPlatform({ ...iphone, userAgent: ANDROID_CHROME, platform: "Linux armv8l" }), "android");
    assert.equal(installPlatform({ ...iphone, userAgent: DESKTOP_CHROME, platform: "Win32", maxTouchPoints: 0 }), "desktop");
    assert.equal(
      installPlatform({ ...iphone, userAgent: DESKTOP_SAFARI, platform: "MacIntel", maxTouchPoints: 0 }),
      "desktop",
    );
    assert.equal(installPlatform({ ...iphone, userAgent: "" }), "desktop");
  });
});

describe("in-app browser names", () => {
  it("names the app when it can, and the browser to open instead", () => {
    assert.equal(inAppBrowserName(IPHONE_INSTAGRAM), "Instagram");
    assert.equal(inAppBrowserName(IPHONE_X), "X");
    assert.equal(inAppBrowserName(IPHONE_FACEBOOK), "Facebook");
    assert.equal(inAppBrowserName(ANDROID_TIKTOK), "TikTok");
    assert.equal(inAppBrowserName(ANDROID_WEBVIEW), "this app");
    assert.equal(inAppBrowserName(IPHONE_SAFARI), null);
    assert.equal(inAppBrowserName(ANDROID_CHROME), null);
    assert.equal(openInBrowserName(IPHONE_INSTAGRAM), "Safari");
    assert.equal(openInBrowserName(ANDROID_WEBVIEW), "Chrome");
  });

  it("builds a Chrome intent for Android in-app browsers", () => {
    assert.equal(
      androidChromeIntent("https://slabhold.app/"),
      "intent://slabhold.app/#Intent;scheme=https;package=com.android.chrome;end",
    );
  });
});

describe("installStepShows", () => {
  it("shows once, on phones, before setup starts", () => {
    assert.equal(installStepShows({ platform: "ios-safari", choice: null, setupStored: null }), true);
    assert.equal(installStepShows({ platform: "android", choice: null, setupStored: null }), true);
    assert.equal(installStepShows({ platform: "in-app", choice: null, setupStored: null }), true);
    assert.equal(installStepShows({ platform: "ios-browser", choice: null, setupStored: null }), true);
  });

  it("skips the installed app, computers, a saved choice, and setup already under way", () => {
    assert.equal(installStepShows({ platform: "installed", choice: null, setupStored: null }), false);
    assert.equal(installStepShows({ platform: "desktop", choice: null, setupStored: null }), false);
    assert.equal(installStepShows({ platform: "ios-safari", choice: "later", setupStored: null }), false);
    assert.equal(installStepShows({ platform: "ios-safari", choice: "added", setupStored: null }), false);
    assert.equal(installStepShows({ platform: "ios-safari", choice: null, setupStored: "people" }), false);
    assert.equal(installStepShows({ platform: "ios-safari", choice: null, setupStored: "done" }), false);
  });

  it("stores the choice per user", () => {
    assert.equal(installStepKey("user-1"), "slabhold.install-step.user-1");
    assert.equal(parseInstallChoice("added"), "added");
    assert.equal(parseInstallChoice("later"), "later");
    assert.equal(parseInstallChoice("nope"), null);
    assert.equal(parseInstallChoice(null), null);
  });
});

describe("installMenuShows", () => {
  it("shows on phones that haven't installed", () => {
    assert.equal(installMenuShows("ios-safari"), true);
    assert.equal(installMenuShows("ios-browser"), true);
    assert.equal(installMenuShows("android"), true);
    assert.equal(installMenuShows("in-app"), true);
    assert.equal(installMenuShows("installed"), false);
    assert.equal(installMenuShows("desktop"), false);
    assert.equal(installMenuShows(null), false);
  });
});

describe("installed app login", () => {
  it("sends a signed-out installed app on Home to log in once", () => {
    const base = { platform: "installed" as const, ready: true, signedIn: false, pathname: "/" };
    assert.equal(standaloneNeedsLogin(base), true);
    assert.equal(standaloneNeedsLogin({ ...base, signedIn: true }), false);
    assert.equal(standaloneNeedsLogin({ ...base, ready: false }), false);
    assert.equal(standaloneNeedsLogin({ ...base, platform: "ios-safari" }), false);
    assert.equal(standaloneNeedsLogin({ ...base, pathname: "/login" }), false);
    assert.equal(standaloneLoginPath(), "/login?next=%2F&app=1");
  });

  it("keeps a short-lived email hint cookie, and reads it back", () => {
    const cookie = emailHintCookie("ada@example.com", true);
    assert.match(cookie, new RegExp(`^${EMAIL_HINT_COOKIE}=ada%40example\\.com;`));
    assert.match(cookie, /Max-Age=604800/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.doesNotMatch(emailHintCookie("ada@example.com", false), /Secure/);
    assert.match(clearEmailHintCookie(), /Max-Age=0/);
    assert.equal(readEmailHint(`a=1; ${EMAIL_HINT_COOKIE}=ada%40example.com; b=2`), "ada@example.com");
    assert.equal(readEmailHint("a=1"), null);
    assert.equal(readEmailHint(`${EMAIL_HINT_COOKIE}=not-an-email`), null);
    assert.equal(readEmailHint(`${EMAIL_HINT_COOKIE}=%E0%A4%A`), null);
  });
});
