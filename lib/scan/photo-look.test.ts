import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductParallel } from "@/lib/cards/product-data";
import { lookFromBody, photoLookFromPixels, rankVersionsByLook, withNativeBorder, type PhotoLook, type Pixels } from "./photo-look";

/**
 * The card photo's look (border color and rainbow sheen), read on the phone from the straightened
 * crop. It only reorders and trims "Which version?": it never names a parallel, and never Base.
 */

type Rgb = [number, number, number];

/** A card-shaped picture: a border band of one paint, and a face of another. */
function card(border: (x: number, y: number) => Rgb, face: (x: number, y: number) => Rgb, width = 100, height = 140): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  const band = Math.round(width * 0.08);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = x < band || y < band || x >= width - band || y >= height - band;
      const [r, g, b] = edge ? border(x, y) : face(x, y);
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }
  }
  return { width, height, data };
}

const flat = (rgb: Rgb) => () => rgb;
/** A player photo stand-in: busy, many colors, none of it the border. */
const busy = (x: number, y: number): Rgb => [(x * 37) % 256, (y * 53) % 256, ((x + y) * 29) % 256];
/** The chrome rainbow a refractor throws: the hue walks around the wheel along the border. */
function rainbow(x: number, y: number): Rgb {
  const hue = ((x + y) * 7) % 360;
  const chroma = 0.9 * 0.6;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const lift = 0.9 - chroma;
  const [r, g, b] = hue < 60 ? [chroma, second, 0] : hue < 120 ? [second, chroma, 0] : hue < 180 ? [0, chroma, second] : hue < 240 ? [0, second, chroma] : hue < 300 ? [second, 0, chroma] : [chroma, 0, second];
  return [r, g, b].map((part) => Math.round((part + lift) * 255)) as Rgb;
}

describe("reading the look from the photo", () => {
  it("a clear green border reads green, with no sheen", () => {
    const look = photoLookFromPixels(card(flat([30, 160, 60]), busy));
    assert.deepEqual(look, { border: "green", sheen: "flat" });
  });

  it("a clear pink border reads pink; orange reads orange; a deep blue reads blue", () => {
    assert.equal(photoLookFromPixels(card(flat([230, 70, 160]), busy))?.border, "pink");
    assert.equal(photoLookFromPixels(card(flat([235, 120, 20]), busy))?.border, "orange");
    assert.equal(photoLookFromPixels(card(flat([30, 70, 200]), busy))?.border, "blue");
  });

  it("a white border reads white; a black one reads black", () => {
    assert.equal(photoLookFromPixels(card(flat([245, 245, 242]), busy))?.border, "white");
    assert.equal(photoLookFromPixels(card(flat([12, 12, 14]), busy))?.border, "black");
  });

  it("a border that walks the color wheel reads as a rainbow sheen, with no one color", () => {
    const look = photoLookFromPixels(card(rainbow, busy));
    assert.equal(look?.sheen, "rainbow");
    assert.equal(look?.border, null);
  });

  it("a half-and-half border (glare, a shadow, a hand) is unclear: no look at all", () => {
    const split = (x: number): Rgb => (x < 50 ? [30, 160, 60] : [200, 40, 40]);
    assert.equal(photoLookFromPixels(card(split, busy)), null);
  });

  it("a washed-out grey photo is unclear", () => {
    assert.equal(photoLookFromPixels(card(flat([128, 128, 128]), flat([120, 120, 120]))), null);
  });

  it("a too-small or broken picture is unclear, and never throws", () => {
    assert.equal(photoLookFromPixels({ width: 4, height: 4, data: new Uint8ClampedArray(64) }), null);
    assert.equal(photoLookFromPixels({ width: 100, height: 140, data: new Uint8ClampedArray(10) }), null);
  });
});

describe("the phone's own border color beside the photo's", () => {
  it("they agree, or only one has a color: that color", () => {
    assert.deepEqual(withNativeBorder({ border: "green", sheen: "flat" }, "green"), { border: "green", sheen: "flat" });
    assert.deepEqual(withNativeBorder(null, "pink"), { border: "pink", sheen: null });
    assert.deepEqual(withNativeBorder({ border: null, sheen: "rainbow" }, null), { border: null, sheen: "rainbow" });
  });

  it("they disagree: no color (unclear beats a guess)", () => {
    assert.deepEqual(withNativeBorder({ border: "green", sheen: "flat" }, "red"), null);
  });

  it("nothing either way: no look", () => {
    assert.equal(withNativeBorder(null, null), null);
  });
});

describe("the look sent to the server", () => {
  it("keeps only names it knows", () => {
    assert.deepEqual(lookFromBody({ border: "gold", sheen: "rainbow" }), { border: "gold", sheen: "rainbow" });
    assert.deepEqual(lookFromBody({ border: "chartreuse", sheen: "rainbow" }), { border: null, sheen: "rainbow" });
    assert.equal(lookFromBody({ border: "x", sheen: "y" }), null);
    assert.equal(lookFromBody("green"), null);
    assert.equal(lookFromBody(null), null);
  });
});

const list = (...names: string[]): ProductParallel[] =>
  names.map((name) => {
    const [plain, run] = name.split("/");
    return { name: plain, serialRun: run ? Number(run) : null };
  });
const shown = (options: ProductParallel[]) => options.map((option) => (option.serialRun ? `${option.name}/${option.serialRun}` : option.name));

const CHROME = list(
  "Base",
  "Aqua Refractor/199",
  "Black Refractor/10",
  "Blue Refractor/150",
  "Geometric",
  "Gold Refractor/50",
  "Green Refractor/99",
  "Negative Refractor",
  "Orange Refractor/25",
  "Prism",
  "Purple Refractor/250",
  "Refractor",
  "Sepia",
  "X-Fractor",
);

describe("ranking Which version? by the look", () => {
  it("no look: the list is exactly as it was, all of it", () => {
    assert.deepEqual(rankVersionsByLook(CHROME, null, { runRead: false }), CHROME);
  });

  it("a rainbow sheen and no print run read: the chrome look-alikes lead, Base right after, numbered ones last", () => {
    const ranked = shown(rankVersionsByLook(CHROME, { border: null, sheen: "rainbow" }, { runRead: false }));
    assert.deepEqual(ranked.slice(0, 4), ["Refractor", "X-Fractor", "Negative Refractor", "Base"]);
    assert.ok(ranked.length <= 5, ranked.join(", "));
    // Nothing numbered beats an unnumbered version when the card showed no print run.
    const firstNumbered = ranked.findIndex((name) => name.includes("/"));
    assert.ok(firstNumbered === -1 || ranked.slice(firstNumbered).every((name) => name.includes("/")), ranked.join(", "));
  });

  it("a green border: green first, near colors next, then Base and the look-alikes; far colors drop off", () => {
    const ranked = shown(rankVersionsByLook(CHROME, { border: "green", sheen: "flat" }, { runRead: false }));
    assert.equal(ranked[0], "Green Refractor/99");
    assert.ok(ranked.includes("Base"));
    assert.ok(ranked.indexOf("Aqua Refractor/199") < ranked.indexOf("Base"), ranked.join(", "));
    for (const far of ["Orange Refractor/25", "Purple Refractor/250", "Gold Refractor/50"]) assert.ok(!ranked.includes(far), `${far}: ${ranked.join(", ")}`);
  });

  it("a white border with no sheen: Base first, then the look-alikes, before any color", () => {
    const ranked = shown(rankVersionsByLook(CHROME, { border: "white", sheen: "flat" }, { runRead: false }));
    assert.equal(ranked[0], "Base");
    assert.deepEqual(ranked.slice(1, 3), ["Refractor", "X-Fractor"]);
    assert.ok(!ranked.slice(0, 3).includes("Sepia"));
  });

  it("a border color that no version on the list carries: nothing drops, Base still leads the unnumbered ones", () => {
    const ranked = rankVersionsByLook(list("Base", "Refractor", "Blue/150"), { border: "pink", sheen: "flat" }, { runRead: false });
    assert.deepEqual(shown(ranked), ["Base", "Refractor", "Blue/150"]);
  });

  it("never drops Base, and never picks: the list is only reordered or trimmed", () => {
    for (const look of [
      { border: "green", sheen: "flat" },
      { border: "black", sheen: "rainbow" },
      { border: null, sheen: "rainbow" },
      { border: "white", sheen: null },
    ] as PhotoLook[]) {
      const ranked = rankVersionsByLook(CHROME, look, { runRead: false });
      assert.ok(ranked.some((option) => option.name === "Base"), JSON.stringify(look));
      assert.ok(ranked.every((option) => CHROME.includes(option)), JSON.stringify(look));
    }
  });

  it("a clear look shortens the picker to 5, and the plain version leads its color: Green Refractor before Green Lava", () => {
    const greens = list("Base", "Green Geometric/99", "Green Lava/99", "Green Raywave/99", "Green Refractor/99", "Green Wave/99", "Red Refractor/5", "Refractor", "X-Fractor");
    const ranked = shown(rankVersionsByLook(greens, { border: "green", sheen: "rainbow" }, { runRead: false }));
    assert.equal(ranked.length, 5);
    assert.equal(ranked[0], "Green Refractor/99");
    assert.ok(ranked.includes("Base"), ranked.join(", "));
  });

  it("a list without Base (a numbered card) gets none added", () => {
    const ranked = rankVersionsByLook(list("Green Refractor/99", "Green Wave/99"), { border: "green", sheen: "rainbow" }, { runRead: true });
    assert.deepEqual(shown(ranked), ["Green Refractor/99", "Green Wave/99"]);
  });

  it("two-color names count for either color: a blue border keeps Black and Blue Checker", () => {
    const ranked = shown(rankVersionsByLook(list("Base", "Black and Blue Checker", "Red", "Blue", "Silver"), { border: "blue", sheen: "flat" }, { runRead: false }));
    assert.deepEqual(ranked.slice(0, 2), ["Blue", "Black and Blue Checker"]);
    assert.ok(!ranked.includes("Red"));
  });
});
