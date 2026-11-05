import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path));

describe("ios-app project", () => {
  it("loads slabhold.app as app.slabhold, named Slabhold", () => {
    const config = json("ios-app/capacitor.config.json");
    assert.equal(config.appId, "app.slabhold");
    assert.equal(config.appName, "Slabhold");
    assert.equal(config.server.url, "https://slabhold.app");
    assert.equal(config.server.cleartext, false);
    assert.equal(config.ios.contentInset, "never", "the web draws its own safe areas");
    assert.ok(existsSync(join(root, "ios-app/www", config.server.errorPath)), "the offline page ships in the app");
  });

  it("signs with Donnie's team, automatically, with no placeholder left", () => {
    const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");
    const teams = pbx.match(/DEVELOPMENT_TEAM = ([^;]+);/g) ?? [];
    assert.equal(teams.length, 2, "Debug and Release");
    for (const team of teams) assert.equal(team, "DEVELOPMENT_TEAM = Z45KCV676K;");
    assert.equal((pbx.match(/CODE_SIGN_STYLE = Automatic;/g) ?? []).length, 2);
    assert.match(pbx, /PRODUCT_BUNDLE_IDENTIFIER = app\.slabhold;/);
    for (const path of [
      "ios-app/capacitor.config.json",
      "ios-app/ios/App/App.xcodeproj/project.pbxproj",
      "ios-app/ios/App/App/Info.plist",
    ]) {
      assert.doesNotMatch(read(path), /TEAMID/i, path);
    }
  });

  it("pins every @capacitor package exactly, the same at the root and in ios-app", () => {
    const app = json("ios-app/package.json");
    const web = json("package.json");
    const appDeps: Record<string, string> = { ...app.dependencies, ...app.devDependencies };
    for (const [name, version] of Object.entries(appDeps)) {
      assert.match(name, /^@capacitor\//, `${name} is not a Capacitor package`);
      assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned exactly`);
      assert.match(version, /^8\./, `${name} is Capacitor 8`);
    }
    for (const [name, version] of Object.entries<string>(web.dependencies)) {
      if (!name.startsWith("@capacitor/")) continue;
      assert.equal(version, appDeps[name], `${name} matches ios-app`);
    }
  });

  it("runs on Node 22 through 26, and .nvmrc stays 22", () => {
    assert.equal(json("package.json").engines.node, ">=22 <27");
    assert.equal(json("ios-app/package.json").engines.node, ">=22 <27");
    assert.equal(read(".nvmrc").trim().replace(/^v/, "").split(".")[0], "22");
  });

  it("is an iPhone app in portrait, with an opaque 1024 icon and a dark splash", () => {
    const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");
    assert.doesNotMatch(pbx, /TARGETED_DEVICE_FAMILY = "1,2"/);
    const plist = read("ios-app/ios/App/App/Info.plist");
    assert.match(plist, /<string>arm64<\/string>/);
    assert.doesNotMatch(plist, /armv7/);
    const icon = readFileSync(join(root, "ios-app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
    assert.equal(icon.readUInt32BE(16), 1024, "width");
    assert.equal(icon.readUInt32BE(20), 1024, "height");
    assert.equal(icon[25], 2, "PNG colour type 2: RGB, no alpha");
    const storyboard = read("ios-app/ios/App/App/Base.lproj/LaunchScreen.storyboard");
    assert.doesNotMatch(storyboard, /systemBackgroundColor/, "the launch screen is #09090B, not white");
  });

  it("stays out of the web build's type check", () => {
    assert.ok(json("tsconfig.json").exclude.includes("ios-app"));
  });
});
