import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installMenuShows, installStepShows, standaloneNeedsLogin } from "@/lib/pwa/install-step";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const g = globalThis as { window?: unknown };

describe("install copy in the iOS app", () => {
  afterEach(() => {
    delete g.window;
  });

  it("reads the app as a computer: no install step, no Add to Home Screen", () => {
    const source = read("components/onboarding/use-install-platform.ts");
    assert.match(source, /\/\/ The iOS app: no install step or Add to Home Screen, same as a computer\.\n  if \(isNativeApp\(\)\) return "desktop";/);
    assert.match(source, /navigatorStandalone: nav\.standalone === true,/, "the web's standalone check is unchanged");
    assert.equal(installMenuShows("desktop"), false, "side menu");
    assert.equal(installStepShows({ platform: "desktop", choice: null, setupStored: null }), false, "onboarding step");
  });

  it("shows signed-out readers the landing page, not the installed app's log in", () => {
    assert.equal(standaloneNeedsLogin({ platform: "desktop", ready: true, signedIn: false, pathname: "/" }), false);
  });

  it("keeps the timeline tip off in the app", () => {
    assert.match(read("components/add-to-home-tip.tsx"), /navigatorStandalone: nav\.standalone === true \|\| isNativeApp\(\)/);
  });

  it("gives Settings > Notifications a short note in the app, and leaves the push settings alone", () => {
    const page = read("app/(app)/settings/notifications/page.tsx");
    assert.match(page, /return <NotificationsGate \/>;/);
    const gate = read("components/native/notifications-gate.tsx");
    assert.match(gate, /useSyncExternalStore\(noopSubscribe, isNativeApp, \(\) => false\)/, "the server renders the web page");
    assert.match(gate, /if \(!native\) return <NotificationSettings \/>;/);
    assert.match(gate, /<h1[^>]*>Notifications<\/h1>/);
    assert.match(gate, /text-zinc-500">Notifications aren&apos;t on in the iPhone app yet</);
    assert.doesNotMatch(read("components/push/notification-settings.tsx"), /lib\/ios/, "notification-settings is hands off");
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
