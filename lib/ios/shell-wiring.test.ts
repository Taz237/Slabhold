import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(root, dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(relative(root, path)));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(root, path));
  }
  return out;
}

describe("native shell wiring", () => {
  it("boots from the root layout, so signed-out Home gets it too", () => {
    assert.match(read("app/layout.tsx"), /<NativeBoot \/>/);
  });

  it("loads the native code only inside the app", () => {
    const boot = read("components/native/native-boot.tsx");
    assert.match(boot, /if \(!isNativeApp\(\)\) return;/);
    assert.match(boot, /loadNative\(\)/);
    assert.match(read("lib/ios/platform.ts"), /return import\("@\/lib\/ios\/native"\);/);
  });

  it("keeps every Capacitor import in lib/ios/native.ts, which nothing imports statically", () => {
    const files = [...sources("app"), ...sources("components"), ...sources("lib")];
    for (const path of files) {
      const text = read(path);
      if (path !== "lib/ios/native.ts") {
        assert.doesNotMatch(text, /from ["']@capacitor\//, `${path} imports a plugin`);
        assert.doesNotMatch(text, /^import [^;]*["']@\/lib\/ios\/native["']/m, `${path} imports native.ts statically`);
      }
    }
    const native = read("lib/ios/native.ts");
    for (const plugin of ["app", "browser", "camera", "haptics", "share", "splash-screen", "status-bar"]) {
      assert.match(native, new RegExp(`from "@capacitor/${plugin}"`), plugin);
    }
  });

  it("hides the splash, follows universal links and opens other sites in the in-app browser", () => {
    const native = read("lib/ios/native.ts");
    assert.match(native, /SplashScreen\.hide/);
    assert.match(native, /addListener\("appUrlOpen"/);
    assert.match(native, /getLaunchUrl/);
    assert.match(native, /Browser\.open/);
    assert.match(native, /window\.open = /);
  });

  it("gives the app the standalone back swipe and keeps web push out of it", () => {
    assert.match(read("components/nav-motion.tsx"), /\|\| isNativeApp\(\)/);
    assert.match(read("components/app-shell.tsx"), /isNativeApp\(\) \? undefined : afterFirstIdle/);
  });
});
