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
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function renderLine(props: { count: number; total: number | null; previous: number | null }) {
  const { CollectionLine } = await import("@/components/card-added-panel");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(CollectionLine, props));
  });
  return {
    host,
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

function shownLine(host: HTMLElement) {
  return host.querySelector('[data-slot="collection-line"] [aria-hidden]')?.textContent ?? "";
}

function liveLine(host: HTMLElement) {
  return host.querySelector('[data-slot="collection-line"] [aria-live]')?.textContent ?? "";
}

function threeCards() {
  seq += 1;
  const a = card(`a-${seq}`);
  const b = card(`b-${seq}`);
  const added = card(`new-${seq}`);
  served = { [a.id]: ok(10), [b.id]: ok(20), [added.id]: ok(42) };
  return { cards: [a, b, added], added };
}

describe("reveal: collection line", () => {
  it("sits right under the value line, above Post it and Add another", async () => {
    const { cards, added } = threeCards();
    const view = await render(cards, added, ok(42));
    try {
      const line = view.host.querySelector('[data-slot="collection-line"]');
      const actions = view.host.querySelector('[data-slot="reveal-actions"]');
      assert.ok(line && actions);
      assert.ok(line.compareDocumentPosition(actions) & win.Node.DOCUMENT_POSITION_FOLLOWING);
      const value = [...view.host.querySelectorAll("p")].find((p) => /Worth about \$42\.00/.test(p.textContent ?? ""));
      assert.ok(value && value.compareDocumentPosition(line) & win.Node.DOCUMENT_POSITION_FOLLOWING);
      assert.match(line.className, /tabular-nums/);
    } finally {
      view.unmount();
    }
  });

  it("counts up from the old total to the new one in about 600ms, announcing only the final value", async () => {
    state.reducedMotion = false;
    const view = await renderLine({ count: 3, total: 72, previous: 30 });
    try {
      assert.equal(shownLine(view.host), "Your collection: 3 cards, about $30.00", "starts on the old total");
      assert.equal(liveLine(view.host), "Your collection: 3 cards, about $72.00", "only the final value is announced");
      const seen = new Set<string>();
      for (let step = 0; step < 14; step += 1) {
        await wait(25);
        seen.add(shownLine(view.host));
      }
      assert.ok([...seen].some((text) => /\$(3[1-9]|[4-6]\d|7[01])\.\d\d$/.test(text)), [...seen].join(" | "));
      await waitFor(() => shownLine(view.host) === "Your collection: 3 cards, about $72.00");
      await wait(300);
      assert.equal(shownLine(view.host), "Your collection: 3 cards, about $72.00", "lands on the final figure and stays");
      assert.equal(liveLine(view.host), "Your collection: 3 cards, about $72.00");
    } finally {
      view.unmount();
    }
  });

  it("shows the final figure at once under reduced motion", async () => {
    state.reducedMotion = true;
    try {
      const view = await renderLine({ count: 3, total: 72, previous: 30 });
      try {
        for (let step = 0; step < 6; step += 1) {
          assert.equal(shownLine(view.host), "Your collection: 3 cards, about $72.00");
          await wait(20);
        }
      } finally {
        view.unmount();
      }
    } finally {
      state.reducedMotion = false;
    }
  });

  it("never animates from or to a missing figure, and never shows $0", async () => {
    for (const props of [
      { count: 2, total: null, previous: null },
      { count: 2, total: 42, previous: null },
      { count: 2, total: null, previous: 30 },
      { count: 1, total: 0, previous: null },
    ]) {
      const view = await renderLine(props);
      try {
        const first = shownLine(view.host);
        await wait(80);
        assert.equal(shownLine(view.host), first, JSON.stringify(props));
        assert.doesNotMatch(first, /\$0(?:\.00)?\b/);
        assert.equal(first, liveLine(view.host));
      } finally {
        view.unmount();
      }
    }
  });

  it("without a real total shows the count only: no $0 and nothing animates", async () => {
    seq += 1;
    const a = card(`a-${seq}`);
    const added = card(`new-${seq}`);
    served = {};
    const view = await render([a, added], added, null);
    try {
      await wait(120);
      assert.equal(shownLine(view.host), "Your collection: 2 cards");
      assert.doesNotMatch(view.host.textContent ?? "", /\$0(?:\.00)?\b/);
    } finally {
      view.unmount();
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

describe("reveal: the slab glides in from Review", () => {
  it("plays one move-and-scale from the Review slab, and skips the turn-in", async () => {
    const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    const proto = win.HTMLElement.prototype as unknown as Record<string, unknown>;
    const before = { animate: proto.animate, rect: proto.getBoundingClientRect };
    proto.animate = function (frames: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ frames, options });
      return {};
    };
    proto.getBoundingClientRect = function (this: HTMLElement) {
      return this.dataset.slabMorph === "source"
        ? { left: 120, top: 400, width: 128, height: 213, right: 248, bottom: 613, x: 120, y: 400 }
        : { left: 115, top: 120, width: 144, height: 240, right: 259, bottom: 360, x: 115, y: 120 };
    };
    const source = win.document.createElement("div");
    source.dataset.slabMorph = "source";
    win.document.body.appendChild(source);
    try {
      const { captureSlabMorph } = await import("@/lib/cards/slab-morph");
      assert.equal(captureSlabMorph(), true);
      source.remove();
      const { cards, added } = threeCards();
      const view = await render(cards, added, ok(42));
      try {
        const slab = view.host.querySelector<HTMLElement>('[data-reveal="slab"]')!;
        assert.equal(slab.dataset.morph, "on");
        assert.match(slab.className, /data-\[morph=on\]:animate-none/);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].options.duration, 340);
        assert.match(String(calls[0].frames[0].transform), /^translate\(5px, 280px\) scale\(/);
      } finally {
        view.unmount();
      }
    } finally {
      proto.animate = before.animate;
      proto.getBoundingClientRect = before.rect;
    }
  });

  it("keeps the glow, off under reduced motion, and adds no confetti, sparkles or second glow", () => {
    const panel = read("components/card-added-panel.tsx");
    assert.match(panel, /data-reveal="glow"[^>]*motion-reduce:hidden/);
    assert.equal(panel.match(/data-reveal="glow"/g)?.length, 1);
    assert.doesNotMatch(panel, /confetti|sparkle|particle|teal|font-bold|animate-pulse/i);
    assert.equal((panel.match(/haptic\(/g) ?? []).length, 0, "the haptic stays in card-form");
    const form = read("components/card-form.tsx");
    assert.equal((form.match(/haptic\(/g) ?? []).length, 1);
    assert.match(form, /if \(!existing\) haptic\(postedNow \? "post" : "save"\);/);
  });
});
