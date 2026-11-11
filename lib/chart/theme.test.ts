import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { collectionMinSpan, FILL_STOPS, heroLineTone, heroTone, PILL_TONE, TONE_CLASS, TONE_HEX } from "./theme";
import { TONE_CLASS as SPARK_TONE_CLASS } from "@/components/charts/value-spark";
import { collectionValueShareModel } from "@/lib/share/collection-value";

const ROOT = process.cwd();
function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}
function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => `${dir}/${name}`);
}

/** Tailwind's 400 shades, the dark-theme line colors. */
const DARK_400: Record<string, string> = {
  "emerald-400": "#34d399",
  "rose-400": "#fb7185",
  "zinc-400": "#a1a1aa",
  "violet-400": "#a78bfa",
};

describe("chart theme: one place for chart colors", () => {
  it("never uses teal or cyan in the charts, the chart lib, the comp chart or the share chart", () => {
    const files = [...sources("components/charts"), ...sources("lib/chart"), "components/sales-chart.tsx"];
    for (const file of files) assert.doesNotMatch(read(file), /teal|cyan/i, file);
    const frame = read("components/og-frame.tsx");
    const og = frame.slice(frame.indexOf("export function renderCollectionValueOg"), frame.indexOf("return new ImageResponse", frame.indexOf("export function renderCollectionValueOg")));
    assert.ok(og.length > 0);
    assert.doesNotMatch(og, /teal|cyan/i);
    const css = read("app/globals.css");
    const block = css.slice(css.indexOf(" * Charts (components/charts"), css.indexOf("/* Quick Comp (components/sales-chart.tsx"));
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /teal|cyan|#14b8a6|#06b6d4/i);
  });

  it("keeps TONE_CLASS in the theme, re-exported from value-spark so old imports work", () => {
    assert.equal(SPARK_TONE_CLASS, TONE_CLASS);
    assert.doesNotMatch(read("components/charts/value-spark.tsx"), /text-emerald-600 dark:text-emerald-400/);
  });

  it("gives Satori the same colors as the dark TONE_CLASS", () => {
    for (const tone of ["up", "down", "flat", "brand"] as const) {
      const dark = TONE_CLASS[tone].match(/dark:text-(\w+-400)/)?.[1];
      assert.ok(dark, tone);
      assert.equal(TONE_HEX[tone].toLowerCase(), DARK_400[dark], tone);
    }
  });

  it("is Slabhold purple for brand: #7C3AED on light (violet-600) and #A78BFA on dark", () => {
    assert.match(TONE_CLASS.brand, /\btext-violet-600\b/);
    assert.match(TONE_CLASS.brand, /\bdark:text-violet-400\b/);
    assert.equal(TONE_HEX.brand, "#A78BFA");
    assert.match(TONE_CLASS.accent, /#A78BFA/);
    assert.match(read("app/globals.css"), /--color-violet-600: #7C3AED/i);
    const css = read("app/globals.css");
    assert.match(css, /--chart-accent: #7c3aed;/);
    assert.match(css, /--chart-accent: #a78bfa;/);
  });

  it("draws the share image's line and chip from TONE_HEX, never its own colors", () => {
    const frame = read("components/og-frame.tsx");
    assert.match(frame, /const tone = model\.calm \? TONE_HEX\.brand : TONE_HEX\[model\.tone\];/);
    assert.match(frame, /FILL_STOPS\.map/);
  });

  it("shares a calm week in purple, the same purple as TONE_HEX.brand", () => {
    const today = "2026-10-30";
    const rows = [
      { snapshot_date: "2026-10-20", value: 285.5 },
      { snapshot_date: "2026-10-27", value: 285.5 },
      { snapshot_date: "2026-10-29", value: 285.5 },
      { snapshot_date: today, value: 285.31 },
    ];
    const model = collectionValueShareModel({ username: "taz", rows, range: "7d", today });
    assert.ok(model);
    assert.equal(model.calm, true);
    assert.equal(model.tone, "down", "tone itself is unchanged");
    assert.match(model.change, /−\$0\.19 \(−0\.1%\)/);
    const frame = read("components/og-frame.tsx");
    assert.match(frame, /const tone = model\.calm \? TONE_HEX\.brand/);
    assert.match(frame, /model\.tone === "down" && !model\.calm \? ' stroke-dasharray/);
    assert.match(frame, /model\.calm \|\| model\.tone === "up" \? "rgba\(167,139,250,0\.16\)"/);
    const up = collectionValueShareModel({ username: "taz", rows: rows.map((row, i) => ({ ...row, value: i === 3 ? 300 : 285.5 })), range: "7d", today });
    assert.equal(up?.calm, false);
  });

  it("fills every line the same way: 26%, 10% at 60%, then nothing", () => {
    assert.deepEqual(FILL_STOPS, [
      { offset: 0, opacity: 0.26 },
      { offset: 0.6, opacity: 0.1 },
      { offset: 1, opacity: 0 },
    ]);
    assert.match(read("components/charts/value-chart.tsx"), /<FillStops \/>/);
    assert.match(read("components/charts/value-spark.tsx"), /<FillStops \/>/);
  });
});

describe("chart theme: hero tone", () => {
  it("is calm purple under 0.5% either way, gray at exactly $0, else up or down", () => {
    assert.equal(heroTone({ delta: -0.19, pct: -0.0665 }), "calm");
    assert.equal(heroTone({ delta: 0.4, pct: 0.4 }), "calm");
    assert.equal(heroTone({ delta: 0.6, pct: 0.6 }), "up");
    assert.equal(heroTone({ delta: -0.6, pct: -0.6 }), "down");
    assert.equal(heroTone({ delta: 0, pct: 0 }), "flat");
    assert.equal(heroTone(null), "flat");
    // From $0 there is no %: the sign decides.
    assert.equal(heroTone({ delta: 5, pct: null }), "up");
    assert.equal(heroLineTone("calm"), "brand");
    assert.equal(heroLineTone("down"), "down");
  });

  it("paints calm in violet, never rose or teal", () => {
    assert.match(PILL_TONE.calm, /violet/);
    assert.match(PILL_TONE.up, /violet/);
    assert.match(PILL_TONE.down, /zinc/);
    assert.match(PILL_TONE.flat, /zinc/);
    assert.doesNotMatch(Object.values(PILL_TONE).join(" "), /emerald|rose|teal/);
  });

  it("never lets the collection's y span drop under 4% of the value, or $5", () => {
    assert.ok(Math.abs(collectionMinSpan(285) - 11.4) < 1e-9);
    assert.equal(collectionMinSpan(40), 5);
    assert.equal(collectionMinSpan(0), 5);
  });
});

describe("chart theme: motion", () => {
  const css = read("app/globals.css");
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((block) => block[1]).join("\n");

  it("draws the line in within 400ms with the brand easing, and breathes on a 2.4s cycle", () => {
    const draw = css.match(/\.chart-draw \{\s*animation: chart-draw (\d+)ms (cubic-bezier\([^)]+\))/);
    assert.ok(draw);
    assert.ok(Number(draw[1]) <= 400, draw[1]);
    assert.equal(draw[2], "cubic-bezier(0.22, 1, 0.36, 1)");
    const fill = css.match(/\.chart-draw-fill \{\s*animation: chart-fade (\d+)ms/);
    assert.ok(fill && Number(fill[1]) <= 400);
    assert.match(css, /\.chart-pulse \{[^}]*animation: chart-pulse 2\.4s/);
    assert.match(css, /\[data-chart-paused\] \.chart-pulse \{\s*animation-play-state: paused;/);
  });

  it("animates only transform, opacity and stroke-dashoffset", () => {
    for (const name of ["chart-pulse", "chart-draw", "chart-fade"]) {
      const frames = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      assert.ok(frames, name);
      for (const prop of frames.matchAll(/([a-z-]+):/g)) {
        assert.ok(["transform", "opacity", "stroke-dashoffset"].includes(prop[1]), `${name}: ${prop[1]}`);
      }
    }
  });

  it("turns every chart animation off with reduced motion", () => {
    for (const name of ["chart-pulse", "chart-fade", "chart-draw", "chart-draw-fill", "chart-dots-in"]) {
      assert.match(reduced, new RegExp(`\\.${name}\\b`), name);
    }
    assert.match(reduced, /\.chart-draw-fill-wait \{\s*opacity: 1;/);
  });

  it("keeps the always-dark landing and intro on the dark chart colors in light mode", () => {
    const always = css.slice(css.indexOf("[data-always-dark] .chart-surface"));
    assert.match(always, /--chart-surface: #18181b;/);
    assert.match(always, /--chart-grid: rgb\(255 255 255 \/ 0\.07\);/);
    assert.match(always, /--chart-tick: #a1a1aa;/);
  });
});

describe("chart theme: haptic hook", () => {
  it("is one exported chartHaptic, and adds nothing under lib/native", () => {
    const scrub = read("components/charts/value-chart-scrub.ts");
    assert.match(scrub, /export function chartHaptic\(\): void/);
    assert.match(scrub, /haptic\("tick"\)/);
    assert.doesNotMatch(scrub, /function tick\(/);
    assert.equal(existsSync(join(ROOT, "lib/native")), false);
  });
});

describe("chart theme: dashboard first load", () => {
  it("keeps the count-up, the sale dots and the median layer out of the hero's static imports", () => {
    const hero = read("components/portfolio-hero.tsx");
    assert.doesNotMatch(hero, /from "@\/components\/hero-count-up"/);
    assert.match(hero, /import\("@\/components\/hero-count-up"\)/);
    const chart = read("components/charts/value-chart.tsx");
    assert.doesNotMatch(chart, /^import \{[^}]*\} from "@\/components\/charts\/median-layer"/m);
    assert.doesNotMatch(chart, /<circle\s+key=\{item\.dot\.id\}/);
  });
});
