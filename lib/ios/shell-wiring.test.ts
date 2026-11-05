import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("native shell wiring", () => {
  it("boots from the root layout, so signed-out Home gets it too", () => {
    const layout = read("app/layout.tsx");
    assert.match(layout, /<NativeBoot \/>/);
  });

  it("loads the shell only inside the app, by dynamic import", () => {
    const boot = read("components/native/native-boot.tsx");
    assert.match(boot, /if \(!isNativeApp\(\)\) return;/);
    assert.match(boot, /import\("@\/lib\/ios\/shell"\)/);
    assert.doesNotMatch(boot, /^import .*(@capacitor|ios\/shell)/m);
  });

  it("never imports a Capacitor package statically outside the shell's own dynamic imports", () => {
    for (const path of [
      "lib/ios/platform.ts",
      "lib/ios/links.ts",
      "lib/ios/shell.ts",
      "components/native/native-boot.tsx",
      "components/nav-motion.tsx",
      "components/app-shell.tsx",
    ]) {
      assert.doesNotMatch(read(path), /^import[^;]*["']@capacitor\//m, path);
    }
    const shell = read("lib/ios/shell.ts");
    for (const plugin of ["splash-screen", "status-bar", "app", "browser"]) {
      assert.match(shell, new RegExp(`import\\("@capacitor/${plugin}"\\)`), plugin);
    }
  });

  it("hides the splash, follows universal links and opens other sites in the in-app browser", () => {
    const shell = read("lib/ios/shell.ts");
    assert.match(shell, /SplashScreen\.hide/);
    assert.match(shell, /addListener\("appUrlOpen"/);
    assert.match(shell, /getLaunchUrl/);
    assert.match(shell, /Browser\.open/);
    assert.match(shell, /window\.open = /);
  });

  it("gives the app the standalone back swipe and keeps web push out of it", () => {
    assert.match(read("components/nav-motion.tsx"), /\|\| isNativeApp\(\)/);
    assert.match(read("components/app-shell.tsx"), /isNativeApp\(\) \? undefined : afterFirstIdle/);
  });
});
