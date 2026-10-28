import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import { NOT_SURE_PARALLEL, confidenceCopy, matchConfidence } from "@/lib/value/match-confidence";

const { win } = installDom();
const fetched: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: async (url: unknown) => {
    fetched.push(String(url));
    return new win.Response(JSON.stringify({ values: {} }), { status: 200 });
  },
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const card = {
  id: "card-1",
  playerName: "Fixture Player",
  year: 2024,
  yearLabel: "2024",
  setBrand: "Panini Prizm",
  cardNumber: "1",
  grade: "Raw",
  conditionType: "raw",
  parallel: "Base",
  serialRun: null,
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
} as unknown as SportsCard;

const value: CardValueResult = {
  status: "ok",
  median: 42,
  low: 30,
  high: 50,
  nSales: 6,
  matchedAt: null,
};

const sales = [
  { id: "a", soldPrice: 40, soldDate: "2026-09-01T00:00:00Z" },
  { id: "b", soldPrice: 44, soldDate: "2026-10-20T00:00:00Z" },
  { id: "c", soldPrice: 41, soldDate: "2026-10-01T00:00:00Z" },
  { id: "d", soldPrice: 39, soldDate: "2026-10-10T00:00:00Z" },
];

async function render(cardInPanel: SportsCard, extra: Record<string, unknown> = {}) {
  const { CardAddedPanel } = await import("@/components/card-added-panel");
  const { CollectionContext } = await import("@/components/collection-provider");
  const collection = {
    ready: true,
    cards: [cardInPanel],
    syncError: null,
    getCard: () => cardInPanel,
    addCard() {},
    updateCard() {},
    removeCard() {},
    reload() {},
  };
  const confidence = matchConfidence(cardInPanel, value);
  const props = {
    cardId: cardInPanel.id,
    value,
    loading: false,
    sales,
    salesLoading: false,
    confidence,
    copy: confidenceCopy(confidence, cardInPanel),
    onDismiss() {},
    onSeeSales() {},
    ...extra,
  };
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        CollectionContext.Provider,
        { value: collection as never },
        createElement(CardAddedPanel, props) as ReactNode,
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

describe("finish reveal", () => {
  it("shows the tile, the value, three recent sold prices and the two buttons", async () => {
    fetched.length = 0;
    const view = await render(card);
    try {
      const text = view.host.textContent ?? "";
      assert.ok(view.host.querySelector('[data-reveal="slab"] [data-kind]'), "slab tile");
      assert.match(text, /Added to your collection/);
      assert.match(text, /Worth about \$42\.00 based on 6 recent sales\./);
      const rows = [...view.host.querySelectorAll('ul[aria-label="Recent sold prices"] li')].map(
        (li) => li.textContent,
      );
      assert.deepEqual(rows, ["$44.00Oct 20", "$39.00Oct 10", "$41.00Oct 1"]);
      assert.match(text, /via Trawl/);
      assert.doesNotMatch(text, /eBay/);
      const another = [...view.host.querySelectorAll("a")].find((a) => a.textContent === "Add another");
      assert.equal(another?.getAttribute("href"), "/cards/new?sport=Football");
      assert.ok([...view.host.querySelectorAll("button")].some((b) => b.textContent === "See all sales"));
      assert.equal(fetched.filter((url) => url.includes("/api/comps")).length, 0, "no sold comps fetch");
    } finally {
      view.unmount();
    }
  });

  it("shows no dollar figure for a weak or none match", async () => {
    for (const patch of [{ parallel: "Gold /10" }, { parallel: NOT_SURE_PARALLEL }]) {
      const view = await render({ ...card, ...patch } as SportsCard);
      try {
        const live = view.host.querySelector('[aria-live="polite"]')?.textContent ?? "";
        assert.doesNotMatch(live, /\$/);
        assert.equal(view.host.querySelector('ul[aria-label="Recent sold prices"]'), null);
        assert.match(
          live,
          patch.parallel === NOT_SURE_PARALLEL
            ? /No price yetPick your parallel to see a price/
            : /We need one more detail to price thisAdd the print run/,
        );
        const fix = [...view.host.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/cards/card-1/edit");
        assert.ok(fix, "one tap to Edit");
      } finally {
        view.unmount();
      }
    }
  });

  it("shows a skeleton while the value is pending", async () => {
    const view = await render(card, { value: null, loading: true, sales: null, salesLoading: true });
    try {
      const live = view.host.querySelector('[aria-live="polite"]');
      assert.equal(live?.querySelector('[aria-busy="true"]') != null, true);
      assert.match(live?.textContent ?? "", /Finding recent sales…/);
      assert.doesNotMatch(live?.textContent ?? "", /\$0/);
    } finally {
      view.unmount();
    }
  });

  it("gets its sales from the card page's comps, not a fetch of its own", () => {
    const panel = read("components/card-added-panel.tsx");
    assert.doesNotMatch(panel, /useSoldComps|fetch\(/);
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /const sold = useSoldComps\(/);
    assert.match(detail, /sales=\{sold\.status === "ready" \? onScreenComps : null\}/);
  });
});

describe("card page value line", () => {
  it("holds the price back for a weak or none match", () => {
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /const confidence = cardSold \? "strong" : matchConfidence\(card, shownValue, confidenceOptions\)/);
    assert.match(detail, /const pricedAmount = heldCopy \? null : storedAmount/);
    assert.match(detail, /heldCopy\s*\? \{ kind: "status", text: heldCopy\.text/);
    // A held price reads as a status, so the chart's median (estimate only) stays empty.
    assert.match(detail, /median=\{priceRead\?\.kind === "estimate" \? storedAmount : null\}/);
    // Paid vs estimate is off the card page, so nothing else reads the held amount.
    assert.doesNotMatch(detail, /const estSell = /);
    assert.doesNotMatch(detail, /estimatedSellPrice: storedAmount/);
    assert.match(detail, /data-slot="price-held"/);
  });
});
