import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GENERIC_PARALLELS, PARALLELS_BY_SET } from "@/lib/cards/parallels";
import { parallelSwatch, NEUTRAL_SWATCH } from "@/lib/cards/parallel-swatch";
import { displayParallelName } from "@/lib/cards/product-data";

const raw = JSON.parse(
  readFileSync(new URL("./data/panini-parallels.json", import.meta.url), "utf8"),
) as { parallels: { name: string }[] }[];

describe("parallelSwatch", () => {
  it("returns a defined color for every checklist and built-in parallel name", () => {
    const names = new Set<string>();
    for (const product of raw) {
      for (const row of product.parallels) {
        names.add(row.name);
        names.add(displayParallelName(row.name));
      }
    }
    for (const list of Object.values(PARALLELS_BY_SET)) for (const name of list) names.add(name);
    for (const name of GENERIC_PARALLELS) names.add(name);
    assert.ok(names.size > 300);
    for (const name of names) {
      const swatch = parallelSwatch(name);
      assert.equal(typeof swatch.background, "string", name);
      assert.ok(swatch.background.length > 0, name);
      assert.ok(["solid", "shimmer", "stars", "multi", "dark", "neutral", "base"].includes(swatch.kind), name);
    }
  });

  it("maps the usual colors", () => {
    assert.equal(parallelSwatch("Red").kind, "solid");
    assert.match(parallelSwatch("Red").background, /#(?:dc2626|ef4444)/i);
    assert.match(parallelSwatch("Gold").background, /#(?:f59e0b|d97706|fbbf24)/i);
    assert.equal(parallelSwatch("Silver").kind, "shimmer");
    assert.equal(parallelSwatch("Refractor").kind, "shimmer");
    assert.equal(parallelSwatch("Prizms").kind, "shimmer");
    assert.equal(parallelSwatch("Black").kind, "dark");
    assert.equal(parallelSwatch("Black").ring, true);
    for (const name of ["Tie-Dye", "Disco", "Camo", "Checkerboard", "Concourse Tie-Dye Prizms"]) {
      assert.equal(parallelSwatch(name).kind, "multi", name);
    }
    for (const name of ["Green", "Blue", "Purple", "Orange", "Pink", "Blue Ice", "Fast Break Purple"]) {
      assert.equal(parallelSwatch(name).kind, "solid", name);
    }
    assert.equal(parallelSwatch("Base").kind, "base");
  });

  it("falls back to neutral without throwing", () => {
    assert.deepEqual(parallelSwatch("Lucky Envelopes"), NEUTRAL_SWATCH);
    assert.deepEqual(parallelSwatch(""), NEUTRAL_SWATCH);
    assert.deepEqual(parallelSwatch("   "), NEUTRAL_SWATCH);
    assert.deepEqual(parallelSwatch(undefined as unknown as string), NEUTRAL_SWATCH);
  });

  it("gives Stars a silver star pattern and keeps a color word first", () => {
    const stars = parallelSwatch("Stars");
    assert.equal(stars.kind, "stars");
    assert.match(stars.background, /radial-gradient/);
    assert.equal(parallelSwatch("Red Stars").kind, "solid");
    assert.equal(parallelSwatch("Purple Stars").kind, "solid");
  });
});
