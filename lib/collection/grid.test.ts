import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import nextConfig from "@/next.config";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import {
  EAGER_TILES,
  GRID_CLASS,
  TILE_IMAGE_SIZES,
  photoSource,
  photoStatusAfter,
  readHeroOpen,
  showGhostTile,
  showPhotoPlaceholder,
  slabLabel,
  slabTone,
  sortGridCards,
  sparklinePath,
  tileAccessibleName,
  tileGain,
  tileKind,
  tileLoading,
  writeHeroOpen,
  yearSetLine,
} from "./grid";

const SUPABASE =
  "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/u1/a.jpg";

function card(partial: Partial<SportsCard> = {}): SportsCard {
  return {
    id: "c1",
    playerName: "Luka Dončić",
    year: 2018,
    yearLabel: "2018",
    setBrand: "Prizm",
    setIsCustom: false,
    cardNumber: "280",
    noNumber: false,
    grade: "Raw",
    parallel: "Base",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    gradeQualifier: "",
    certNumber: "",
    sport: "Basketball",
    purchasePrice: 100,
    purchaseDate: "2024-01-01",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function ok(median: number): CardValueResult {
  return { status: "ok", median, low: median, high: median, nSales: 5, matchedAt: null };
}

describe("tileKind and slabLabel", () => {
  it("treats graded cards as slabs", () => {
    assert.equal(tileKind(card({ conditionType: "graded", grade: "PSA 10" })), "slab");
    assert.equal(tileKind(card({ conditionType: "graded", grade: "9" })), "slab");
    assert.equal(tileKind(card({ grade: "BGS 9.5", conditionType: undefined as never })), "slab");
  });

  it("treats raw cards as cards", () => {
    assert.equal(tileKind(card()), "card");
    assert.equal(tileKind(card({ grade: "" })), "card");
    assert.equal(tileKind(card({ conditionType: "raw", grade: "PSA 10" })), "card");
  });

  it("reads the grader and grade off the card", () => {
    assert.equal(slabLabel(card({ conditionType: "graded", grade: "PSA 10" })), "PSA 10");
    assert.equal(slabLabel(card({ conditionType: "graded", grade: "BGS 9.5" })), "BGS 9.5");
    assert.equal(slabLabel(card({ conditionType: "graded", grade: "SGC 9" })), "SGC 9");
    assert.equal(slabLabel(card({ conditionType: "graded", grade: "9" })), "9");
    assert.equal(slabLabel(card()), "");
  });

  it("picks a flat label color per grader", () => {
    assert.equal(slabTone(card({ conditionType: "graded", grade: "PSA 10" })), "psa");
    assert.equal(slabTone(card({ conditionType: "graded", grade: "BGS 9.5" })), "bgs");
    assert.equal(slabTone(card({ conditionType: "graded", grade: "SGC 10" })), "sgc");
    assert.equal(slabTone(card({ conditionType: "graded", grade: "CGC 9" })), "cgc");
    assert.equal(slabTone(card({ conditionType: "graded", grade: "TAG 9" })), "neutral");
  });
});

describe("grid layout", () => {
  it("is 2 columns on phones, 3 at sm and 4 at lg with 12px gaps", () => {
    const classes = GRID_CLASS.split(" ");
    for (const name of ["grid", "grid-cols-2", "sm:grid-cols-3", "lg:grid-cols-4", "gap-3"]) {
      assert.ok(classes.includes(name), name);
    }
  });

  it("asks for the first 4 photos eagerly and lazy-loads the rest", () => {
    assert.equal(EAGER_TILES, 4);
    assert.deepEqual([0, 1, 2, 3, 4, 9].map(tileLoading), [
      "eager",
      "eager",
      "eager",
      "eager",
      "lazy",
      "lazy",
    ]);
    assert.match(TILE_IMAGE_SIZES, /min-width: ?1024px/);
    assert.match(TILE_IMAGE_SIZES, /46vw$/);
  });

  it("adds a ghost tile only for a thin collection", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(showGhostTile), [false, true, true, true, false]);
  });
});

describe("tile photos", () => {
  it("optimizes only Supabase public storage photos", () => {
    assert.deepEqual(photoSource(SUPABASE), { kind: "optimized", src: SUPABASE });
    assert.deepEqual(photoSource("data:image/jpeg;base64,abc"), {
      kind: "plain",
      src: "data:image/jpeg;base64,abc",
    });
    assert.equal(photoSource(`${SUPABASE}?v=1`).kind, "plain");
    assert.equal(photoSource("https://example.com/a.jpg").kind, "plain");
    assert.deepEqual(photoSource(null), { kind: "none" });
    assert.deepEqual(photoSource("  "), { kind: "none" });
  });

  it("falls back to the placeholder when there is no photo or it errors", () => {
    assert.equal(showPhotoPlaceholder({ kind: "none" }, "loading"), true);
    assert.equal(showPhotoPlaceholder(photoSource(SUPABASE), "loading"), false);
    const failed = photoStatusAfter("loading", "error");
    assert.equal(failed, "error");
    assert.equal(showPhotoPlaceholder(photoSource(SUPABASE), failed), true);
    assert.equal(photoStatusAfter("loading", "load"), "loaded");
    assert.equal(photoStatusAfter("error", "load"), "error");
    assert.equal(photoStatusAfter("error", "reset"), "loading");
  });

  it("shows year and set on one line", () => {
    assert.equal(yearSetLine(card()), "2018 · Prizm");
    assert.equal(yearSetLine(card({ yearLabel: "2023-24", setBrand: "Select" })), "2023-24 · Select");
    assert.equal(yearSetLine(card({ setBrand: "" })), "2018");
  });
});

describe("tileGain", () => {
  const values = new Map([["c1", ok(150)]]);

  it("shows a gain in emerald with a plus sign", () => {
    const gain = tileGain(card(), values, { valuePending: false, estimate: true });
    assert.equal(gain?.tone, "up");
    assert.equal(gain?.pctText, "+50.0%");
    assert.equal(gain?.amountText, "+$50.00");
  });

  it("shows a loss in rose with a minus sign", () => {
    const gain = tileGain(card({ purchasePrice: 300 }), values, {
      valuePending: false,
      estimate: true,
    });
    assert.equal(gain?.tone, "down");
    assert.equal(gain?.pctText, "−50.0%");
  });

  it("hides the pill for Don't know, missing values, or while loading", () => {
    const opts = { valuePending: false, estimate: true };
    assert.equal(tileGain(card({ purchasePrice: null }), values, opts), null);
    assert.equal(tileGain(card(), new Map(), opts), null);
    assert.equal(tileGain(card(), values, { ...opts, valuePending: true }), null);
    assert.equal(tileGain(card(), values, { ...opts, estimate: false }), null);
  });

  it("uses the sold price for sold cards", () => {
    const sold = card({ sellPrice: 80, sellDate: "2024-02-01" });
    const gain = tileGain(sold, new Map(), { valuePending: false, estimate: false });
    assert.equal(gain?.tone, "down");
  });
});

describe("tileAccessibleName", () => {
  it("names the player, set, grade and value", () => {
    assert.equal(
      tileAccessibleName(card({ conditionType: "graded", grade: "PSA 10" }), "$412.00"),
      "Luka Dončić 2018 Prizm, PSA 10, $412.00",
    );
    assert.equal(tileAccessibleName(card(), "$40.00"), "Luka Dončić 2018 Prizm, Raw, $40.00");
    assert.equal(tileAccessibleName(card(), null), "Luka Dončić 2018 Prizm, Raw");
  });
});

describe("sortGridCards", () => {
  const a = card({ id: "a", createdAt: "2024-01-03T00:00:00.000Z", purchasePrice: 100 });
  const b = card({ id: "b", createdAt: "2024-01-01T00:00:00.000Z", purchasePrice: 10 });
  const c = card({ id: "c", createdAt: "2024-01-02T00:00:00.000Z", purchasePrice: null });
  const values = new Map([
    ["a", ok(120)],
    ["b", ok(60)],
    ["c", ok(500)],
  ]);

  it("sorts by value by default, highest first", () => {
    assert.deepEqual(sortGridCards([a, b, c], "value", values).map((x) => x.id), ["c", "a", "b"]);
  });

  it("sorts by recently added", () => {
    assert.deepEqual(sortGridCards([b, c, a], "recent", values).map((x) => x.id), ["a", "c", "b"]);
  });

  it("sorts by gain, cards without a gain last", () => {
    assert.deepEqual(sortGridCards([a, b, c], "gain", values).map((x) => x.id), ["b", "a", "c"]);
  });

  it("puts cards without a value after valued ones", () => {
    const d = card({ id: "d" });
    assert.deepEqual(sortGridCards([d, b], "value", values).map((x) => x.id), ["b", "d"]);
  });
});

describe("hero open state", () => {
  function memory(): Storage {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    };
  }

  it("is closed by default and remembers the last choice", () => {
    const storage = memory();
    assert.equal(readHeroOpen(storage), false);
    writeHeroOpen(storage, true);
    assert.equal(readHeroOpen(storage), true);
    writeHeroOpen(storage, false);
    assert.equal(readHeroOpen(storage), false);
  });

  it("survives blocked storage", () => {
    const blocked = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    assert.equal(readHeroOpen(blocked), false);
    assert.doesNotThrow(() => writeHeroOpen(blocked, true));
    assert.equal(readHeroOpen(null), false);
  });
});

describe("sparklinePath", () => {
  it("draws nothing for fewer than 2 points", () => {
    assert.equal(sparklinePath([], 100, 20), "");
    assert.equal(sparklinePath([5], 100, 20), "");
  });

  it("spans the box from left to right", () => {
    const path = sparklinePath([1, 3, 2], 100, 20);
    assert.match(path, /^M0(\.0+)? /);
    assert.match(path, /L100(\.0+)? /);
  });

  it("draws a flat line through the middle for a flat series", () => {
    assert.equal(sparklinePath([4, 4], 10, 20), "M0 10 L10 10");
  });
});

describe("next.config images", () => {
  it("allows only the Supabase public storage path", () => {
    const images = nextConfig.images;
    assert.ok(images);
    assert.equal(images.remotePatterns?.length, 1);
    const pattern = images.remotePatterns?.[0];
    assert.ok(pattern && !(pattern instanceof URL));
    assert.equal(pattern.protocol, "https");
    assert.equal(pattern.hostname, "knuwflptobyutrauxblj.supabase.co");
    assert.equal(pattern.pathname, "/storage/v1/object/public/**");
    assert.equal(pattern.search, "");
  });

  it("keeps transformations cheap", () => {
    const images = nextConfig.images;
    assert.deepEqual(images?.qualities, [75]);
    assert.ok((images?.deviceSizes?.length ?? 99) <= 4);
    assert.ok((images?.imageSizes?.length ?? 99) <= 4);
    assert.ok((images?.minimumCacheTTL ?? 0) >= 60 * 60 * 24 * 30);
  });
});

describe("collection grid files", () => {
  it("leaves the card-upload files alone", () => {
    for (const file of ["components/collection-grid.tsx", "components/card-slab-art.tsx"]) {
      assert.doesNotMatch(readFileSync(join(process.cwd(), file), "utf8"), /card-thumb/, file);
    }
    const art = readFileSync(join(process.cwd(), "components/card-slab-art.tsx"), "utf8");
    assert.match(art, /from "next\/image"/);
  });
});
