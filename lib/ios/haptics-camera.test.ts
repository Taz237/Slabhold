import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { haptic } from "@/lib/ios/haptics";
import { usesNativePicker } from "@/lib/ios/camera";
import { PHOTO_ACCESS_ERROR, photoFile, pickError } from "@/lib/ios/native-helpers";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const g = globalThis as { window?: unknown };

describe("haptics", () => {
  afterEach(() => {
    delete g.window;
  });

  it("does nothing on the web", () => {
    g.window = {};
    assert.doesNotThrow(() => haptic("like"));
  });

  it("fires on Like and after a post, loading the plugin only on use", () => {
    assert.match(read("components/tweet.tsx"), /if \(!liked\) haptic\("like"\)/);
    assert.match(read("components/social-provider.tsx"), /haptic\("post"\)/);
    assert.match(read("lib/ios/haptics.ts"), /loadNative\(\)/);
    assert.match(read("lib/ios/native.ts"), /Haptics\.impact\(\{ style: ImpactStyle\.Light \}\)/);
  });
});

describe("Add card photos in the app", () => {
  afterEach(() => {
    delete g.window;
  });

  it("uses the native picker only in the app", () => {
    g.window = {};
    assert.equal(usesNativePicker(), false);
    g.window = { Capacitor: { isNativePlatform: () => true } };
    assert.equal(usesNativePicker(), true);
  });

  it("turns the plugin's data URL into a File the form can read", async () => {
    const file = photoFile({ dataUrl: "data:image/jpeg;base64,/9j/AA==", format: "jpeg" });
    assert.ok(file);
    assert.equal(file.type, "image/jpeg");
    assert.equal(file.name, "card.jpg");
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [0xff, 0xd8, 0xff, 0x00]);
    assert.equal(photoFile({ format: "jpeg" }), null);
  });

  it("treats Cancel as no photo and names turned-off access", () => {
    assert.equal(pickError(new Error("User cancelled photos app")), "cancelled");
    assert.equal(pickError(new Error("User denied access to camera")), "denied");
    assert.equal(pickError(new Error("User denied access to photos")), "denied");
    assert.equal(pickError(new Error("No image")), "failed");
    assert.doesNotMatch(PHOTO_ACCESS_ERROR, /!/);
  });

  it("takes photos and picks from the library with the native picker on Add card", () => {
    const form = read("components/card-form.tsx");
    assert.match(form, /usesNativePicker\(\)/);
    assert.match(form, /pickNativePhoto\("camera"\)/);
    assert.match(form, /pickNativePhoto\("library"\)/);
    assert.match(read("lib/ios/camera.ts"), /\(await loadNative\(\)\)\.pickPhoto\(source\)/);
    assert.match(read("lib/ios/native.ts"), /resultType: CameraResultType\.DataUrl/);
  });

  it("asks for camera and photo access in plain words", () => {
    const plist = read("ios-app/ios/App/App/Info.plist");
    assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
    assert.match(plist, /<key>NSPhotoLibraryUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  });
});
