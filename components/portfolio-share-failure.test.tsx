import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { collectionShare, PortfolioHero, type PortfolioHeroProps } from "@/components/portfolio-hero";
import { addDays } from "@/lib/chart/range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";

installDom();

const today = snapshotDateInNewYork();
const rows = Array.from({ length: 40 }, (_, index) => ({
  snapshot_date: addDays(today, index - 40),
  value: index < 15 ? 41 : 260,
}));

const props: PortfolioHeroProps = {
  cardCount: 3,
  collectionValue: 285,
  profitTotal: 250,
  pricedCount: 2,
  pricedInvested: 1000,
  investedAmount: 1100,
  paidCount: 2,
  withoutValueCount: 1,
  valuesLoading: false,
  valuesFailed: false,
  valuesMessage: null,
  onRetry: () => {},
  snapshots: { rows, loading: false },
  shareable: true,
};

const realLoad = collectionShare.load;
const realWarn = console.warn;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  collectionShare.load = realLoad;
  console.warn = realWarn;
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe("Share collection when its code fails to load", () => {
  it("says so under the button, re-enables it, and a later tap tries again", async () => {
    const warned: unknown[][] = [];
    console.warn = (...args: unknown[]) => void warned.push(args);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => void unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    let loads = 0;
    collectionShare.load = () => {
      loads++;
      return Promise.reject(new Error("ChunkLoadError"));
    };

    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(PortfolioHero, props)));
    const button = () => host.querySelector<HTMLButtonElement>('button[aria-label="Share your collection chart"]')!;
    assert.ok(button());
    assert.equal(host.textContent?.includes("Couldn't open sharing"), false);

    act(() => button().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    await new Promise((resolve) => setImmediate(resolve));
    process.off("unhandledRejection", onUnhandled);

    assert.deepEqual(unhandled, []);
    assert.equal(button().disabled, false);
    assert.match(host.textContent ?? "", /Couldn't open sharing\. Try again\./);
    assert.equal(warned[0]?.[0], "[collection-share]");

    let shared = 0;
    collectionShare.load = async () => {
      loads++;
      return { shareCollectionValue: async () => void shared++ } as never;
    };
    act(() => button().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    assert.equal(loads, 2);
    assert.equal(shared, 1);
    assert.equal(host.textContent?.includes("Couldn't open sharing"), false);
    assert.equal(button().disabled, false);
  });
});
