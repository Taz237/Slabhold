import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createElement } from "react";
import { installDom } from "@/lib/test/dom";
import {
  ALL_MEDIA_FILES,
  FIXTURE_COMP,
  FIXTURE_FOUNDER,
  FIXTURE_PULLS,
  htmlWords,
  mediaRoot,
  renderLoaded,
  withLandingContexts,
} from "@/lib/test/landing-fixtures";

const { win, state } = installDom();
// The Quick Comp panel's code loads "once idle"; jsdom has no idle callback, so idle is now.
(win as unknown as { requestIdleCallback: (run: () => void) => number }).requestIdleCallback = (run) => win.setTimeout(run, 0);

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
  ...sources("components/landing/showcase"),
  ...sources("lib/landing"),
  "app/landing.css",
  "components/og-frame.tsx",
];

/** The new files this redesign added. */
const NEW_FILES = [
  "app/landing.css",
  "components/landing/glass-hero.tsx",
  "components/landing/glass-island.tsx",
  "components/landing/feature-clip.tsx",
  "components/landing/feature-clip-player.tsx",
  "components/landing/sections.tsx",
  "components/landing/quick-comp-section.tsx",
  "lib/landing/media.ts",
  "lib/landing/pulls.ts",
  "lib/landing/pulls-load.ts",
  "lib/landing/seo.ts",
  "lib/landing/app-store.ts",
  "public/landing/media/README.md",
];

afterEach(() => {
  state.reducedMotion = false;
  delete process.env.NEXT_PUBLIC_QUICK_COMP;
  delete process.env.NEXT_PUBLIC_LANDING_HIT_REVEALS;
});

/**
 * Every word a visitor can read or hear, with every section drawn: all the
 * media slots filled, real cards, a real comp, pulls and the hit reveals card.
 */
async function everyWord(): Promise<string> {
  process.env.NEXT_PUBLIC_QUICK_COMP = "1";
  process.env.NEXT_PUBLIC_LANDING_HIT_REVEALS = "1";
  state.reducedMotion = true;
  const { LandingPage } = await import("@/components/landing-page");
  const { LandingCompProvider } = await import("@/components/landing/landing-links");
  const fixture = mediaRoot(ALL_MEDIA_FILES);
  try {
    const page = createElement(LandingPage, { founder: FIXTURE_FOUNDER, comp: FIXTURE_COMP, pulls: FIXTURE_PULLS, media: fixture.media() });
    const html = await renderLoaded(withLandingContexts(createElement(LandingCompProvider, { comp: FIXTURE_COMP }, page)));
    const { LANDING_TITLE, LANDING_DESCRIPTION } = await import("@/lib/landing/seo");
    const { homeShareImage } = await import("@/lib/social/share-image");
    const share = homeShareImage();
    return [htmlWords(html), LANDING_TITLE, LANDING_DESCRIPTION, share.kicker, share.title, share.detail].join("\n");
  } finally {
    fixture.remove();
  }
}

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

describe("landing redesign: copy rules", () => {
  it("never uses a banned word anywhere a visitor can read or hear", async () => {
    const words = await everyWord();
    assert.match(words, /Scan it\. Know the exact version\./);
    assert.match(words, /Crystal Shatter/, "every section was read, even the ones that are off by default");
    assert.match(words, /Recent sold prices, the median and the range\./);
    assert.match(words, /pulled by @fixture_puller/);
    assert.doesNotMatch(words, /\bbest\b/i);
    assert.doesNotMatch(words, /\bAI\b/);
    assert.doesNotMatch(words, /\bfree\b/i);
    assert.doesNotMatch(words, /number one|\bno\. ?1\b|#1\b/i);
    assert.doesNotMatch(words, /\bflip(s|ped|ping)?\b/i);
    assert.doesNotMatch(words, /\bdownload/i);
    assert.doesNotMatch(words, /\bmail\b/i);
    assert.doesNotMatch(words, /\bseconds?\b/i);
    assert.doesNotMatch(words, /any card/i);
    assert.doesNotMatch(words, /next upgrade/i);
    assert.doesNotMatch(words, /(^|\s)#[a-z]\w+/i, "no hashtags");
    assert.doesNotMatch(words, /Sample Rookie|\$128\.00|\$412|Sample accounts|Replay/);
  });

  it("claims nothing the app doesn't do: you pick the version, nothing is auto-detected", async () => {
    const words = await everyWord();
    assert.match(words, /then you pick the exact version/);
    assert.match(words, /Every parallel\. You pick\./);
    assert.doesNotMatch(words, /auto-?detect|automatically|instantly|detects? (the|every|your) parallel|identif(y|ies) (the|every|any) parallel/i);
    assert.doesNotMatch(words, /\b(we|I)'ve\b|\bmy\b/i, "team voice");
  });

  it("keeps the hobby rules: no marketplace, no TCG, no eBay data wording, no made-up counts, no rivals", async () => {
    const words = await everyWord();
    assert.doesNotMatch(words, /marketplace|buy now|for sale|sell your|asking price|\bask\b|\boffers?\b/i);
    assert.doesNotMatch(words, /pok[eé]mon|tcg|mail day/i);
    // The Trawl credit's "not affiliated with eBay" disclaimer is the one allowed mention.
    assert.doesNotMatch(words, /eBay (data|logo|sold|sales|solds)/i);
    assert.equal(words.split(/ebay/i).length - 1, 1);
    assert.doesNotMatch(words, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i);
    assert.doesNotMatch(words, /testimonial|trusted by|loved by/i);
    assert.doesNotMatch(words, /CollX|Ludex|Card Ladder|Alt\b|130 ?point|Market Movers|unlike|better than|other apps/i);
    assert.doesNotMatch(words, /\bNBA\b|\bNFL\b|\bMLB\b|\bNHL\b|Panini|Topps|Upper Deck/, "no league or maker names added by the page");
  });

  it("has no teal in any landing file, its styles, or the files this redesign added", () => {
    const teal = /teal|#(?:34C1AE|2dd4bf|14b8a6|0d9488|5eead4|1f9e8c|0f766e|99f6e4|ccfbf1)\b|cyan-|emerald-/i;
    for (const file of new Set([...LANDING_FILES, ...NEW_FILES])) assert.doesNotMatch(read(file), teal, file);
    assert.equal(existsSync(join(ROOT, "public/landing/sample-raw-card.svg")), false);
  });

  it("uses no color with a hue between 160 and 200 degrees in the landing styles or the new files", () => {
    const checked = new Set([...NEW_FILES, "components/landing-page.tsx", "components/landing/landing-galaxy.tsx", "components/landing/app-store-badge.tsx", "components/landing/landing-links.tsx"]);
    let seen = 0;
    for (const file of checked) {
      for (const color of colorsIn(read(file))) {
        seen += 1;
        const { hue, saturation, lightness } = hueOf(...color.rgb);
        // Greys, black and white have no hue to speak of.
        if (saturation < 0.08 || lightness < 0.03 || lightness > 0.97) continue;
        assert.ok(hue < 160 || hue > 200, `${file}: ${color.text} has hue ${Math.round(hue)}`);
      }
    }
    assert.ok(seen > 40, "the colors were found");
    assert.deepEqual(Math.round(hueOf(0x34, 0xc1, 0xae).hue), 172, "the check knows teal when it sees it");
    assert.deepEqual(Math.round(hueOf(0x7c, 0x3a, 0xed).hue), 262);
  });

  it("adds no motion or carousel library, no canvas or WebGL, and no font files", () => {
    for (const file of LANDING_FILES) {
      assert.doesNotMatch(read(file), /from "(framer-motion|motion|gsap|lottie|swiper|embla|three)/, file);
    }
    for (const file of NEW_FILES) assert.doesNotMatch(read(file), /<canvas|getContext\(|WebGL|@font-face|next\/font/, file);
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies)) assert.doesNotMatch(name, /framer|gsap|lottie|swiper|embla|three/);
    assert.match(read("app/landing.css"), /font-family: var\(--font-geist-mono\)/, "the fonts the layout already loads");
  });

  it("leaves the in-app hit reveal and scan sheet files alone: the landing imports none of them", () => {
    for (const file of [...sources("components/landing"), ...sources("components/landing/showcase"), "components/landing-page.tsx"]) {
      assert.doesNotMatch(read(file), /@\/components\/scan\/|@\/lib\/scan\/|lib\/ios\/(haptics|native)/, file);
    }
  });
});

describe("landing redesign: hero", () => {
  it("is the Glass Slab now: no phone mockup, no sample value, no sample slabs", async () => {
    const words = await everyWord();
    assert.doesNotMatch(words, /Collection value|Last 90 days|\+\$38|10\.2%/);
    for (const gone of ["components/landing/hero-phone.tsx", "components/landing/hero-slabs.tsx"]) {
      assert.equal(existsSync(join(ROOT, gone)), false, gone);
    }
    assert.doesNotMatch(read("components/landing/glass-hero.tsx"), /HERO_VALUE|HERO_GAIN|SAMPLE_/);
    assert.doesNotMatch(read("components/landing/glass-hero.tsx"), /^"use client";/m);
  });

  it("keeps the legal links and the page's canonical", () => {
    const footer = read("components/landing/sections.tsx");
    for (const href of ["/privacy", "/terms", "/support"]) assert.match(footer, new RegExp(`href="${href}" prefetch=\\{false\\}`));
    assert.match(read("app/welcome/page.tsx"), /alternates: \{ canonical: "\/" \}/);
  });
});

describe("landing redesign: tilt", () => {
  it("leans toward the pointer, flat in the middle, capped at the edges", async () => {
    const { tiltFor, TILT_MAX_DEG } = await import("@/components/landing/tilt");
    assert.deepEqual(tiltFor(100, 200, 200, 400), { x: 0, y: 0 });
    assert.deepEqual(tiltFor(0, 0, 200, 400), { x: TILT_MAX_DEG, y: -TILT_MAX_DEG });
    assert.deepEqual(tiltFor(200, 400, 200, 400), { x: -TILT_MAX_DEG, y: TILT_MAX_DEG });
    assert.deepEqual(tiltFor(900, -50, 200, 400), { x: TILT_MAX_DEG, y: TILT_MAX_DEG }, "clamped outside the box");
    assert.deepEqual(tiltFor(10, 10, 0, 0), { x: 0, y: 0 });
    // The glass slab leans a degree further.
    const { SLAB_TILT_MAX } = await import("@/components/landing/glass-island");
    assert.equal(SLAB_TILT_MAX, 8);
    assert.deepEqual(tiltFor(0, 0, 200, 400, SLAB_TILT_MAX), { x: 8, y: -8 });
  });

  it("is flat for reduced motion in CSS too, whatever the script set", () => {
    const css = read("app/landing.css");
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {"));
    assert.match(reduced, /\.lg-tilt \{\s*transform: none;/);
    assert.doesNotMatch(read("components/landing/tilt.tsx"), /^"use client";|useRef/m, "only the maths is left here");
  });
});

describe("landing redesign: scroll reveals", () => {
  it("are CSS view timelines, only with motion allowed and where the browser has them", () => {
    const css = read("app/landing.css");
    assert.match(
      css,
      /@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{\s*\.lg-rise \{[^}]*animation-timeline: view\(\);/,
    );
    // Outside that block the class sets nothing, so content is never hidden without it.
    assert.equal(css.split(".lg-rise {").length - 1, 1);
    assert.ok((read("components/landing/sections.tsx").match(/lg-rise/g) ?? []).length >= 3);
    // Transform only: a part that is half way in never has faded, low-contrast text.
    const frames = css.slice(css.indexOf("@keyframes lg-rise"), css.indexOf("@keyframes lg-loupe"));
    assert.match(frames, /from \{\s*transform: translateY\(32px\) scale\(0\.97\);/);
    assert.doesNotMatch(frames, /opacity/);
  });
});

describe("landing redesign: layout and type", () => {
  const css = read("app/landing.css");
  const desktop = css.slice(css.indexOf("@media (min-width: 1024px) {"), css.indexOf("/* ---------- Fallbacks"));

  it("pads sections 96px on a phone and 160px on desktop, on a 12-column grid capped at 1200px", () => {
    assert.match(css, /\.lg-section \{[^}]*max-width: 1200px;[^}]*padding: 96px 24px;/);
    assert.match(desktop, /\.lg-section \{\s*padding: 160px 32px;/);
    assert.match(desktop, /\.lg-grid \{\s*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/);
    assert.match(css, /\.lg-hero \{[^}]*max-width: 1200px;/);
  });

  it("sizes the phones 78vw on a phone and 320px on desktop", () => {
    assert.match(css, /\.lg-phone \{[^}]*width: 78vw;\s*max-width: 320px;/);
    assert.match(desktop, /\.lg-phone,\s*\.lg-media-pair \.lg-phone \{\s*width: 320px;/);
  });

  it("sets headings 34/1.08 then 56/1.04, the lead 22 then 28, and keeps the measures", () => {
    assert.match(css, /\.lg-h2 \{[^}]*max-width: 34ch;[^}]*font-size: 34px;[^}]*line-height: 1\.08;/);
    assert.match(desktop, /\.lg-h2 \{\s*font-size: 56px;\s*line-height: 1\.04;/);
    assert.match(css, /\.lg-lead \{[^}]*max-width: 56ch;[^}]*font-size: 22px;/);
    assert.match(desktop, /\.lg-lead \{[^}]*font-size: 28px;/);
    assert.match(css, /\.lg-sub \{[^}]*max-width: 56ch;[^}]*font-size: 16px;\s*font-weight: 500;\s*line-height: 1\.5;/);
    assert.match(desktop, /\.lg-sub \{[^}]*font-size: 18px;\s*line-height: 1\.55;/);
  });
});
