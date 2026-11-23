import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => `${dir}/${name}`);
}

/** Every file the signed-out landing page is built from, and its styles. */
const LANDING_FILES = [
  "components/landing-page.tsx",
  ...sources("components/landing"),
  ...sources("lib/landing"),
  "app/landing.css",
  "app/welcome/page.tsx",
  "public/landing/README.md",
  "public/landing/screens/README.md",
];

/** The files the rebuild wrote: the ones every color is checked in. */
const REBUILT = [
  "app/landing.css",
  "components/landing-page.tsx",
  "components/landing/sections.tsx",
  "components/landing/landing-timeline.tsx",
  "components/landing/screen-clip.tsx",
  "components/landing/app-store-badge.tsx",
  "components/landing/landing-links.tsx",
  "lib/landing/media.ts",
  "lib/landing/timeline.ts",
  "lib/landing/timeline-load.ts",
  "lib/landing/seo.ts",
];

/** Hue in degrees and saturation (0 to 1) of an RGB color. */
function hueOf(r: number, g: number, b: number): { hue: number; saturation: number; lightness: number } {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  hue *= 60;
  return { hue: hue < 0 ? hue + 360 : hue, saturation, lightness };
}

/** Every color written in a source: #rgb, #rrggbb(aa) and rgb()/rgba(). */
function colorsIn(source: string): { text: string; rgb: [number, number, number] }[] {
  const found: { text: string; rgb: [number, number, number] }[] = [];
  for (const match of source.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1].slice(0, 6);
    found.push({ text: match[0], rgb: [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number] });
  }
  for (const match of source.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/g)) {
    found.push({ text: match[0], rgb: [Number(match[1]), Number(match[2]), Number(match[3])] });
  }
  return found;
}

describe("landing rebuild: purple only", () => {
  it("has no teal in any landing file or its styles", () => {
    const teal = /teal|#(?:34C1AE|2dd4bf|14b8a6|0d9488|5eead4|1f9e8c|0f766e|99f6e4|ccfbf1)\b|cyan-|emerald-/i;
    for (const file of new Set([...LANDING_FILES, ...REBUILT, "components/og-frame.tsx"])) assert.doesNotMatch(read(file), teal, file);
    assert.equal(existsSync(join(ROOT, "public/landing/sample-raw-card.svg")), false);
  });

  it("uses no color with a hue between 160 and 200 degrees in the rebuilt files", () => {
    let seen = 0;
    for (const file of REBUILT) {
      for (const color of colorsIn(read(file))) {
        seen += 1;
        const { hue, saturation, lightness } = hueOf(...color.rgb);
        // Greys, black and white have no hue to speak of.
        if (saturation < 0.08 || lightness < 0.03 || lightness > 0.97) continue;
        assert.ok(hue < 160 || hue > 200, `${file}: ${color.text} has hue ${Math.round(hue)}`);
      }
    }
    assert.ok(seen >= 8, "the colors were found");
    assert.deepEqual(Math.round(hueOf(0x34, 0xc1, 0xae).hue), 172, "the check knows teal when it sees it");
    assert.deepEqual(Math.round(hueOf(0x7c, 0x3a, 0xed).hue), 262);
  });

  it("styles the page from the allowed tokens only: two darks, purple, the accent and the ink", () => {
    const css = read("app/landing.css");
    const hexes = new Set([...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase()));
    assert.deepEqual([...hexes].sort(), ["#07050d", "#0e0a1a", "#7c3aed", "#a78bfa", "#a78bfa22", "#a78bfa55", "#f4f4f5"]);
    const rgbs = new Set([...css.matchAll(/rgba?\([^)]*\)/g)].map((match) => match[0]));
    assert.deepEqual([...rgbs], ["rgba(244, 244, 245, 0.68)"]);
  });
});

describe("landing rebuild: flat, solid and still", () => {
  it("has no galaxy, gradient, blur, glow, glass, shadow, tilt or perspective in its styles", () => {
    const css = read("app/landing.css");
    assert.doesNotMatch(css, /gradient\(/);
    assert.doesNotMatch(css, /backdrop-filter|filter:|blur\(/);
    assert.doesNotMatch(css, /box-shadow|text-shadow|drop-shadow/);
    assert.doesNotMatch(css, /perspective|rotate|skew|translate|scale\(|transform/);
    assert.doesNotMatch(css, /@keyframes|animation|view-timeline/);
    assert.doesNotMatch(css, /galaxy|glass|glow|shard|sheen|specular|\.lg-/);
    assert.doesNotMatch(css, /border-radius: (999|9999)px|border-radius: 100px/, "no pills");
    for (const file of sources("components/landing").filter((file) => !file.includes("/showcase/"))) {
      assert.doesNotMatch(read(file), /feDisplacementMap|backdrop|lg-glass|MotionPause|SlabTilt/, file);
    }
  });

  it("keeps the only motion a color change on hover, and holds the recordings still for reduced motion", () => {
    const css = read("app/landing.css");
    for (const [, value] of css.matchAll(/transition:\s*([^;]+);/g)) {
      for (const part of value.split(",")) assert.match(part.trim(), /^(color|border-color|background-color) 150ms ease-out$/);
    }
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.lp-screen video \{\s*display: none;/);
  });

  it("frames a screen plainly: rounded corners and a thin border", () => {
    const rule = read("app/landing.css").match(/\.lp-screen \{[^}]*\}/)?.[0] ?? "";
    assert.match(rule, /border: 1px solid var\(--line-strong\);/);
    assert.match(rule, /border-radius: 24px;/);
    assert.match(rule, /overflow: hidden;/);
  });

  it("keeps a solid nav bar and 44px targets", () => {
    const css = read("app/landing.css");
    const nav = css.match(/\.lp-nav \{[^}]*\}/)?.[0] ?? "";
    assert.match(nav, /position: sticky;/);
    assert.match(nav, /background: var\(--bg-0\);/);
    assert.match(css.match(/\.lp-login \{[^}]*\}/)?.[0] ?? "", /min-height: 44px;/);
    assert.match(css.match(/\.lp-badge-link \{[^}]*\}/)?.[0] ?? "", /min-height: 44px;/);
    assert.match(css.match(/\.lp-open \{[^}]*\}/)?.[0] ?? "", /height: 48px;/);
    assert.match(read("components/landing/sections.tsx"), /className="hit-44 inline-flex items-center"/);
  });

  it("never sets text fainter than the 68% ink, which clears 4.5:1 on both darks", () => {
    const css = read("app/landing.css");
    assert.doesNotMatch(css, /--ink-3|opacity:/);
    for (const file of ["components/landing-page.tsx", "components/landing/sections.tsx", "components/landing/landing-timeline.tsx", "components/landing/landing-links.tsx"]) {
      assert.doesNotMatch(read(file), /text-zinc-(500|600|700)\b/, file);
    }
  });
});

describe("landing rebuild: what it may not pull in", () => {
  it("imports no scan or hit-reveal file, so /welcome stays out of the app bundle", () => {
    for (const file of [...sources("components/landing"), ...sources("components/landing/showcase"), "components/landing-page.tsx", "app/welcome/page.tsx"]) {
      assert.doesNotMatch(read(file), /@\/components\/scan\/|@\/lib\/scan\/|lib\/ios\/(haptics|native)|app\/\(app\)\/scan/, file);
    }
  });

  it("adds no motion or carousel library, no canvas or WebGL, and no font files", () => {
    for (const file of LANDING_FILES) {
      assert.doesNotMatch(read(file), /from "(framer-motion|motion|gsap|lottie|swiper|embla|three)/, file);
    }
    for (const file of REBUILT) assert.doesNotMatch(read(file), /<canvas|getContext\(|WebGL|@font-face|next\/font/, file);
    assert.match(read("app/landing.css"), /font-family: var\(--font-geist-mono\)/, "the fonts the layout already loads");
  });

  it("keeps the old photos and people off the page's sources", () => {
    for (const file of LANDING_FILES.filter((file) => !file.includes("/showcase/") && !file.endsWith("README.md") && !file.includes("lib/landing/founder"))) {
      assert.doesNotMatch(read(file), /Painter|Trevor|Lawrence|kitchen-table|founder-showcase|readFounderShowcase/, file);
    }
  });
});
