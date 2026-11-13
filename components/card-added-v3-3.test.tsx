import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import { confidenceCopy, matchConfidence } from "@/lib/value/match-confidence";

const { win, state } = installDom();
let served: Record<string, CardValueResult> = {};
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: async (url: unknown) => {
    const ids = new URL(String(url), "http://localhost").searchParams.get("ids")?.split(",") ?? [];
    const values = Object.fromEntries(ids.filter((id) => served[id]).map((id) => [id, served[id]]));
    return new win.Response(JSON.stringify({ values }), { status: 200 });
  },
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

let seq = 0;
function card(id: string, patch: Partial<SportsCard> = {}): SportsCard {
  return {
    id,
    playerName: "Fixture Player",
    year: 2024,
    yearLabel: "2024",
    setBrand: "Panini Prizm",
    cardNumber: "1",
    grade: "Raw",
    conditionType: "raw",
    parallel: "Base",
    serialRun: null,
    serialNo: null,
    isAuto: false,
    sport: "Football",
    purchasePrice: null,
    purchaseDate: "",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7C3AED",
    gradeQualifier: "",
    certNumber: "",
    createdAt: "2026-10-28T00:00:00.000Z",
    ...patch,
  } as unknown as SportsCard;
}

const ok = (median: number): CardValueResult => ({ status: "ok", median, low: median, high: median, nSales: 6, matchedAt: null });

async function render(cards: SportsCard[], added: SportsCard, value: CardValueResult | null) {
  const { CardAddedPanel } = await import("@/components/card-added-panel");
  const { CollectionContext } = await import("@/components/collection-provider");
  const collection = {
    ready: true,
    cards,
    syncError: null,
    getCard: () => added,
    addCard() {},
    updateCard() {},
    removeCard() {},
    reload() {},
  };
  const confidence = matchConfidence(added, value);
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        CollectionContext.Provider,
        { value: collection as never },
        createElement(CardAddedPanel, {
          cardId: added.id,
          value,
          loading: false,
          sales: [],
          salesLoading: false,
          confidence,
          copy: confidenceCopy(confidence, added),
          onDismiss() {},
          onSeeSales() {},
        }) as ReactNode,
      ),
    );
  });
  return {
    // The scene renders in a portal on document.body.
    host: win.document.body as HTMLElement,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function waitFor(check: () => boolean, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) return;
    await wait(10);
  }
  throw new Error(`timed out: ${win.document.body.textContent?.slice(0, 400)}`);
}

function threeCards() {
  seq += 1;
  const a = card(`a-${seq}`);
  const b = card(`b-${seq}`);
  const added = card(`new-${seq}`);
  served = { [a.id]: ok(10), [b.id]: ok(20), [added.id]: ok(42) };
  return { cards: [a, b, added], added };
}

describe("Added: the flip lands", () => {
  it("drops the collection line for one big price", async () => {
    const { cards, added } = threeCards();
    const view = await render(cards, added, ok(42));
    try {
      assert.equal(view.host.querySelector('[data-slot="collection-line"]'), null);
      assert.doesNotMatch(view.host.textContent ?? "", /Your collection:/);
      assert.match(view.host.querySelector('[data-slot="added-price"]')?.textContent ?? "", /\$42\.00/);
    } finally {
      view.unmount();
    }
  });

  it("bursts brand confetti once as the flip lands, with motion allowed", async () => {
    state.reducedMotion = false;
    const { cards, added } = threeCards();
    const view = await render(cards, added, ok(42));
    try {
      assert.equal(view.host.querySelector('[data-reveal="confetti"]'), null, "not before the flip lands");
      await waitFor(() => view.host.querySelector('[data-reveal="confetti"]') != null);
      const pieces = [...view.host.querySelectorAll<HTMLElement>('[data-reveal="confetti"] span')];
      assert.ok(pieces.length >= 10 && pieces.length <= 16, "a short burst");
      for (const piece of pieces) {
        assert.match(piece.className, /added-confetti/);
        assert.ok(["rgb(124, 58, 237)", "rgb(167, 139, 250)", "rgb(91, 33, 182)", "rgb(244, 244, 245)"].includes(piece.style.backgroundColor), piece.style.backgroundColor);
      }
      assert.equal(view.host.querySelector('[data-reveal="confetti"]')?.getAttribute("aria-hidden"), "true");
    } finally {
      view.unmount();
    }
  });

  it("skips the confetti under reduced motion", async () => {
    state.reducedMotion = true;
    try {
      const { cards, added } = threeCards();
      const view = await render(cards, added, ok(42));
      try {
        await wait(20);
        assert.equal(view.host.querySelector('[data-reveal="confetti"]'), null);
        assert.match(view.host.querySelector('[data-slot="added-price"]')?.textContent ?? "", /\$42\.00/, "the price still shows");
      } finally {
        view.unmount();
      }
    } finally {
      state.reducedMotion = false;
    }
  });
});

describe("reveal: one milestone line", () => {
  it("replaces the Added line for the 10th card, and screen readers still hear Added", async () => {
    seq += 1;
    const cards = Array.from({ length: 9 }, (_, index) => card(`m-${seq}-${index}`));
    const added = card(`new-${seq}`, { conditionType: "graded", grade: "PSA 10" });
    served = {};
    const view = await render([...cards, added], added, null);
    try {
      const h2 = view.host.querySelector("h2")!;
      assert.equal(h2.querySelector('[data-slot="milestone"]')?.textContent, "Card 10 in your collection.");
      assert.match(h2.querySelector(".sr-only")?.textContent ?? "", /Added to your collection/);
      assert.doesNotMatch(view.host.textContent ?? "", /first slab/, "one line only");
    } finally {
      view.unmount();
    }
  });

  it("keeps the plain Added line when nothing is worth naming", async () => {
    seq += 1;
    const cards = Array.from({ length: 4 }, (_, index) => card(`p-${seq}-${index}`));
    const added = card(`new-${seq}`);
    served = {};
    const view = await render([...cards, added], added, null);
    try {
      assert.equal(view.host.querySelector("h2")?.textContent, "Added to your collection");
      assert.equal(view.host.querySelector('[data-slot="milestone"]'), null);
    } finally {
      view.unmount();
    }
  });
});

describe("Added: the 3D flip", () => {
  it("uses up the Review slab's glide, so only the flip plays", async () => {
    const calls: unknown[] = [];
    const proto = win.HTMLElement.prototype as unknown as Record<string, unknown>;
    const before = { animate: proto.animate, rect: proto.getBoundingClientRect };
    proto.animate = function (...args: unknown[]) {
      calls.push(args);
      return {};
    };
    proto.getBoundingClientRect = function () {
      return { left: 120, top: 400, width: 128, height: 213, right: 248, bottom: 613, x: 120, y: 400 };
    };
    const source = win.document.createElement("div");
    source.dataset.slabMorph = "source";
    win.document.body.appendChild(source);
    try {
      const { captureSlabMorph, takeSlabMorph } = await import("@/lib/cards/slab-morph");
      assert.equal(captureSlabMorph(), true);
      source.remove();
      const { cards, added } = threeCards();
      const view = await render(cards, added, ok(42));
      try {
        assert.equal(calls.length, 0, "no glide on top of the flip");
        assert.equal(takeSlabMorph(), null, "the glide's record is used up");
        assert.ok(view.host.querySelector('[data-reveal="flip"] [data-reveal="slab"]'));
        assert.ok(view.host.querySelector('[data-reveal="flip"] [data-reveal="back"]'), "the card's back turns over");
      } finally {
        view.unmount();
      }
    } finally {
      proto.animate = before.animate;
      proto.getBoundingClientRect = before.rect;
    }
  });

  it("keeps the slab inside its 3:5 frame, so it never covers the Added line", () => {
    // aspect-ratio's automatic minimum would let the art's min-content width widen
    // the frame (and so the slab's height). min-w-0 keeps the frame at 3:5.
    const panel = read("components/card-added-panel.tsx");
    const frame = panel.match(/data-reveal="frame"\s+className="([^"]+)"/)?.[1] ?? "";
    assert.match(frame, /(?:^|\s)aspect-\[3\/5\](?:\s|$)/);
    assert.match(frame, /(?:^|\s)min-w-0(?:\s|$)/);
  });

  it("keeps one glow and the confetti off under reduced motion, with one haptic as the flip lands", () => {
    const panel = read("components/card-added-panel.tsx");
    assert.match(panel, /data-reveal="glow"[^>]*motion-reduce:hidden/);
    assert.equal(panel.match(/data-reveal="glow"/g)?.length, 1);
    assert.doesNotMatch(panel, /sparkle|particle|teal|font-bold|animate-pulse/i);
    assert.match(panel, /\{landed && !reduce \? <Confetti \/> : null\}/);
    const css = read("app/globals.css");
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.added-confetti \{\s*display: none;/);
    assert.equal((panel.match(/haptic\(/g) ?? []).length, 1, "one tap as the flip lands");
    assert.match(panel, /haptic\("tick"\)/);
    // The save keeps its own success buzz.
    const form = read("components/card-form.tsx");
    assert.equal((form.match(/haptic\(/g) ?? []).length, 1);
    assert.match(form, /if \(!existing\) haptic\(postedNow \? "post" : "save"\);/);
  });
});
