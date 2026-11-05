import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installMenuShows, installPlatform, installStepShows } from "@/lib/pwa/install-step";
import { shouldShowAddToHomeTip } from "@/lib/pwa/add-to-home";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** WKWebView's user agent has no "Safari" in it. */
const WKWEBVIEW_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

describe("install copy in the iOS app", () => {
  it("counts the app as installed, so no Add to Home Screen anywhere", () => {
    const platform = installPlatform({
      userAgent: WKWEBVIEW_UA,
      navigatorStandalone: true, // what readPlatform passes when isNativeApp()
      displayModeStandalone: false,
    });
    assert.equal(platform, "installed");
    assert.equal(installMenuShows(platform), false, "side menu");
    assert.equal(installStepShows({ platform, choice: null, setupStored: null }), false, "onboarding step");
    assert.equal(
      shouldShowAddToHomeTip({
        signedIn: true,
        dismissed: false,
        userAgent: WKWEBVIEW_UA,
        navigatorStandalone: true,
        displayModeStandalone: false,
      }),
      false,
      "timeline tip",
    );
  });

  it("feeds isNativeApp into every install check that reads the device", () => {
    for (const path of ["components/onboarding/use-install-platform.ts", "components/add-to-home-tip.tsx"]) {
      assert.match(read(path), /navigatorStandalone: nav\.standalone === true \|\| isNativeApp\(\)/, path);
    }
  });

  it("never tells the app to add itself to the Home Screen for notifications", () => {
    assert.match(
      read("components/push/notification-settings.tsx"),
      /if \(!available \|\| isNativeApp\(\)\) return Promise\.resolve\(\{ kind: "unavailable" \}\)/,
    );
  });
});

describe("universal links", () => {
  const aasa = JSON.parse(read("public/.well-known/apple-app-site-association"));

  it("names the app by team and bundle id, with no placeholder", () => {
    assert.deepEqual(aasa.applinks.details[0].appIDs, ["Z45KCV676K.app.slabhold"]);
    assert.deepEqual(aasa.webcredentials.apps, ["Z45KCV676K.app.slabhold"]);
    assert.doesNotMatch(read("public/.well-known/apple-app-site-association"), /TEAMID/i);
  });

  it("opens pages in the app but leaves the API, auth and files to the web", () => {
    const components: { "/": string; exclude?: boolean }[] = aasa.applinks.details[0].components;
    const excluded = components.filter((c) => c.exclude).map((c) => c["/"]);
    for (const path of ["/api/*", "/auth/*", "/_next/*", "/.well-known/*"]) assert.ok(excluded.includes(path), path);
    assert.deepEqual(components.at(-1), { "/": "/*" });
  });

  it("is served as JSON from slabhold.app", async () => {
    const { default: config } = await import("@/next.config");
    const rules = await config.headers!();
    const rule = rules.find((r) => r.source === "/.well-known/apple-app-site-association");
    assert.ok(rule);
    assert.deepEqual(
      rule.headers.find((h) => h.key === "Content-Type"),
      { key: "Content-Type", value: "application/json" },
    );
  });

  it("is claimed by the app's associated domains", () => {
    const entitlements = read("ios-app/ios/App/App/App.entitlements");
    assert.match(entitlements, /<string>applinks:slabhold\.app<\/string>/);
    assert.match(entitlements, /<string>webcredentials:slabhold\.app<\/string>/);
    const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");
    assert.equal((pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) ?? []).length, 2);
  });
});
