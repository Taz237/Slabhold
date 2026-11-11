import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompDemo } from "@/components/landing/showcase/sample-data";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  state.reducedMotion = false;
});

const REAL: CompDemo = {
  query: "Fixture Maxey 2021 Donruss Optic Downtown PSA 10",
  label: "Fixture Maxey · 2021 Donruss Optic Downtown · PSA 10",
  photo: { src: "/_next/image?url=maxey&w=128&q=75", srcSet: "/_next/image?url=maxey&w=128&q=75 1x" },
  alt: "Fixture Maxey, 2021 Donruss Optic Downtown, PSA 10",
  sales: [
    { price: 310, when: "2d ago" },
    { price: 299.5, when: "4d ago" },
    { price: 285, when: "today" },
  ],
  stats: { median: 300, p25: 290, p75: 308, min: 285, max: 310, count: 9 },
  basis: "Based on 9 sales",
  real: true,
};

async function mount(element: ReactElement) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

describe("Quick Comp demo with a real card", () => {
  it("draws the real card, its sold prices, the range and the sale count", async () => {
    state.reducedMotion = true;
    const { default: QuickCompDemo } = await import("@/components/landing/showcase/quick-comp-demo");
    const host = await mount(createElement(QuickCompDemo, { run: 0, comp: REAL }));
    const text = host.textContent ?? "";
    assert.match(text, /Search: Fixture Maxey 2021 Donruss Optic Downtown PSA 10/);
    assert.match(text, /Fixture Maxey · 2021 Donruss Optic Downtown · PSA 10/);
    assert.match(text, /\$300/);
    assert.match(text, /Based on 9 sales/);
    assert.match(text, /Low \$290/);
    assert.match(text, /High \$308/);
    assert.match(text, /Sold data via Trawl \(third-party, not affiliated with eBay\)/);
    assert.doesNotMatch(text, /sample/i);
    const chips = [...host.querySelectorAll('[aria-label="Recent sold prices"] li')];
    assert.deepEqual(
      chips.map((chip) => chip.getAttribute("aria-label")),
      ["$310, sold 2d ago", "$300, sold 4d ago", "$285, sold today"],
    );
    const img = host.querySelector("img")!;
    assert.equal(img.getAttribute("src"), REAL.photo.src);
    assert.equal(img.getAttribute("alt"), REAL.alt);
    assert.equal(img.getAttribute("loading"), "lazy");
    assert.equal(img.getAttribute("width"), "104");
  });

  it("tells the chapter when the real photo fails", async () => {
    state.reducedMotion = true;
    const { default: QuickCompDemo } = await import("@/components/landing/showcase/quick-comp-demo");
    let failed = 0;
    const host = await mount(createElement(QuickCompDemo, { run: 0, comp: REAL, onPhotoError: () => (failed += 1) }));
    await act(async () => {
      host.querySelector("img")!.dispatchEvent(new win.Event("error"));
    });
    assert.equal(failed, 1);
  });

  it("keeps the sample exactly as before without a real card", async () => {
    state.reducedMotion = true;
    const { default: QuickCompDemo } = await import("@/components/landing/showcase/quick-comp-demo");
    const host = await mount(createElement(QuickCompDemo, { run: 0 }));
    const text = host.textContent ?? "";
    assert.match(text, /2023 Sample Rookie Prizm · Grade 10/);
    assert.match(text, /Based on 5 sample sales/);
    assert.equal(host.querySelector("img")?.getAttribute("src"), "/quick-comp/sample-card.svg");
    assert.equal(host.querySelectorAll('[aria-label="Recent sold prices"] li')[0].getAttribute("aria-label"), "$418, sold 2d ago");
  });
});

describe("Quick Comp chapter tag", () => {
  it("tags a real card neutrally, in the hero caption's style, never naming the collector", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    try {
      const { FeaturePanels } = await import("@/components/landing/feature-panels");
      const html = renderToStaticMarkup(createElement(FeaturePanels, { comp: REAL }));
      const quickComp = html.slice(html.indexOf('data-chapter="quick-comp"'), html.indexOf('data-chapter="timeline"'));
      assert.match(quickComp, /class="truncate font-mono text-\[10px\] leading-4 text-zinc-400">From a Slabhold collection</);
      assert.doesNotMatch(quickComp, /From @|donnietaz/);
      assert.doesNotMatch(quickComp, />Sample</);
      const timeline = html.slice(html.indexOf('data-chapter="timeline"'));
      assert.match(timeline, />Sample</, "the other chapters keep their Sample tag");

      const sample = renderToStaticMarkup(createElement(FeaturePanels));
      const sampleQuickComp = sample.slice(sample.indexOf('data-chapter="quick-comp"'), sample.indexOf('data-chapter="timeline"'));
      assert.match(sampleQuickComp, />Sample</);
      assert.doesNotMatch(sampleQuickComp, /collection/);
    } finally {
      delete process.env.NEXT_PUBLIC_QUICK_COMP;
    }
  });

  it("swaps back to the sample when the real photo fails", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    state.reducedMotion = true;
    const realObserver = globalThis.IntersectionObserver;
    class NearObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback([{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: NearObserver });
    try {
      const { FeaturePanels } = await import("@/components/landing/feature-panels");
      const host = await mount(createElement(FeaturePanels, { comp: REAL }));
      for (let tries = 0; tries < 20 && !host.querySelector('[data-showcase-demo="quick-comp"]'); tries += 1) {
        await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
      }
      const chapter = () => host.querySelector('[data-chapter="quick-comp"]')!;
      assert.match(chapter().textContent ?? "", /From a Slabhold collection/);
      await act(async () => {
        chapter().querySelector("img")!.dispatchEvent(new win.Event("error"));
      });
      assert.match(chapter().textContent ?? "", /2023 Sample Rookie Prizm/);
      assert.match(chapter().textContent ?? "", /Sample/);
      assert.doesNotMatch(chapter().textContent ?? "", /From a Slabhold collection/);
    } finally {
      delete process.env.NEXT_PUBLIC_QUICK_COMP;
      Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: realObserver });
    }
  });
});
