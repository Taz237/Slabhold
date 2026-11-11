import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MOVE_PILL, MOVE_TEXT, PILL_TONE, TONE_CLASS, TONE_HEX } from "@/lib/chart/theme";

/** Tailwind v4 palette values used by the direction styles. */
const HEX: Record<string, string> = {
  "violet-300": "#c4b5fd",
  "violet-400": "#a78bfa",
  "violet-500": "#8b5cf6",
  "violet-600": "#7c3aed",
  "violet-700": "#6d28d9",
  "zinc-400": "#a1a1aa",
  "zinc-500": "#71717a",
  "zinc-600": "#52525b",
  white: "#ffffff",
};

/** Page and card surfaces the chips sit on. */
const LIGHT_SURFACES = ["#ffffff", "#f4f4f5", "#fafafa"];
const DARK_SURFACES = ["#09090b", "#18181b"];
const OG_BACKGROUND = "#110d1c";

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function over(top: string, alpha: number, bottom: string): string {
  const a = rgb(top);
  const b = rgb(bottom);
  const mix = a.map((value, i) => Math.round(value * alpha + b[i] * (1 - alpha)));
  return `#${mix.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The text color and tint a pill class string asks for, in one theme. */
function pillColors(classes: string, theme: "light" | "dark") {
  const parts = classes.split(/\s+/).filter((part) => (theme === "dark" ? true : !part.startsWith("dark:")));
  const pick = (prefix: string) => {
    const dark = parts.filter((part) => part.startsWith(`dark:${prefix}`)).at(-1)?.slice(5);
    const light = parts.filter((part) => part.startsWith(prefix)).at(-1);
    return theme === "dark" ? (dark ?? light) : light;
  };
  const text = pick("text-")!.slice(5);
  const bg = pick("bg-")!.slice(3);
  const tint = /^\[?(.+?)\]?\/\[?([\d.]+)\]?$/.exec(bg.replace("white/[0.07]", "white/0.07"));
  assert.ok(tint, `tint in ${bg}`);
  const alpha = Number(tint[2]) > 1 ? Number(tint[2]) / 100 : Number(tint[2]);
  return { text: HEX[text], tint: HEX[tint[1]], alpha };
}

const GREEN_RED = /emerald|rose-|green-|red-|teal|lime-|#34d399|#fb7185|#22c55e|#ef4444|52,\s*211,\s*153|251,\s*113,\s*133/i;

describe("gain and loss colors: brand purple, never green or red", () => {
  it("the shared theme has no green, red or teal anywhere", () => {
    for (const table of [TONE_CLASS, TONE_HEX, PILL_TONE, MOVE_PILL, MOVE_TEXT]) {
      assert.doesNotMatch(JSON.stringify(table), GREEN_RED);
    }
    assert.match(TONE_CLASS.up, /violet/);
    assert.match(TONE_CLASS.down, /zinc/);
    assert.equal(TONE_CLASS.flat, TONE_CLASS.down);
    assert.equal(PILL_TONE.up, MOVE_PILL.up);
    assert.equal(PILL_TONE.down, MOVE_PILL.down);
  });

  it("pill text passes 4.5:1 on its tint, light and dark", () => {
    for (const tone of ["up", "down", "flat"] as const) {
      for (const surface of LIGHT_SURFACES) {
        const { text, tint, alpha } = pillColors(MOVE_PILL[tone], "light");
        const ratio = contrast(text, over(tint, alpha, surface));
        assert.ok(ratio >= 4.5, `${tone} light on ${surface}: ${ratio.toFixed(2)}`);
      }
      for (const surface of DARK_SURFACES) {
        const { text, tint, alpha } = pillColors(MOVE_PILL[tone], "dark");
        const ratio = contrast(text, over(tint, alpha, surface));
        assert.ok(ratio >= 4.5, `${tone} dark on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
  });

  it("plain direction text passes 4.5:1 and chart lines pass 3:1, light and dark", () => {
    const color = (classes: string, theme: "light" | "dark") => {
      const parts = classes.split(/\s+/);
      const dark = parts.find((part) => part.startsWith("dark:text-"))?.slice(10);
      const light = parts.find((part) => part.startsWith("text-"))!.slice(5);
      return HEX[theme === "dark" ? (dark ?? light) : light];
    };
    for (const tone of ["up", "down", "flat"] as const) {
      for (const surface of LIGHT_SURFACES) {
        assert.ok(contrast(color(MOVE_TEXT[tone], "light"), surface) >= 4.5, `${tone} text light`);
        assert.ok(contrast(color(TONE_CLASS[tone], "light"), surface) >= 3, `${tone} line light`);
      }
      for (const surface of DARK_SURFACES) {
        assert.ok(contrast(color(MOVE_TEXT[tone], "dark"), surface) >= 4.5, `${tone} text dark`);
        assert.ok(contrast(color(TONE_CLASS[tone], "dark"), surface) >= 3, `${tone} line dark`);
      }
    }
  });

  it("share images use purple and grey that pass 4.5:1 on their background", () => {
    for (const tone of ["up", "down", "flat"] as const) {
      assert.ok(contrast(TONE_HEX[tone], OG_BACKGROUND) >= 4.5, `${tone}: ${contrast(TONE_HEX[tone], OG_BACKGROUND).toFixed(2)}`);
    }
  });
});

describe("direction never rides on color alone", () => {
  it("the card tile chip shows ▲ or ▼ in every size, purple up and grey down", async () => {
    const { GainChip } = await import("@/components/card-tile");
    for (const extra of [{}, { compact: true }, { large: true }]) {
      const up = renderToStaticMarkup(createElement(GainChip, { gain: { tone: "up", pctText: "+18%" }, ...extra }));
      const down = renderToStaticMarkup(createElement(GainChip, { gain: { tone: "down", pctText: "−9%" }, ...extra }));
      assert.match(up, /▲/);
      assert.match(down, /▼/);
      assert.match(up, /violet/);
      assert.match(down, /zinc/);
      assert.doesNotMatch(up + down, GREEN_RED);
    }
  });

  it("the sales chart chip is purple up, grey down", async () => {
    const { DeltaChip } = await import("@/components/sales-chart");
    const up = renderToStaticMarkup(createElement(DeltaChip, { pct: 4.2 }));
    const down = renderToStaticMarkup(createElement(DeltaChip, { pct: -3.1 }));
    assert.match(up, /▲/);
    assert.match(down, /▼/);
    assert.doesNotMatch(up + down, GREEN_RED);
  });

  it("the value board shows ▲ or ▼ next to the percent", async () => {
    const { ValueBoardView } = await import("@/components/value-board");
    const row = (userId: string, percent: number, percentLabel: string, rank: number) => ({
      userId,
      username: userId,
      displayName: userId,
      avatarUrl: null,
      accent: "#7C3AED",
      percent,
      percentLabel,
      flagged: false,
      rank,
    });
    const markup = renderToStaticMarkup(
      createElement(ValueBoardView, {
        model: {
          start: "2026-11-09",
          end: "2026-11-15",
          weekLabel: "Nov 9 – Nov 15",
          note: "",
          closedMessage: null,
          emptyMessage: null,
          viewerUserId: null,
          brackets: [{ id: "b", label: "Under $1k", rows: [row("a", 0.12, "+12.0%", 1), row("c", -0.04, "−4.0%", 2)] }],
        },
        checklist: { openByDefault: false, eligible: true, status: null, line: "", items: [] } as never,
      }),
    );
    assert.match(markup, /▲/);
    assert.match(markup, /▼/);
  });
});

describe("no hand-written green or red direction colors are left", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("the copies that drew their own colors now use the theme", () => {
    for (const path of [
      "lib/chart/theme.ts",
      "components/card-tile.tsx",
      "components/sales-chart.tsx",
      "components/og-frame.tsx",
    ]) {
      assert.doesNotMatch(read(path), GREEN_RED, path);
    }
    const moving = read("components/moving-today.tsx");
    // The green "Live" freshness dot is a status, not a direction, and stays for now.
    assert.doesNotMatch(moving, /rose-|emerald-50\b|emerald-950|emerald-700/);
    const board = read("components/value-board.tsx");
    assert.doesNotMatch(board, /rose-|emerald-400/);
    const card = read("components/card-detail.tsx");
    assert.doesNotMatch(card, /text-emerald-600 dark:text-emerald-400/);
  });
});
