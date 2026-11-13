import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import { confidenceCopy, matchConfidence } from "@/lib/value/match-confidence";

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
    // The scene renders in a portal on document.body.
    host: win.document.body as HTMLElement,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("Added screen: Copy this card", () => {
  const label = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

  it("is not on the Added screen, which keeps two buttons; the card page still has it", async () => {
    const view = await render({ ...card, parallel: "Downtown", grade: "PSA 10", conditionType: "graded" } as SportsCard);
    try {
      assert.equal(view.host.querySelector('a[data-slot="copy-card"]'), null);
      const actions = view.host.querySelector('[data-slot="reveal-actions"]')!;
      // Add another keeps its meaning: no number.
      const another = [...actions.querySelectorAll("a")].find((el) => label(el) === "Add another");
      assert.doesNotMatch(another?.getAttribute("href") ?? "", /num=/);
    } finally {
      view.unmount();
    }
    // Once the Added screen closes, the card page shows its own Copy this card.
    assert.match(read("components/card-detail.tsx"), /data-slot="copy-card"/);
  });

  it("sizes the card by screen height, so the scene still fits 390x844", () => {
    const panel = read("components/card-added-panel.tsx");
    assert.match(panel, /100svh-31rem-env\(safe-area-inset-bottom\)/);
  });
});
