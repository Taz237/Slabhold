import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(root, dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(relative(root, path)));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(root, path));
  }
  return out;
}

const APP = "ios-app/ios/App/App";

describe("build 4: version and project", () => {
  const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");

  it("has one version in Debug and Release (now 1.1.0, build 5)", () => {
    assert.equal(count(pbx, /MARKETING_VERSION = 1\.1\.0;/g), 2);
    assert.equal(count(pbx, /CURRENT_PROJECT_VERSION = 5;/g), 2);
    assert.match(read(`${APP}/Info.plist`), /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/);
  });

  for (const file of ["SlabholdNativePlugin.swift", "SlabholdBridgeViewController.swift"]) {
    it(`builds ${file} in the App target`, () => {
      assert.ok(existsSync(join(root, APP, file)));
      const ref = pbx.match(new RegExp(`(\\w+) /\\* ${file.replace(".", "\\.")} \\*/ = \\{isa = PBXFileReference; lastKnownFileType = sourcecode\\.swift; path = ${file.replace(".", "\\.")}; sourceTree = "<group>"; \\};`));
      assert.ok(ref, "file reference");
      assert.match(pbx, new RegExp(`/\\* ${file.replace(".", "\\.")} in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref[1]} `));
      const phase = pbx.slice(pbx.indexOf("/* Begin PBXSourcesBuildPhase section */"), pbx.indexOf("/* End PBXSourcesBuildPhase section */"));
      assert.match(phase, new RegExp(`${file.replace(".", "\\.")} in Sources`));
      const group = pbx.slice(pbx.indexOf("504EC3061FED79650016851F /* App */ = {"));
      assert.match(group.slice(0, group.indexOf("};")), new RegExp(`${ref[1]} /\\* ${file.replace(".", "\\.")} \\*/`));
    });
  }

  it("loads our bridge view controller from the scene and the storyboard", () => {
    const scene = read(`${APP}/SceneDelegate.swift`);
    assert.match(scene, /window\?\.rootViewController = SlabholdBridgeViewController\(\)/);
    assert.doesNotMatch(scene, /= CAPBridgeViewController\(\)/);
    const storyboard = read(`${APP}/Base.lproj/Main.storyboard`);
    assert.match(storyboard, /customClass="SlabholdBridgeViewController" customModule="App" customModuleProvider="target"/);
    assert.doesNotMatch(storyboard, /customClass="CAPBridgeViewController"/);
    const bridge = read(`${APP}/SlabholdBridgeViewController.swift`);
    assert.match(bridge, /class SlabholdBridgeViewController: CAPBridgeViewController/);
    assert.match(bridge, /override open func capacitorDidLoad\(\) \{\s*bridge\?\.registerPluginInstance\(SlabholdNativePlugin\(\)\)/);
  });

  it("asks StoreKit for a review and sets the badge, iOS 15 and 16+", () => {
    const plugin = read(`${APP}/SlabholdNativePlugin.swift`);
    assert.match(plugin, /class SlabholdNativePlugin: CAPPlugin, CAPBridgedPlugin/);
    assert.match(plugin, /identifier = "SlabholdNativePlugin"/);
    assert.match(plugin, /jsName = "SlabholdNative"/);
    assert.match(plugin, /import StoreKit/);
    assert.match(plugin, /SKStoreReviewController\.requestReview\(in: scene\)/);
    assert.match(plugin, /activationState == \.foregroundActive/);
    assert.match(plugin, /call\.resolve\(\["asked": false\]\)/);
    assert.match(plugin, /setBadgeCount\(count\)/);
    assert.match(plugin, /applicationIconBadgeNumber = count/);
    assert.match(plugin, /max\(0, call\.getInt\("count"\) \?\? 0\)/);
    assert.doesNotMatch(plugin, /call\.reject/, "never rejects");
  });

  it("needs no entitlement or privacy-manifest change for StoreKit", () => {
    assert.doesNotMatch(read(`${APP}/App.entitlements`), /storekit/i);
    assert.doesNotMatch(read(`${APP}/PrivacyInfo.xcprivacy`), /storekit/i);
  });
});

describe("build 4: the web side stays web-safe", () => {
  it("keeps every Capacitor import in lib/ios/native.ts, and review.ts imports only the platform door", () => {
    for (const path of [...sources("app"), ...sources("components"), ...sources("lib")]) {
      if (path === "lib/ios/native.ts") continue;
      assert.doesNotMatch(read(path), /from ["']@capacitor\//, path);
    }
    const review = read("lib/ios/review.ts");
    const imports = [...review.matchAll(/^import (type )?[^;]* from "([^"]+)";/gm)];
    assert.deepEqual(
      imports.filter((match) => !match[1]).map((match) => match[2]),
      ["@/lib/ios/platform"],
    );
    assert.match(review, /if \(!isNativeApp\(\)\) return;/);
    assert.match(review, /\.catch\(\(\) => \{\}\)/);
    assert.doesNotMatch(read("lib/ios/review-prompt.ts"), /@capacitor|^import /m);
  });

  it("registers the plugin and checks it before every call", () => {
    const native = read("lib/ios/native.ts");
    assert.match(native, /registerPlugin<SlabholdNativePlugin>\("SlabholdNative"\)/);
    assert.match(native, /Capacitor\.isPluginAvailable\("SlabholdNative"\)/);
    for (const fn of ["requestNativeReview", "askNativeReview", "setNativeBadge"]) {
      const start = native.indexOf(`export async function ${fn}(`);
      assert.ok(start >= 0, fn);
      assert.match(native.slice(start, native.indexOf("\n}\n", start)), /if \(!nativeExtrasAvailable\(\)\) return/, fn);
    }
    assert.match(native, /countLaunch\(window\.localStorage, window\.sessionStorage\)/);
  });

  it("asks from exactly two places, once each", () => {
    const callers = [...sources("app"), ...sources("components"), ...sources("lib")].filter(
      (path) => path !== "lib/ios/review.ts" && /askForReview\(/.test(read(path)),
    );
    assert.deepEqual(callers.sort(), ["components/card-form.tsx", "components/quick-comp/quick-comp-result.tsx"]);
    const form = read("components/card-form.tsx");
    assert.equal(count(form, /askForReview\(/g), 1);
    assert.match(form, /if \(!existing && knownCards\.filter\(\(item\) => item\.id !== card\.id\)\.length \+ 1 >= 3\) askForReview\("third-card"\);/);
    // After the save resolves, not before.
    assert.ok(form.indexOf('askForReview("third-card")') > form.indexOf("await saved;"));
    const comp = read("components/quick-comp/quick-comp-result.tsx");
    assert.equal(count(comp, /askForReview\(/g), 1);
    assert.match(comp, /const reviewKey = empty \|\| payload\.sample \? null :/);
    assert.match(comp, /if \(reviewKey\) askForReview\("first-quick-comp"\);/);
  });

  it("leaves the landing demo and web push alone", () => {
    for (const path of [...sources("components/landing"), ...sources("components/push")]) {
      assert.doesNotMatch(read(path), /lib\/ios\/review|askForReview|setNativeBadge/, path);
    }
  });

  const stats = join(root, ".next/diagnostics/route-bundle-stats.json");
  it("ships no plugin code in any route's first-load chunks", { skip: existsSync(stats) ? false : "run npm run build first" }, () => {
    const routes: { route: string; firstLoadChunkPaths: string[] }[] = JSON.parse(readFileSync(stats, "utf8"));
    assert.ok(routes.length > 0);
    const seen = new Set<string>();
    for (const { route, firstLoadChunkPaths } of routes) {
      for (const chunk of firstLoadChunkPaths) {
        if (seen.has(chunk)) continue;
        seen.add(chunk);
        const text = readFileSync(join(root, chunk), "utf8");
        assert.doesNotMatch(text, /SlabholdNative/, `${route}: ${chunk}`);
        assert.doesNotMatch(text, /isPluginAvailable|requestReview|setBadge\(/, `${route}: ${chunk}`);
      }
    }
  });
});
