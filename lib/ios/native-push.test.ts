import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { apnsTokenFrom, nativePermissionFrom, pushTapPath } from "@/lib/ios/native-helpers";
import { nativeAskSurface, nativeSettingsMode } from "@/lib/push/native-client";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** The body of a top-level function in a source file. */
function fnBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  return source.slice(start, source.indexOf("\n}\n", start));
}

describe("iPhone app push: decisions", () => {
  it("keeps today's note when the build has no plugin (TestFlight 2 and 3) or APNs is off", () => {
    assert.equal(nativeSettingsMode({ pluginAvailable: false, serverAvailable: true }), "note");
    assert.equal(nativeSettingsMode({ pluginAvailable: true, serverAvailable: false }), "note");
    assert.equal(nativeSettingsMode({ pluginAvailable: false, serverAvailable: false }), "note");
    assert.equal(nativeSettingsMode({ pluginAvailable: true, serverAvailable: true }), "settings");
  });

  it("offers the card only with the plugin and the server, and never once denied", () => {
    const base = { pluginAvailable: true, serverAvailable: true, permission: "prompt" as const, optedIn: false };
    assert.equal(nativeAskSurface(base), "push");
    assert.equal(nativeAskSurface({ ...base, pluginAvailable: false }), null);
    assert.equal(nativeAskSurface({ ...base, serverAvailable: false }), null);
    assert.equal(nativeAskSurface({ ...base, permission: "denied" }), null);
    assert.equal(nativeAskSurface({ ...base, permission: null }), null);
    assert.equal(nativeAskSurface({ ...base, permission: "granted" }), "push", "granted on this phone, not yet for this user");
    assert.equal(nativeAskSurface({ ...base, permission: "granted", optedIn: true }), null);
  });

  it("opens a tapped notification's page only as a same-origin path", () => {
    assert.equal(pushTapPath({ url: "/messages/jordanhale" }), "/messages/jordanhale");
    assert.equal(pushTapPath({ url: "/post/1?reply=2#r" }), "/post/1?reply=2#r");
    assert.equal(pushTapPath({ url: "https://evil.example/x" }), "/notifications");
    assert.equal(pushTapPath({ url: "//evil.example" }), "/notifications");
    assert.equal(pushTapPath({ url: "/\\evil.example" }), "/notifications");
    assert.equal(pushTapPath({}), "/notifications");
    assert.equal(pushTapPath(undefined), "/notifications");
  });

  it("lowercases the plugin's hex token and rejects anything else", () => {
    assert.equal(apnsTokenFrom("AB".repeat(32)), "ab".repeat(32));
    assert.equal(apnsTokenFrom("xyz"), null);
    assert.equal(apnsTokenFrom(undefined), null);
  });

  it("reads Android's prompt-with-rationale as not asked yet", () => {
    assert.equal(nativePermissionFrom("granted"), "granted");
    assert.equal(nativePermissionFrom("denied"), "denied");
    assert.equal(nativePermissionFrom("prompt"), "prompt");
    assert.equal(nativePermissionFrom("prompt-with-rationale"), "prompt");
  });
});

describe("iPhone app push: wiring", () => {
  const native = read("lib/ios/native.ts");

  it("imports the push and keyboard plugins only in lib/ios/native.ts", () => {
    assert.match(native, /import \{ PushNotifications \} from "@capacitor\/push-notifications";/);
    assert.match(native, /import \{ Keyboard \} from "@capacitor\/keyboard";/);
  });

  it("never prompts at launch: the shell only checks permission and registers when already granted", () => {
    const shell = fnBody(native, "export function startNativeShell(");
    const push = fnBody(native, "function startNativePush(");
    assert.match(shell, /startNativePush\(navigate\)/);
    for (const body of [shell, push]) assert.doesNotMatch(body, /requestPermissions/);
    assert.match(push, /if \(nativePermissionFrom\(receive\) === "granted"\) void registerForToken\(\);/);
    assert.match(push, /if \(!nativePushAvailable\(\)\) return \(\) => \{\};/, "old builds without the plugin skip it");
    // Only the explicit "Turn on" asks iOS.
    assert.equal((native.match(/requestPermissions\(/g) ?? []).length, 1);
    assert.match(fnBody(native, "export async function nativePushEnable("), /requestPermissions\(\)/);
  });

  it("routes taps through sameOriginPath from launch", () => {
    const push = fnBody(native, "function startNativePush(");
    assert.match(push, /addListener\("pushNotificationActionPerformed"/);
    assert.match(push, /const path = pushTapPath\(notification\?\.data\);/);
    assert.match(read("lib/ios/native-helpers.ts"), /return sameOriginPath\(/);
  });

  it("hides the keyboard accessory bar once at launch, quietly", () => {
    const shell = fnBody(native, "export function startNativeShell(");
    assert.match(shell, /void Keyboard\.setAccessoryBarVisible\(\{ isVisible: false \}\)\.catch\(\(\) => \{\}\);/);
    assert.equal((native.match(/Keyboard\./g) ?? []).length, 1);
  });

  it("checks the plugin with Capacitor.isPluginAvailable", () => {
    assert.match(fnBody(native, "export function nativePushAvailable("), /Capacitor\.isPluginAvailable\("PushNotifications"\)/);
  });

  it("mounts the native manager only inside the app, signed in, and leaves the web push line alone", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /isNativeApp\(\) \? undefined : afterFirstIdle/);
    assert.match(shell, /isNativeApp\(\) \? afterFirstIdle\(\(\) => setIdle\(true\)\) : undefined/);
    assert.match(shell, /\{user && mode === "supabase" \? <NativePushAfterIdle key=\{user\.id\} user=\{user\} \/> : null\}/);
    assert.match(shell, /import\("@\/components\/native\/native-push-manager"\)/);
  });

  it("keeps today's note text in the gate for old builds and APNs off", () => {
    const gate = read("components/native/notifications-gate.tsx");
    assert.match(gate, /Push notifications are off in the iPhone app right now/);
    assert.match(gate, /<NativeNotificationSettings fallback=\{note\} \/>/);
    const settings = read("components/native/native-notification-settings.tsx");
    assert.match(settings, /if \(mode === "note"\) return <>\{fallback\}<\/>;/);
    assert.match(settings, /nativeSettingsMode\(\{ pluginAvailable, serverAvailable \}\)/);
  });

  it("keeps lib/ios and Capacitor out of the shared settings and the native client", () => {
    for (const path of ["components/push/notification-settings.tsx", "lib/push/native-client.ts"]) {
      const text = read(path);
      assert.doesNotMatch(text, /lib\/ios/, path);
      assert.doesNotMatch(text, /@capacitor\//, path);
    }
  });

  it("removes the token on sign-out with the session still valid", () => {
    const manager = read("components/native/native-push-manager.tsx");
    assert.match(manager, /setSignOutHook\(\(\) => forgetApnsToken\(\{ keepalive: true \}\)\)/);
    assert.doesNotMatch(manager, /requestPermissions/);
  });

  it("updates the badge in the foreground too", () => {
    const config = JSON.parse(read("ios-app/capacitor.config.json"));
    assert.deepEqual(config.plugins.PushNotifications, { presentationOptions: ["badge", "sound", "alert"] });
    assert.deepEqual(config.plugins.Keyboard, { resize: "none", style: "DEFAULT", resizeOnFullScreen: false });
  });
});

describe("iPhone app push: build 4", () => {
  it("forwards the APNs token and failures to Capacitor", () => {
    const delegate = read("ios-app/ios/App/App/AppDelegate.swift");
    assert.match(delegate, /didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data\)[\s\S]*?\.capacitorDidRegisterForRemoteNotifications, object: deviceToken\)/);
    assert.match(delegate, /didFailToRegisterForRemoteNotificationsWithError error: Error\)[\s\S]*?\.capacitorDidFailToRegisterForRemoteNotifications, object: error\)/);
  });

  it("has the push entitlement next to the associated domains", () => {
    const entitlements = read("ios-app/ios/App/App/App.entitlements");
    assert.match(entitlements, /<key>aps-environment<\/key>\s*<string>development<\/string>/);
    assert.match(entitlements, /<string>applinks:slabhold\.app<\/string>/);
  });

  it("is build 5, version 1.1.0, with no background modes", () => {
    const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");
    assert.equal((pbx.match(/CURRENT_PROJECT_VERSION = 5;/g) ?? []).length, 2);
    assert.doesNotMatch(pbx, /CURRENT_PROJECT_VERSION = (?!5;)/);
    assert.equal((pbx.match(/MARKETING_VERSION = 1\.1\.0;/g) ?? []).length, 2);
    assert.doesNotMatch(pbx, /MARKETING_VERSION = (?!1\.1\.0;)/);
    assert.doesNotMatch(read("ios-app/ios/App/App/Info.plist"), /UIBackgroundModes/);
  });

  it("adds exactly the two new plugins, pinned, in both package.json files and the SPM package", () => {
    const app = JSON.parse(read("ios-app/package.json")).dependencies;
    const web = JSON.parse(read("package.json")).dependencies;
    for (const deps of [app, web]) {
      assert.equal(deps["@capacitor/push-notifications"], "8.1.3");
      assert.equal(deps["@capacitor/keyboard"], "8.0.6");
    }
    const spm = read("ios-app/ios/App/CapApp-SPM/Package.swift");
    assert.match(spm, /\.product\(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"\)/);
    assert.match(spm, /\.product\(name: "CapacitorKeyboard", package: "CapacitorKeyboard"\)/);
  });
});
