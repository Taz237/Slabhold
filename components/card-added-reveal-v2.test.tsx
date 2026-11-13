import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

const { win } = installDom();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, writable: true, value: win.sessionStorage });
const fetched: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: async (url: unknown) => {
    fetched.push(String(url));
    return new win.Response(JSON.stringify({ values: {} }), { status: 200 });
  },
});

const card = {
  id: "card-1",
  playerName: "Tyrese Maxey",
  year: 2024,
  yearLabel: "2024-25",
  setBrand: "Donruss Optic",
  cardNumber: "7",
  grade: "Raw",
  conditionType: "raw",
  parallel: "Downtown",
  parallelIsCustom: true,
  serialRun: null,
  isAuto: false,
  sport: "Basketball",
  purchasePrice: 125,
  purchaseDate: "",
  estimatedSellPrice: 0,
  sellPrice: null,
  sellDate: null,
  notes: "",
  photoDataUrl: null,
  accent: "#7C3AED",
  gradeQualifier: "",
  certNumber: "",
  isPublic: true,
  createdAt: "2026-11-10T00:00:00.000Z",
} as unknown as SportsCard;

const value: CardValueResult = { status: "ok", median: 42, low: 30, high: 50, nSales: 6, matchedAt: null };

async function render(cardInPanel: SportsCard) {
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
          cardId: cardInPanel.id,
          value,
          loading: false,
          sales: [],
          salesLoading: false,
          viewer: { id: "user-1", username: "fixture" },
          onTogglePublic: () => undefined,
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

const links = (host: HTMLElement) => [...host.querySelectorAll("a")];

describe("Added screen v2", () => {
  it("has two buttons, Add another (with player/year/set) and Share, and no Post it or progress copy", async () => {
    win.sessionStorage.clear();
    fetched.length = 0;
    const view = await render(card);
    try {
      const actions = view.host.querySelector('[data-slot="reveal-actions"]')!;
      const names = [...actions.querySelectorAll("a,button")].map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim());
      assert.deepEqual(names, ["Add another", "Share card"]);
      const another = links(view.host).find((a) => a.textContent === "Add another");
      const url = new URL(another!.getAttribute("href")!, "https://slabhold.app");
      assert.equal(url.searchParams.get("player"), "Tyrese Maxey");
      assert.equal(url.searchParams.get("year"), "2024-25");
      assert.equal(url.searchParams.get("set"), "Donruss Optic");
      assert.doesNotMatch(view.host.textContent ?? "", /Post it|Collector:|Your collection:|Copy this card/);
      assert.equal(fetched.filter((u) => u.includes("/api/comps") || u.includes("card_values")).length, 0);
    } finally {
      view.unmount();
    }
  });

  it("says plainly when this add's feed post failed", async () => {
    win.sessionStorage.clear();
    win.sessionStorage.setItem("slabhold.card-post-failed", JSON.stringify({ "card-1": "Downtown!" }));
    const view = await render(card);
    try {
      assert.match(view.host.textContent ?? "", /Couldn't post to your feed\./);
    } finally {
      view.unmount();
    }
  });

  it("checks a background post again when it lands", async () => {
    win.sessionStorage.clear();
    const { queueCardPost } = await import("@/lib/social/card-post-queue");
    let finish: (value: { postId: string | null }) => void = () => undefined;
    const running = queueCardPost("card-1", () => new Promise((resolve) => (finish = resolve)));
    const view = await render(card);
    try {
      assert.doesNotMatch(view.host.textContent ?? "", /Couldn't post/);
      win.sessionStorage.setItem("slabhold.card-post-failed", JSON.stringify({ "card-1": "Downtown!" }));
      await act(async () => {
        finish({ postId: null });
        await running;
      });
      assert.match(view.host.textContent ?? "", /Couldn't post to your feed\./);
    } finally {
      view.unmount();
    }
  });

  it("puts a small Public / Private switch at the end that saves and remembers the choice", async () => {
    win.sessionStorage.clear();
    const view = await render({ ...card, isPublic: false } as SportsCard);
    try {
      const toggle = view.host.querySelector<HTMLButtonElement>('[data-slot="added-visibility"] button[role="switch"]');
      assert.ok(toggle);
      assert.equal(toggle.getAttribute("aria-checked"), "false");
      assert.match(toggle.className, /min-h-11/, "44px tap target");
      assert.match(toggle.className, /text-13/, "small (13px at the default text size)");
      const actions = view.host.querySelector('[data-slot="reveal-actions"]')!;
      assert.ok(actions.compareDocumentPosition(toggle) & win.Node.DOCUMENT_POSITION_FOLLOWING, "after the two buttons");
      await act(async () => toggle.click());
      const { readBrowserVisibilityChoice } = await import("@/lib/cards/visibility-choice");
      assert.equal(readBrowserVisibilityChoice("user-1"), true);
    } finally {
      view.unmount();
    }
  });

  it("keeps the glow violet and off under reduced motion", () => {
    const panel = readFileSync(join(process.cwd(), "components/card-added-panel.tsx"), "utf8");
    assert.match(panel, /motion-safe:animate-\[reveal-glow/);
    assert.doesNotMatch(panel, /teal|cyan|animate-pulse|font-bold/);
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const glow = css.slice(css.indexOf("@keyframes reveal-glow"), css.indexOf("/* Skeleton shimmer"));
    assert.doesNotMatch(glow, /infinite|transform/);
  });
});
