import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PHOTO_ACCESS_ERROR, PHOTO_PICK_ERROR, photoPickFailure } from "@/lib/ios/native-helpers";
import { hideSplash } from "@/lib/ios/platform";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const g = globalThis as { window?: unknown };

describe("the camera's Info.plist keys", () => {
  it("has all 3 keys @capacitor/camera's getPhoto checks for, each with plain words", () => {
    const plist = read("ios-app/ios/App/App/Info.plist");
    // CameraPropertyListKeys in @capacitor/camera: getPhoto rejects if any one is missing.
    for (const key of ["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"]) {
      assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>[^<]+</string>`), key);
    }
    assert.match(
      plist,
      /<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>Slabhold only saves photos when you ask it to<\/string>/,
    );
  });

  it("matches the keys the installed plugin checks, so an upgrade can't add one quietly", () => {
    const types = read("ios-app/node_modules/@capacitor/camera/ios/Sources/CameraPlugin/CameraTypes.swift");
    const block = types.match(/enum CameraPropertyListKeys[^{]*\{([\s\S]*?)var link/)?.[1] ?? "";
    const keys = [...block.matchAll(/= "(NS\w+)"/g)].map((match) => match[1]);
    assert.ok(keys.length >= 3, "found the plugin's key list");
    const plist = read("ios-app/ios/App/App/Info.plist");
    for (const key of keys) assert.match(plist, new RegExp(`<key>${key}</key>`), key);
  });
});

describe("a failed photo pick", () => {
  afterEach(() => mock.restoreAll());

  it("logs the plugin's raw error and keeps the same message for the user", () => {
    const warn = mock.method(console, "warn", () => {});
    const raw = new Error("You are missing NSPhotoLibraryAddUsageDescription in your Info.plist file.");
    const failure = photoPickFailure(raw);
    assert.ok(failure);
    assert.equal(failure.message, PHOTO_PICK_ERROR);
    assert.equal(warn.mock.callCount(), 1);
    assert.ok((warn.mock.calls[0].arguments as unknown[]).includes(raw), "the raw error is logged as is");
  });

  it("logs turned-off access too, and stays quiet on Cancel", () => {
    const warn = mock.method(console, "warn", () => {});
    assert.equal(photoPickFailure(new Error("User denied access to photos"))?.message, PHOTO_ACCESS_ERROR);
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(photoPickFailure(new Error("User cancelled photos app")), null);
    assert.equal(warn.mock.callCount(), 1);
  });

  it("is what pickPhoto throws", () => {
    const native = read("lib/ios/native.ts");
    assert.match(native, /const failure = photoPickFailure\(error\);/);
    assert.match(native, /if \(failure\) throw failure;/);
  });
});

describe("a faster splash", () => {
  afterEach(() => {
    delete g.window;
  });

  it("hides the splash through the bridge, without loading any plugin code", async () => {
    const calls: unknown[] = [];
    g.window = { Capacitor: { Plugins: { SplashScreen: { hide: (options: unknown) => (calls.push(options), Promise.resolve()) } } } };
    hideSplash();
    assert.deepEqual(calls, [{ fadeOutDuration: 200 }]);
    assert.doesNotMatch(read("lib/ios/platform.ts"), /^import /m, "platform.ts imports nothing");
  });

  it("never throws, with no bridge, a throwing bridge or a rejected hide", async () => {
    g.window = {};
    assert.doesNotThrow(() => hideSplash());
    g.window = { Capacitor: { Plugins: { SplashScreen: { hide: () => { throw new Error("no"); } } } } };
    assert.doesNotThrow(() => hideSplash());
    g.window = { Capacitor: { Plugins: { SplashScreen: { hide: () => Promise.reject(new Error("no")) } } } };
    assert.doesNotThrow(() => hideSplash());
    await new Promise((resolve) => setImmediate(resolve));
  });

  it("hides it on boot before the native chunk loads", () => {
    const boot = read("components/native/native-boot.tsx");
    assert.match(boot, /if \(!isNativeApp\(\)\) return;\s*hideSplash\(\);[\s\S]*loadNative\(\)/);
  });

  it("caps the launch splash at 2.5s", () => {
    const config = JSON.parse(read("ios-app/capacitor.config.json"));
    assert.equal(config.plugins.SplashScreen.launchShowDuration, 2500);
    assert.equal(config.plugins.SplashScreen.launchAutoHide, true);
  });
});
