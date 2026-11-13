import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { appHomeLoginPath, standaloneLoginPath } from "@/lib/pwa/install-step";
import { HUB_ERRORS } from "@/lib/scan/hub-errors";
import { COMP_COPY } from "@/lib/scan/comp";
import { REPLY_PHOTOS_UNAVAILABLE } from "@/lib/social/reply-images";
import { SIDE_MENU_DELETE } from "@/lib/ui/side-menu";

/** The web fixes from the build 5 App Review audit (guidelines 1.2, 2.1, 4.2, 5.1.1). */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("4.2: the iPhone app never opens on the website's landing page", () => {
  it("signed-out Home goes to log in inside the iPhone app", () => {
    assert.equal(appHomeLoginPath("desktop", true), "/login?next=%2F");
    assert.equal(appHomeLoginPath(null, true), "/login?next=%2F");
  });

  it("the home-screen app keeps its log-in-once screen, and browsers keep the landing page", () => {
    assert.equal(appHomeLoginPath("installed", false), standaloneLoginPath());
    for (const platform of ["ios-safari", "ios-browser", "android", "in-app", "desktop", null] as const) {
      assert.equal(appHomeLoginPath(platform, false), null);
    }
  });

  it("both signed-out doors use it, and hold Home blank so the landing page never flashes", () => {
    for (const file of ["components/onboarding/standalone-login.tsx", "components/landing/standalone-redirect.tsx"]) {
      const source = read(file);
      assert.match(source, /appHomeLoginPath\(/, file);
      assert.match(source, /useNativeApp\(\)/, file);
      assert.match(source, /bg-\[var\(--background\)\]/, file);
    }
  });
});

describe("2.1: nothing in the app reads as unfinished", () => {
  it("email sign-up in the app says the link opens in the browser, and to come back", () => {
    const form = read("components/auth-form.tsx");
    assert.match(form, /\{nativeApp \? \(\s*<p[^>]*data-confirm-in-app=""[^>]*>\s*The link opens in your browser\. Once it&apos;s confirmed, come back here and log in\./);
  });

  it("a scanner that didn't load in the app is a plain error with a way forward", () => {
    assert.match(HUB_ERRORS.scannerDown, /^The scanner couldn't start\./);
    assert.match(HUB_ERRORS.compScannerDown, /^The scanner couldn't start\./);
    const hub = read("components/scan/scan-hub.tsx");
    assert.match(hub, /deps\.nativeApp\(\)\s*\? comp\s*\? HUB_ERRORS\.compScannerDown\s*: HUB_ERRORS\.scannerDown/);
  });

  it("no 'yet', 'coming' or 'getting ready' in what the app can show", () => {
    const shown = [
      HUB_ERRORS.scannerDown,
      HUB_ERRORS.compScannerDown,
      REPLY_PHOTOS_UNAVAILABLE,
      read("components/native/notifications-gate.tsx"),
      read("components/push/notification-settings.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""),
    ];
    for (const text of shown) assert.doesNotMatch(text, /aren(&apos;|')t (on|available)[^.<]* yet|getting push notifications ready|is coming to/i);
  });
});

describe("5.1.1: sold prices are 'recent sold prices, via Trawl'", () => {
  it("the privacy policy names Trawl as the service", () => {
    const privacy = read("app/(app)/privacy/page.tsx");
    assert.match(privacy, /Recent sold\s+prices come from Trawl, a third-party sold-listing service\./);
    assert.doesNotMatch(privacy, /eBay/);
  });

  it("the scan and Quick Comp copy doesn't name eBay", () => {
    assert.doesNotMatch(Object.values(COMP_COPY).join(" "), /eBay/);
    const photo = read("components/quick-comp/quick-comp-photo.tsx");
    assert.match(photo, /PHOTO_CAPTION = "Photo from a recent sale"/);
    assert.doesNotMatch(photo.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""), /eBay sale/);
  });
});

describe("1.2: terms", () => {
  const terms = read("app/(app)/terms/page.tsx");

  it("keeps zero tolerance and says reports are acted on within 24 hours", () => {
    assert.match(terms, /zero tolerance for objectionable content or abusive users/);
    assert.match(terms, /Reports are reviewed within 24 hours\. When content breaks these terms we remove it, and\s+we remove the account that posted it\./);
  });

  it("has a licence section and links Apple's standard agreement", () => {
    assert.match(terms, /Using Slabhold/);
    assert.match(terms, /personal licence/);
    assert.match(terms, /https:\/\/www\.apple\.com\/legal\/internet-services\/itunes\/dev\/stdeula\//);
  });
});

describe("5.1.1: Delete account is one tap from the menu", () => {
  it("has its own row that lands on the delete section", () => {
    assert.deepEqual(SIDE_MENU_DELETE, { href: "/settings/privacy#delete-account", label: "Delete account" });
    const menu = read("components/side-menu.tsx");
    assert.ok(menu.indexOf("SIDE_MENU_DELETE.label") > menu.indexOf("SIDE_MENU_SUPPORT.label"));
    assert.match(read("components/delete-account.tsx"), /<section id="delete-account"/);
  });
});
