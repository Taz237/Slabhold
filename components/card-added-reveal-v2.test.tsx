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
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const links = (host: HTMLElement) => [...host.querySelectorAll("a")];

describe("Added reveal v2", () => {
  it("shows Share, Post it with the card attached, Add another with player/year/set, and Collector progress", async () => {
    win.sessionStorage.clear();
    fetched.length = 0;
    const view = await render(card);
    try {
      assert.ok(view.host.querySelector('button[aria-label="Share card"]'), "Share");
      const post = links(view.host).find((a) => a.textContent?.includes("Post it"));
      assert.equal(post?.getAttribute("href"), "/compose?card=card-1");
      const another = links(view.host).find((a) => a.textContent === "Add another");
      const url = new URL(another!.getAttribute("href")!, "https://slabhold.app");
      assert.equal(url.searchParams.get("player"), "Tyrese Maxey");
      assert.equal(url.searchParams.get("year"), "2024-25");
      assert.equal(url.searchParams.get("set"), "Donruss Optic");
      const progress = view.host.querySelector('[data-slot="collector-progress"]')?.textContent ?? "";
      assert.match(progress, /Collector: 0 of 10 photo cards to Bronze\./);
      assert.match(progress, /This one needs a photo to count\./, "no photo: does not pretend it counted");
      assert.equal(links(view.host).find((a) => a.textContent === "Add a photo to this card")?.getAttribute("href"), "/cards/card-1/edit");
      assert.equal(fetched.filter((u) => u.includes("/api/comps") || u.includes("card_values")).length, 0);
      // Post it hands the composer the prefilled caption.
      await act(async () => post!.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })));
      assert.match(win.sessionStorage.getItem("slabhold.compose-caption") ?? "", /Just added my 2024-25 Donruss Optic Downtown Tyrese Maxey/);
    } finally {
      view.unmount();
    }
  });

  it("hides Post it and shows View post when this add already posted", async () => {
    win.sessionStorage.clear();
    win.sessionStorage.setItem("slabhold.card-posts", JSON.stringify({ "card-1": "post-9" }));
    win.sessionStorage.setItem("slabhold.shared-post", JSON.stringify({ cardId: "card-1", postId: "post-9" }));
    const view = await render(card);
    try {
      assert.equal(links(view.host).some((a) => a.textContent?.includes("Post it")), false);
      const viewPost = links(view.host).find((a) => a.textContent === "View post");
      assert.equal(viewPost?.getAttribute("href"), "/posts/post-9");
      assert.match(view.host.textContent ?? "", /Shared to your feed\./);
    } finally {
      view.unmount();
    }
  });

  it("opens before a background post lands, then shows it without a second post", async () => {
    win.sessionStorage.clear();
    const { queueCardPost } = await import("@/lib/social/card-post-queue");
    let finish: (value: { postId: string | null }) => void = () => undefined;
    const running = queueCardPost("card-1", () => new Promise((resolve) => (finish = resolve)));
    const view = await render(card);
    try {
      assert.match(view.host.textContent ?? "", /Posting to your feed/);
      assert.equal(links(view.host).some((a) => a.textContent?.includes("Post it")), false, "no Post it while posting");
      win.sessionStorage.setItem("slabhold.card-posts", JSON.stringify({ "card-1": "post-3" }));
      await act(async () => {
        finish({ postId: "post-3" });
        await running;
      });
      assert.match(view.host.textContent ?? "", /Shared to your feed\./);
      assert.equal(links(view.host).find((a) => a.textContent === "View post")?.getAttribute("href"), "/posts/post-3");
    } finally {
      view.unmount();
    }
  });

  it("says a failed post failed and still offers Post it", async () => {
    win.sessionStorage.clear();
    win.sessionStorage.setItem("slabhold.card-post-failed", JSON.stringify({ "card-1": "Downtown!" }));
    const view = await render(card);
    try {
      assert.match(view.host.textContent ?? "", /couldn't post it to your feed/);
      assert.ok(links(view.host).some((a) => a.textContent?.includes("Post it")));
    } finally {
      view.unmount();
    }
  });

  it("asks a private card to go public before Post it, without leaking it", async () => {
    win.sessionStorage.clear();
    const view = await render({ ...card, isPublic: false } as SportsCard);
    try {
      assert.equal(links(view.host).some((a) => a.getAttribute("href")?.startsWith("/compose")), false);
      const button = [...view.host.querySelectorAll("button")].find((b) => b.textContent?.includes("Post it"));
      assert.ok(button);
      await act(async () => button.click());
      const dialog = win.document.querySelector('[role="dialog"]');
      assert.match(dialog?.textContent ?? "", /Make this card public to post it/);
      assert.equal(dialog?.querySelector('a[href^="/compose"]'), null);
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
