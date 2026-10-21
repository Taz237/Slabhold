import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addToHomeDismissKey, isIosSafari, isStandaloneApp, shouldShowAddToHomeTip } from "./add-to-home";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/128.0 Mobile/15E148 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";
const DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const browser = {
  signedIn: true,
  dismissed: false,
  userAgent: IPHONE_SAFARI,
  platform: "iPhone",
  maxTouchPoints: 5,
  navigatorStandalone: false,
  displayModeStandalone: false,
};

describe("isIosSafari", () => {
  it("is true for iPhone, iPad, and iPad desktop-mode Safari", () => {
    assert.equal(isIosSafari({ userAgent: IPHONE_SAFARI, platform: "iPhone" }), true);
    assert.equal(isIosSafari({ userAgent: IPAD_SAFARI, platform: "iPad" }), true);
    assert.equal(
      isIosSafari({ userAgent: IPAD_DESKTOP, platform: "MacIntel", maxTouchPoints: 5 }),
      true,
    );
  });

  it("is false for other iOS browsers, Android, and desktop", () => {
    assert.equal(isIosSafari({ userAgent: IPHONE_CHROME, platform: "iPhone" }), false);
    assert.equal(isIosSafari({ userAgent: IPHONE_FIREFOX, platform: "iPhone" }), false);
    assert.equal(isIosSafari({ userAgent: ANDROID_CHROME, platform: "Linux armv8l" }), false);
    assert.equal(
      isIosSafari({ userAgent: DESKTOP_SAFARI, platform: "MacIntel", maxTouchPoints: 0 }),
      false,
    );
    assert.equal(isIosSafari({ userAgent: DESKTOP_CHROME, platform: "Win32" }), false);
    assert.equal(isIosSafari({ userAgent: "" }), false);
  });
});

describe("isStandaloneApp", () => {
  it("is true when navigator.standalone or display-mode standalone is set", () => {
    assert.equal(isStandaloneApp({ navigatorStandalone: true, displayModeStandalone: false }), true);
    assert.equal(isStandaloneApp({ navigatorStandalone: false, displayModeStandalone: true }), true);
    assert.equal(isStandaloneApp({ navigatorStandalone: false, displayModeStandalone: false }), false);
  });
});

describe("shouldShowAddToHomeTip", () => {
  it("shows for a signed-in person in iPhone Safari", () => {
    assert.equal(shouldShowAddToHomeTip(browser), true);
  });

  it("hides when dismissed, signed out, or already installed", () => {
    assert.equal(shouldShowAddToHomeTip({ ...browser, dismissed: true }), false);
    assert.equal(shouldShowAddToHomeTip({ ...browser, signedIn: false }), false);
    assert.equal(shouldShowAddToHomeTip({ ...browser, navigatorStandalone: true }), false);
    assert.equal(shouldShowAddToHomeTip({ ...browser, displayModeStandalone: true }), false);
    assert.equal(addToHomeDismissKey("user-1"), "slabhold.add-to-home.dismissed.user-1");
  });

  it("never shows on Android, desktop, or iOS Chrome", () => {
    assert.equal(shouldShowAddToHomeTip({ ...browser, userAgent: ANDROID_CHROME, platform: "Linux armv8l" }), false);
    assert.equal(
      shouldShowAddToHomeTip({
        ...browser,
        userAgent: DESKTOP_SAFARI,
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
      false,
    );
    assert.equal(shouldShowAddToHomeTip({ ...browser, userAgent: IPHONE_CHROME }), false);
  });
});
