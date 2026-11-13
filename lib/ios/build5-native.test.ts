import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pluginHasMethod } from "./native-helpers";
import { scanOutcomeFrom } from "./scanner";

/**
 * Build 5's native changes. There is no Swift toolchain in CI, so these read
 * the Swift source and keep it in step with the web side. Xcode builds it.
 */

const root = process.cwd();
const APP = "ios-app/ios/App/App";

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const nativePlugin = read(`${APP}/SlabholdNativePlugin.swift`);
const scannerPlugin = read(`${APP}/SlabholdScannerPlugin.swift`);
const camera = read(`${APP}/CardScannerViewController.swift`);
const native = read("lib/ios/native.ts");

describe("build 5: camera turned off", () => {
  it("the scanner still says denied, and the web side no longer drops it", () => {
    assert.match(scannerPlugin, /call\.resolve\(\["cancelled": true, "denied": true\]\)/);
    assert.equal(scanOutcomeFrom({ cancelled: true, denied: true }), "denied");
    assert.equal(scanOutcomeFrom({ cancelled: true }), null);
    assert.equal(scanOutcomeFrom({ cancelled: true, denied: "yes" }), null);
    assert.equal(scanOutcomeFrom(null), null);
    const read = scanOutcomeFrom({ lines: ["LUKA DONCIC"], denied: true });
    assert.ok(read && read !== "denied", "a real read is never thrown away");
    assert.match(native, /scanOutcomeFrom\(await SlabholdScanner\.scanCard\(/);
  });

  it("our plugin opens the app's page in Settings", () => {
    const methods = nativePlugin.slice(nativePlugin.indexOf("pluginMethods"), nativePlugin.indexOf("\n    ]", nativePlugin.indexOf("pluginMethods")));
    assert.match(methods, /CAPPluginMethod\(name: "openSettings", returnType: CAPPluginReturnPromise\)/);
    assert.match(nativePlugin, /@objc func openSettings\(_ call: CAPPluginCall\)/);
    const body = nativePlugin.slice(nativePlugin.indexOf("func openSettings"), nativePlugin.indexOf("func shareFiles"));
    assert.match(body, /UIApplication\.openSettingsURLString/);
    assert.match(body, /DispatchQueue\.main\.async/);
    assert.doesNotMatch(body, /call\.reject/, "never rejects");
  });

  it("the web only offers it when this build's plugin has the method (build 4 doesn't)", () => {
    const build4 = [{ name: "SlabholdNative", methods: [{ name: "requestReview" }, { name: "setBadge" }, { name: "shareFiles" }] }];
    const build5 = [{ name: "SlabholdNative", methods: [...build4[0].methods, { name: "openSettings" }] }];
    assert.equal(pluginHasMethod(build4, "SlabholdNative", "openSettings"), false);
    assert.equal(pluginHasMethod(build5, "SlabholdNative", "openSettings"), true);
    assert.equal(pluginHasMethod(build5, "SlabholdScanner", "openSettings"), false);
    for (const junk of [undefined, null, "x", [null], [{ name: "SlabholdNative" }], [{ name: "SlabholdNative", methods: "openSettings" }]]) {
      assert.equal(pluginHasMethod(junk, "SlabholdNative", "openSettings"), false);
    }
    assert.match(native, /export function appSettingsAvailable\(\): boolean/);
    assert.match(native, /pluginHasMethod\([^)]*"SlabholdNative", "openSettings"\)/);
    assert.match(native, /SlabholdNative\.openSettings\(\)/);
  });
});

describe("build 5: the camera survives a phone call or a trip to the background", () => {
  it("listens for runtime errors and interruptions on its own session", () => {
    for (const name of ["runtimeErrorNotification", "wasInterruptedNotification", "interruptionEndedNotification"]) {
      assert.match(camera, new RegExp(`name: AVCaptureSession\\.${name}, object: session\\)`));
    }
  });

  it("starts the camera again, and closes with the read-failed message when it won't", () => {
    const restart = camera.slice(camera.indexOf("private func restartSession()"));
    const body = restart.slice(0, restart.indexOf("\n    }\n"));
    assert.match(body, /session\.startRunning\(\)/);
    assert.match(body, /self\.end\(\.failed\(/);
    // A restart that keeps failing must not loop.
    assert.match(camera, /static let restartGap: TimeInterval = \d/);
    // The plugin rejects a failure, and the hub shows HUB_COPY.readFailed for a rejection.
    assert.match(scannerPlugin, /case \.failed\(let message\):\s*call\.reject\(message\)/);
  });

  it("never asks a stopped camera for a photo (that crashes)", () => {
    const capture = camera.slice(camera.indexOf("private func capture()"));
    const body = capture.slice(0, capture.indexOf("\n    }\n"));
    assert.match(body, /guard cameraReady else \{\s*couldNotRead\(\)\s*return\s*\}/);
    assert.ok(body.indexOf("guard cameraReady") < body.indexOf("photoOutput.capturePhoto("));
  });

  it("still takes a picture only on a tap", () => {
    assert.equal(camera.match(/photoOutput\.capturePhoto\(/g)?.length, 1);
    assert.equal(camera.match(/[^a-zA-Z]capture\(\)/g)?.length, 2, "one definition, one call: the shutter");
    assert.match(camera, /@objc private func shutterTapped\(\) \{\s*capture\(\)\s*\}/);
  });
});

describe("build 5: glass buttons on iOS 26", () => {
  it("uses the system glass only inside an availability check, with today's style below", () => {
    const uses = [...camera.matchAll(/UIButton\.Configuration\.glass\(\)/g)];
    assert.ok(uses.length >= 1);
    for (const use of uses) {
      const before = camera.slice(0, use.index);
      const check = before.lastIndexOf("if #available(iOS 26.0, *) {");
      assert.ok(check >= 0 && before.slice(check).split("\n").length <= 3, "glass() sits right under its #available");
    }
    assert.match(camera, /\} else \{\s*button\.setImage\([\s\S]*?button\.backgroundColor = UIColor\.black\.withAlphaComponent\(0\.4\)/);
  });

  it("keeps the shutter and the 44pt targets", () => {
    assert.match(camera, /shutterButton\.backgroundColor = Self\.offWhite/);
    assert.match(camera, /static let minTapTarget: CGFloat = 44/);
  });
});

describe("build 5: Info.plist and version", () => {
  it("ends every purpose string with a period", () => {
    const plist = read(`${APP}/Info.plist`);
    const strings = [...plist.matchAll(/<key>NS\w+UsageDescription<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => m[1]);
    assert.equal(strings.length, 3);
    for (const text of strings) assert.match(text, /\.$/, text);
  });

  it("leaves the version and build number alone", () => {
    const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");
    assert.deepEqual([...new Set(pbx.match(/MARKETING_VERSION = [^;]+/g))], ["MARKETING_VERSION = 1.0.1"]);
    assert.deepEqual([...new Set(pbx.match(/CURRENT_PROJECT_VERSION = [^;]+/g))], ["CURRENT_PROJECT_VERSION = 4"]);
  });
});
