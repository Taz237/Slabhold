import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TEXT_SCALE_SCRIPT, isBigText, textScalePercent } from "./text-scale";

describe("textScalePercent", () => {
  it("leaves the page alone at the default iPhone text size", () => {
    assert.equal(textScalePercent(17), null);
  });

  it("follows the iPhone text size up and down", () => {
    assert.equal(textScalePercent(23), 135.29);
    assert.equal(textScalePercent(14), 82.35);
    assert.equal(textScalePercent(34), 200);
  });

  it("stops at 200%, the size every screen is checked at", () => {
    assert.equal(textScalePercent(53), 200);
  });

  it("ignores a reading that makes no sense", () => {
    assert.equal(textScalePercent(0), null);
    assert.equal(textScalePercent(Number.NaN), null);
  });
});

describe("isBigText", () => {
  it("is off on every phone at the default size, down to 320px", () => {
    assert.equal(isBigText(390, 16), false);
    assert.equal(isBigText(320, 16), false);
  });

  it("is on once the screen is under 20rem across", () => {
    assert.equal(isBigText(390, 32), true);
    assert.equal(isBigText(390, 21.65), true);
    assert.equal(isBigText(390, 19), false);
  });
});

type FakeEnv = { ua: string; touch: number; supports: boolean; bodyPx: number; rootPx?: number; width?: number };

function run(env: FakeEnv): { fontSize: string; big: boolean } {
  const attrs = new Set<string>();
  const root = {
    style: { fontSize: "" },
    clientWidth: env.width ?? 390,
    appendChild() {},
    setAttribute: (name: string) => void attrs.add(name),
    removeAttribute: (name: string) => void attrs.delete(name),
  };
  const probe = { style: { cssText: "" }, remove() {} };
  const document = {
    documentElement: root,
    body: null,
    hidden: false,
    createElement: () => probe,
    addEventListener() {},
  };
  const CSS = { supports: () => env.supports };
  const window = { addEventListener() {}, innerWidth: env.width ?? 390, CSS };
  const navigator = { userAgent: env.ua, maxTouchPoints: env.touch };
  // The root's own size: what the script set, or the browser's setting.
  const rootPx = () => (root.style.fontSize ? (16 * parseFloat(root.style.fontSize)) / 100 : (env.rootPx ?? 16));
  const getComputedStyle = (el: unknown) => ({ fontSize: `${el === root ? rootPx() : env.bodyPx}px` });
  new Function("window", "document", "navigator", "CSS", "getComputedStyle", TEXT_SCALE_SCRIPT)(window, document, navigator, CSS, getComputedStyle);
  return { fontSize: root.style.fontSize, big: attrs.has("data-big-text") };
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15)";

describe("TEXT_SCALE_SCRIPT", () => {
  it("sizes the root from the iPhone text size", () => {
    assert.equal(run({ ua: IPHONE, touch: 5, supports: true, bodyPx: 23 }).fontSize, "135.29%");
    assert.equal(run({ ua: IPHONE, touch: 5, supports: true, bodyPx: 53 }).fontSize, "200%");
  });

  it("changes nothing at the default size", () => {
    assert.deepEqual(run({ ua: IPHONE, touch: 5, supports: true, bodyPx: 17 }), { fontSize: "", big: false });
  });

  it("covers an iPad that says it is a Mac, and leaves a real Mac alone", () => {
    assert.equal(run({ ua: MAC, touch: 5, supports: true, bodyPx: 23 }).fontSize, "135.29%");
    assert.equal(run({ ua: MAC, touch: 0, supports: true, bodyPx: 13, width: 1280 }).fontSize, "");
  });

  it("leaves the root to the browser's own setting everywhere else", () => {
    assert.equal(run({ ua: ANDROID, touch: 5, supports: false, bodyPx: 16 }).fontSize, "");
  });

  it("turns big-text mode on at large sizes, on any device", () => {
    assert.equal(run({ ua: IPHONE, touch: 5, supports: true, bodyPx: 34 }).big, true);
    assert.equal(run({ ua: IPHONE, touch: 5, supports: true, bodyPx: 19 }).big, false);
    assert.equal(run({ ua: ANDROID, touch: 5, supports: false, bodyPx: 16, rootPx: 32 }).big, true);
    assert.equal(run({ ua: ANDROID, touch: 5, supports: false, bodyPx: 16, rootPx: 16 }).big, false);
  });
});

describe("text size in the styles", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  it("never pins the root or form text to a pixel size", () => {
    assert.doesNotMatch(css, /html\s*\{[^}]*font-size:\s*\d+px/);
    assert.doesNotMatch(css, /textarea\s*\{\s*font-size:\s*16px/);
  });

  it("has the big-text variant, and lets cut-off names wrap in it", () => {
    assert.match(css, /@custom-variant big \(&:where\(\[data-big-text\] \*\)\);/);
    assert.match(css, /\[data-big-text\] \.truncate/);
  });

  it("defines every text-N size class the screens use, in rem", () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(join(process.cwd(), dir))) {
        const path = join(dir, name);
        if (statSync(join(process.cwd(), path)).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          for (const match of readFileSync(join(process.cwd(), path), "utf8").matchAll(/(?<![\w-])text-(\d+)(?![\w.[-])/g)) used.add(match[1]);
        }
      }
    };
    for (const dir of ["app", "components", "lib"]) walk(dir);
    assert.ok(used.size >= 6, "the screens use the size classes");
    for (const size of used) {
      const rule = css.match(new RegExp(`@utility text-${size} \\{\\s*font-size: ([\\d.]+)rem;`));
      assert.ok(rule, `@utility text-${size} is defined`);
      assert.equal(Number(rule[1]) * 16, Number(size), `text-${size} is ${size}px at the default text size`);
    }
  });

  it("runs the script from the root layout", () => {
    const layout = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");
    assert.match(layout, /TEXT_SCALE_SCRIPT/);
  });
});
