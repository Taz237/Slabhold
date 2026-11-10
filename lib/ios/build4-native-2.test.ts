import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
const APP = "ios-app/ios/App/App";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(root, dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(relative(root, path)));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(root, path));
  }
  return out;
}

describe("build 4 part 2: same version, same entitlements", () => {
  it("is still version 1.0.1, build 4", () => {
    const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");
    assert.equal(count(pbx, /MARKETING_VERSION = 1\.0\.1;/g), 2);
    assert.equal(count(pbx, /CURRENT_PROJECT_VERSION = 4;/g), 2);
    assert.equal(count(pbx, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g), 2);
  });

  it("links and passwords for slabhold.app only, no www (it has no valid certificate)", () => {
    const entitlements = read(`${APP}/App.entitlements`);
    const domains = [...entitlements.matchAll(/<string>((?:applinks|webcredentials):[^<]+)<\/string>/g)].map((m) => m[1]);
    assert.deepEqual(domains, ["applinks:slabhold.app", "webcredentials:slabhold.app"]);
    assert.doesNotMatch(entitlements, /(applinks|webcredentials):www\./);
  });

  it("can save shared images to Photos (Save Image) with the key already there", () => {
    assert.match(read(`${APP}/Info.plist`), /<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  });
});

describe("build 4 part 2: shareFiles in our plugin", () => {
  const plugin = read(`${APP}/SlabholdNativePlugin.swift`);

  it("is listed in pluginMethods", () => {
    const methods = plugin.slice(plugin.indexOf("pluginMethods"), plugin.indexOf("\n    ]", plugin.indexOf("pluginMethods")));
    assert.match(methods, /CAPPluginMethod\(name: "shareFiles", returnType: CAPPluginReturnPromise\)/);
    assert.match(methods, /"requestReview"/);
    assert.match(methods, /"setBadge"/);
  });

  it("shows the iOS share sheet, anchored for iPad, and never rejects", () => {
    assert.match(plugin, /@objc func shareFiles\(_ call: CAPPluginCall\)/);
    assert.match(plugin, /UIActivityViewController\(activityItems:/);
    assert.match(plugin, /popoverPresentationController/);
    assert.match(plugin, /sourceRect/);
    assert.match(plugin, /UIImage\(data: data\)/);
    assert.match(plugin, /temporaryDirectory\.appendingPathComponent\("slabhold-share"/);
    assert.match(plugin, /10 \* 1024 \* 1024/);
    assert.match(plugin, /completionWithItemsHandler/);
    assert.match(plugin, /DispatchQueue\.main\.async/);
    const share = plugin.slice(plugin.indexOf("func shareFiles"));
    assert.doesNotMatch(share, /call\.reject/);
  });
});

describe("build 4 part 2: web code stays plugin free", () => {
  it("imports @capacitor/* only in lib/ios/native.ts", () => {
    for (const path of [...sources("app"), ...sources("components"), ...sources("lib")]) {
      if (path === join("lib", "ios", "native.ts")) continue;
      assert.doesNotMatch(read(path), /from ["']@capacitor\//, path);
    }
  });

  it("shareImage loads native code only through loadNative", () => {
    const helper = read("lib/share/share-image.ts");
    assert.doesNotMatch(helper, /@capacitor/);
    assert.doesNotMatch(helper, /from "@\/lib\/ios\/native"/);
    assert.match(helper, /import \{ isNativeApp, loadNative \} from "@\/lib\/ios\/platform";/);
  });

  it("native.ts has the file share", () => {
    const native = read("lib/ios/native.ts");
    assert.match(native, /export function nativeShareFilesAvailable\(\): boolean \{\s*return nativeExtrasAvailable\(\);/);
    assert.match(native, /export async function shareFilesNative\(/);
    assert.match(native, /SlabholdNative\.shareFiles\(/);
  });
});

describe("build 4 part 2: haptic call sites", () => {
  const sites: [string, string, RegExp][] = [
    ["components/card-form.tsx", "save", /await saved;\n\s*if \(!existing\) haptic\("save"\);/],
    ["components/follow-button.tsx", "follow", /if \(busy\.current\) return;\n\s*if \(!following\) haptic\("follow"\);/],
    ["components/message-thread.tsx", "send", /haptic\("send"\);\n\s*setSettled\(\[outgoing\.content\]\);/],
    ["components/pull-to-refresh.tsx", "refresh", /navigator\.vibrate\(8\);\n\s*haptic\("refresh"\);/],
    ["components/charts/value-chart-scrub.ts", "tick", /haptic\("tick"\);\n\s*navigator\.vibrate\?\.\(4\);/],
  ];
  for (const [path, moment, placed] of sites) {
    it(`${path}: one haptic("${moment}") in the right place`, () => {
      const source = read(path);
      assert.equal(count(source, /haptic\("/g), 1);
      assert.match(source, placed);
      assert.match(source, /import \{ haptic \} from "@\/lib\/ios\/haptics";/);
    });
  }

  it("leaves social-provider alone", () => {
    assert.doesNotMatch(read("components/social-provider.tsx"), /haptic/);
  });
});

describe("build 4 part 2: one share path", () => {
  it("link shares in share-sheet use shareFunction()", () => {
    assert.match(read("components/share-sheet.tsx"), /shareFunction\(\)/);
  });

  for (const path of ["components/collection-value-share.ts", "components/invite/share-collection-card.tsx"]) {
    it(`${path} shares its image through shareImage`, () => {
      const source = read(path);
      assert.match(source, /shareImage\(/);
      assert.doesNotMatch(source, /navigator\.share\(/);
      assert.doesNotMatch(source, /storySaveMethod/);
    });
  }
});
