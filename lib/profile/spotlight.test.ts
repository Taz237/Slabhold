import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SPOT_MAX_BLUR_PX,
  SPOT_MAX_DIM,
  SPOT_MIN_SCALE,
  SPOT_TICK_GAP_MS,
  centeredIndex,
  createTickGate,
  glowHue,
  glowTint,
  mountedWindow,
  sortSpotlightCards,
  spotAmount,
  spotClamp,
  spotLabel,
  spotStyle,
  spotlightRow,
  windowShouldMove,
} from "./spotlight";
import type { PublicCard } from "@/lib/social/types";
import type { CardValueResult } from "@/lib/value/types";

function card(id: string, partial: Partial<PublicCard> = {}): PublicCard {
  return {
    id,
    playerName: "Sample Player",
    year: 2018,
    setBrand: "Prizm",
    cardNumber: "1",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c3aed",
    estimatedSellPrice: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function ok(median: number): CardValueResult {
  return { status: "ok", median, low: median, high: median, nSales: 5, matchedAt: null };
}

describe("spotlight curve", () => {
  const clamp = spotClamp(390, 242);

  it("leaves the centered card full size, bright and sharp", () => {
    assert.deepEqual(spotStyle(0, clamp), { scale: 1, dim: 0, blurPx: 0 });
  });

  it("clamps at the edge of the row and past it", () => {
    assert.equal(clamp, 316);
    for (const distance of [clamp, clamp * 2, -clamp * 3, 99999]) {
      const style = spotStyle(distance, clamp);
      assert.ok(Math.abs(style.scale - SPOT_MIN_SCALE) < 1e-9);
      assert.ok(Math.abs(style.dim - SPOT_MAX_DIM) < 1e-9);
      assert.ok(Math.abs(style.blurPx - SPOT_MAX_BLUR_PX) < 1e-9);
    }
  });

  it("changes smoothly and only one way as a card moves off center", () => {
    let previous = spotStyle(0, clamp);
    for (let distance = 1; distance <= clamp; distance += 1) {
      const next = spotStyle(distance, clamp);
      assert.ok(next.scale <= previous.scale, `scale at ${distance}`);
      assert.ok(next.dim >= previous.dim, `dim at ${distance}`);
      assert.ok(next.blurPx >= previous.blurPx, `blur at ${distance}`);
      // Continuous: one pixel of drag is never a visible step.
      assert.ok(previous.scale - next.scale < 0.002, `no step at ${distance}`);
      previous = next;
    }
  });

  it("is the same on both sides and safe on bad input", () => {
    assert.deepEqual(spotStyle(-120, clamp), spotStyle(120, clamp));
    assert.equal(spotAmount(100, 0), 0);
    assert.equal(spotAmount(Number.NaN, clamp), 0);
  });

  it("shrinks a resting neighbour by about a fifth", () => {
    const neighbour = spotStyle(230, clamp);
    assert.ok(neighbour.scale > 0.78 && neighbour.scale < 0.82, String(neighbour.scale));
    assert.ok(neighbour.dim > 0.38);
  });
});

describe("spotlight row", () => {
  it("finds the centered card from the scroll position", () => {
    assert.equal(centeredIndex(0, 232, 10), 0);
    assert.equal(centeredIndex(115, 232, 10), 0);
    assert.equal(centeredIndex(117, 232, 10), 1);
    assert.equal(centeredIndex(232 * 4 + 3, 232, 10), 4);
    assert.equal(centeredIndex(999999, 232, 10), 9);
    assert.equal(centeredIndex(-50, 232, 10), 0);
    assert.equal(centeredIndex(100, 0, 10), 0);
  });

  it("mounts real cards only near the center", () => {
    assert.deepEqual(mountedWindow(0, 200), [0, 3]);
    assert.deepEqual(mountedWindow(100, 200), [97, 103]);
    assert.deepEqual(mountedWindow(199, 200), [196, 199]);
    assert.deepEqual(mountedWindow(5, 2), [0, 1]);
    assert.deepEqual(mountedWindow(0, 0), [0, -1]);
  });

  it("moves the mounted window every second card and never uncovers what is on screen", () => {
    assert.equal(windowShouldMove(10, 10), false);
    assert.equal(windowShouldMove(11, 10), false);
    assert.equal(windowShouldMove(12, 10), true);
    assert.equal(windowShouldMove(8, 10), true);
    // A spin through 200 cards: the centered card and both neighbours are always real DOM.
    let windowCenter = 0;
    for (let center = 0; center < 200; center += 1) {
      if (windowShouldMove(center, windowCenter)) windowCenter = center;
      const [from, to] = mountedWindow(windowCenter, 200);
      assert.ok(from <= Math.max(0, center - 1) && to >= Math.min(199, center + 1), `card ${center}`);
    }
  });

  it("holds every card, with See all at the end once there are 2", () => {
    assert.deepEqual(spotlightRow(0), { slides: 0, seeAll: false, seeAllCount: 0 });
    assert.deepEqual(spotlightRow(1), { slides: 1, seeAll: false, seeAllCount: 1 });
    assert.deepEqual(spotlightRow(2), { slides: 3, seeAll: true, seeAllCount: 2 });
    // No cap: 200 public cards are 200 slides plus See all.
    assert.deepEqual(spotlightRow(200), { slides: 201, seeAll: true, seeAllCount: 200 });
  });

  it("sorts by value, then newest, with unknown values last", () => {
    const cards = [
      card("old-unknown", { createdAt: "2023-01-01T00:00:00.000Z" }),
      card("low"),
      card("new-unknown", { createdAt: "2025-01-01T00:00:00.000Z" }),
      card("high"),
      card("tie-old", { createdAt: "2022-01-01T00:00:00.000Z" }),
      card("tie-new", { createdAt: "2024-06-01T00:00:00.000Z" }),
      card("book-only", { estimatedSellPrice: 75 }),
    ];
    const values = new Map<string, CardValueResult>([
      ["low", ok(20)],
      ["high", ok(900)],
      ["tie-old", ok(50)],
      ["tie-new", ok(50)],
    ]);
    assert.deepEqual(
      sortSpotlightCards(cards, values).map((item) => item.id),
      ["high", "book-only", "tie-new", "tie-old", "low", "new-unknown", "old-unknown"],
    );
    // The input is left alone.
    assert.equal(cards[0].id, "old-unknown");
  });
});

describe("snap tick", () => {
  it("ticks only when a new card centers under the reader's own swipe", () => {
    const tick = createTickGate();
    // The first position is where the row opened: silent.
    assert.equal(tick(0, 0, true), false);
    assert.equal(tick(0, 50, true), false);
    assert.equal(tick(1, 200, true), true);
    assert.equal(tick(1, 400, true), false);
  });

  it("never ticks closer than 80ms apart in a hard spin", () => {
    const tick = createTickGate();
    tick(0, 0, true);
    const times: number[] = [];
    for (let step = 1; step <= 40; step += 1) {
      const now = step * 16;
      if (tick(step, now, true)) times.push(now);
    }
    assert.ok(times.length > 3);
    for (let i = 1; i < times.length; i += 1) {
      assert.ok(times[i] - times[i - 1] >= SPOT_TICK_GAP_MS);
    }
  });

  it("stays silent for a scroll the code started", () => {
    const tick = createTickGate();
    tick(0, 0, false);
    assert.equal(tick(1, 500, false), false);
    assert.equal(tick(2, 1000, false), false);
    // The index it reached is remembered, so the next swipe ticks from there.
    assert.equal(tick(2, 1500, true), false);
    assert.equal(tick(3, 2000, true), true);
  });
});

describe("glow colour", () => {
  it("is brand purple with no colour, a grey, or junk", () => {
    for (const accent of [null, undefined, "", "#888888", "#fff", "not-a-colour"]) {
      assert.equal(glowHue(accent), 262);
    }
    assert.equal(glowTint(null), "hsl(262 83% 58%)");
  });

  it("leans toward the card's colour but stays purple, never teal", () => {
    for (let hue = 0; hue < 360; hue += 1) {
      const c = 1;
      const x = 1 - Math.abs(((hue / 60) % 2) - 1);
      const [r, g, b] =
        hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
      const hex = `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
      const glow = glowHue(hex);
      assert.ok(glow >= 232 && glow <= 292, `${hex} -> ${glow}`);
      assert.ok(glow < 160 || glow > 200, `${hex} lands in teal`);
    }
    // Teal card colours (the "Teal" parallel swatch): the glow goes a little blue, not teal.
    assert.ok(glowHue("#14b8a6") >= 232);
    assert.ok(glowHue("#2dd4bf") >= 232);
    // A red card warms it, a blue card cools it.
    assert.ok(glowHue("#ef4444") > 262);
    assert.ok(glowHue("#3b82f6") < 262);
  });
});

describe("spotlight label", () => {
  it("names the player, then year, set, parallel and grade", () => {
    const label = spotLabel(
      card("a", { parallel: "Silver", grade: "PSA 10", conditionType: "graded", yearLabel: "2018-19" }),
      { kind: "estimate", text: "$412.00", isEstimate: true, showEbaySold: false },
    );
    assert.equal(label.title, "Sample Player");
    assert.equal(label.line, "2018-19 · Prizm · Silver · PSA 10");
    assert.equal(label.price, "Est. $412.00");
    assert.equal(label.openToOffers, false);
  });

  it("shows a value only when it is real", () => {
    const raw = card("a", { conditionType: "raw" });
    assert.equal(spotLabel(raw).price, null);
    assert.equal(spotLabel(raw, { kind: "none", text: "No sales found yet", isEstimate: false, showEbaySold: false }).price, null);
    assert.equal(spotLabel(raw, { kind: "status", text: "Value updating", isEstimate: false, showEbaySold: false }).price, null);
    assert.equal(spotLabel(raw, { kind: "estimate", text: "$0.00", isEstimate: true, showEbaySold: false }).price, null);
    assert.equal(spotLabel(raw, { kind: "estimate", text: "$NaN", isEstimate: true, showEbaySold: false }).price, null);
    assert.equal(spotLabel(raw, { kind: "last_sale", text: "Last sold $30.00", isEstimate: false, showEbaySold: false }).price, "Last sold $30.00");
    assert.equal(spotLabel(raw).line, "2018 · Prizm");
  });

  it("keeps Open to offers", () => {
    assert.equal(spotLabel(card("a", { openToOffers: true })).openToOffers, true);
    assert.equal(spotLabel(card("a", { openToOffers: null })).openToOffers, false);
  });
});
