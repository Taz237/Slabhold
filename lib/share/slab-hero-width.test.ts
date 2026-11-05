import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heroSlabWidth, slabHeight } from "../../components/og-share";
import { shareSlab, type ShareSlab } from "../social/share-image";

const graded = shareSlab("https://example.test/a.jpg", { player: "Fixture Player", grade: "10", grader: "PSA", conditionType: "graded" });
const raw = shareSlab("https://example.test/b.jpg", { player: "Fixture Player", conditionType: "raw" });
const wide = (slab: ShareSlab): ShareSlab => ({ ...slab, shape: "landscape" });

describe("single-slab hero width", () => {
  it("keeps portrait, unknown and empty slabs at the portrait width", () => {
    assert.equal(heroSlabWidth(graded, 310, 500), 310);
    assert.equal(heroSlabWidth({ ...graded, shape: "portrait" }, 310, 500), 310);
    assert.equal(heroSlabWidth(null, 310, 500), 310);
  });

  it("gives a landscape slab about 1.5x the width, capped at the hero column", () => {
    assert.equal(heroSlabWidth(wide(graded), 310, 500), 465);
    assert.equal(heroSlabWidth(wide(graded), 460, 936), 690);
    assert.equal(heroSlabWidth(wide(graded), 400, 500), 500);
    assert.equal(heroSlabWidth(wide(raw), 250, 464), 375);
  });

  it("never draws a landscape slab taller than the portrait one", () => {
    for (const slab of [graded, raw]) {
      for (const [portraitWidth, cap] of [[310, 500], [300, 470], [460, 936], [280, 496], [250, 464], [420, 900], [200, 2000]] as const) {
        const width = heroSlabWidth(wide(slab), portraitWidth, cap);
        assert.ok(width > portraitWidth && width <= cap, `${portraitWidth} -> ${width}`);
        assert.ok(
          slabHeight(wide(slab), width) <= slabHeight(slab, portraitWidth),
          `${slab.graded ? "graded" : "raw"} ${portraitWidth}: ${slabHeight(wide(slab), width)} > ${slabHeight(slab, portraitWidth)}`,
        );
      }
    }
  });
});
