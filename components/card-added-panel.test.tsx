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
    // The scene renders in a portal on document.body.
    host: win.document.body as HTMLElement,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("finish reveal", () => {
  it("shows the card, one big price, and only two buttons; recent sales wait behind See sales", async () => {
    fetched.length = 0;
    const view = await render(card);
    try {
      const text = () => view.host.textContent ?? "";
      assert.ok(view.host.querySelector('[data-reveal="slab"] [data-kind]'), "slab tile");
      assert.match(text(), /Added to your collection/);
      // The same figure as before, in big type, and the full sentence for screen readers.
      const price = view.host.querySelector('[data-slot="added-price"]');
      assert.match(price?.textContent ?? "", /\$42\.00/);
      assert.match(price?.textContent ?? "", /6 recent sales/);
      assert.match(text(), /Worth about \$42\.00 based on 6 recent sales\./);
      // Hidden until a tap.
      assert.equal(view.host.querySelector('ul[aria-label="Recent sold prices"]'), null);
      const see = [...view.host.querySelectorAll("button")].find((b) => b.textContent === "See sales");
      assert.ok(see);
      assert.equal(see.getAttribute("aria-expanded"), "false");
      assert.match(see.className, /min-h-11/, "44px tap target");
      await act(async () => see.click());
      assert.equal(see.getAttribute("aria-expanded"), "true");
      const rows = [...view.host.querySelectorAll('ul[aria-label="Recent sold prices"] li')].map((li) => li.textContent);
      assert.deepEqual(rows, ["$44.00Oct 20", "$39.00Oct 10", "$41.00Oct 1"]);
      assert.match(text(), /via Trawl/);
      assert.doesNotMatch(text(), /eBay/);
      const another = [...view.host.querySelectorAll("a")].find((a) => a.textContent === "Add another");
      assert.equal(another?.getAttribute("href"), "/cards/new?sport=Football&player=Fixture%20Player&year=2024&set=Panini%20Prizm");
      assert.equal(fetched.filter((url) => url.includes("/api/comps")).length, 0, "no sold comps fetch");
    } finally {
      view.unmount();
    }
  });

  it("sends See sales to the card page's sales when none are loaded here", async () => {
    let seen = 0;
    const view = await render(card, { sales: null, onSeeSales: () => seen++ });
    try {
      const see = [...view.host.querySelectorAll("button")].find((b) => b.textContent === "See sales");
      await act(async () => see!.click());
      assert.equal(seen, 1);
    } finally {
      view.unmount();
    }
  });

  it("is a labelled modal scene over a blurred, dimmed page that closes on Escape", async () => {
    let dismissed = 0;
    const view = await render(card, { onDismiss: () => dismissed++ });
    try {
      const dialog = view.host.querySelector('[role="dialog"]');
      assert.equal(dialog?.getAttribute("aria-modal"), "true");
      // On document.body, so the tab bar and the page column's layer never cover it.
      assert.equal(win.document.querySelector('[data-slot="added-scene"]')?.parentElement, win.document.body);
      const title = win.document.getElementById(dialog?.getAttribute("aria-labelledby") ?? "");
      assert.match(title?.textContent ?? "", /Added/);
      assert.match(read("components/card-added-panel.tsx"), /backdrop-blur-xl/);
      await act(async () => {
        win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
      });
      assert.equal(dismissed, 1);
      for (const node of view.host.querySelectorAll("button, a")) {
        const name = (node.getAttribute("aria-label") ?? node.textContent ?? "").trim();
        assert.ok(name.length > 0, node.outerHTML.slice(0, 80));
      }
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

describe("reveal fits one phone screen", () => {
  const label = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

  it("has Add another as the main button and Share beside it, both 48px", async () => {
    const view = await render(card);
    try {
      const actions = view.host.querySelector('[data-slot="reveal-actions"]');
      assert.ok(actions, "one actions block");
      const order = [...actions.querySelectorAll("a,button")].map(label);
      assert.deepEqual(order, ["Add another", "Share card"]);
      const another = [...actions.querySelectorAll("a")].find((el) => label(el) === "Add another");
      assert.match(another?.className ?? "", /bg-violet-600/, "Add another is the main button");
      assert.match(another?.className ?? "", /min-h-12/);
      const share = actions.querySelector('button[aria-label="Share card"]');
      assert.match(share?.className ?? "", /min-h-12/);
      assert.doesNotMatch(share?.className ?? "", /bg-violet-600/, "one main button");
      assert.equal(share?.textContent, "Share");
    } finally {
      view.unmount();
    }
  });

  it("keeps the heading and price above the buttons", async () => {
    const view = await render(card);
    try {
      const actions = view.host.querySelector('[data-slot="reveal-actions"]');
      const price = view.host.querySelector('[data-slot="added-price"]');
      assert.ok(actions && price);
      assert.ok(price.compareDocumentPosition(actions) & win.Node.DOCUMENT_POSITION_FOLLOWING);
      const headline = [...view.host.querySelectorAll("h2")].find((h) => /Added/.test(h.textContent ?? ""));
      assert.ok(headline && headline.compareDocumentPosition(actions) & win.Node.DOCUMENT_POSITION_FOLLOWING);
    } finally {
      view.unmount();
    }
  });

  it("puts the reveal above the Private switch on the card page", () => {
    const detail = read("components/card-detail.tsx");
    const panelAt = detail.indexOf("<LazyCardAddedPanel");
    const switchAt = detail.indexOf("<CardVisibilitySwitch");
    assert.ok(detail.indexOf("<CardTopBar") < panelAt && panelAt < switchAt && switchAt < detail.indexOf("<CardHero"));
  });

  it("sizes the card by screen height on phones, never cropped, and flips it in only with motion allowed", () => {
    const panel = read("components/card-added-panel.tsx");
    const frame = panel.match(/data-reveal="frame"\s+className="([^"]+)"/)?.[1] ?? "";
    assert.match(frame, /aspect-\[3\/5\]/, "keeps the slab's shape");
    assert.match(frame, /h-\[clamp\([^\]]*100svh[^\]]*env\(safe-area-inset-bottom\)[^\]]*,16rem\)\]/);
    assert.doesNotMatch(frame, /overflow-hidden|object-cover/);
    assert.match(panel, /data-reveal="glow"[\s\S]*?motion-safe:animate-\[reveal-glow/);
    // The 3D flip, and a plain fade under reduced motion; the card's back is hidden then.
    assert.match(panel, /data-reveal="flip"[^>]*motion-safe:animate-\[added-flip[^"]*motion-reduce:animate-\[add-fade/);
    assert.match(panel, /data-reveal="back"[^>]*motion-reduce:hidden/);
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
