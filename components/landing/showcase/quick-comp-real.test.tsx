import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("draws the real card, its sold prices and the range, with no count line", async () => {
    state.reducedMotion = true;
    const { default: QuickCompDemo } = await import("@/components/landing/showcase/quick-comp-demo");
    const host = await mount(createElement(QuickCompDemo, { comp: REAL }));
    const text = host.textContent ?? "";
    assert.match(text, /Search: Fixture Maxey 2021 Donruss Optic Downtown PSA 10/);
    assert.match(text, /Fixture Maxey · 2021 Donruss Optic Downtown · PSA 10/);
    assert.match(text, /\$300/);
    assert.doesNotMatch(text, /Based on|9 sales/, "no counts on the landing page");
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

  it("tells the section when the real photo fails", async () => {
    state.reducedMotion = true;
    const { default: QuickCompDemo } = await import("@/components/landing/showcase/quick-comp-demo");
    let failed = 0;
    const host = await mount(createElement(QuickCompDemo, { comp: REAL, onPhotoError: () => (failed += 1) }));
    await act(async () => {
      host.querySelector("img")!.dispatchEvent(new win.Event("error"));
    });
    assert.equal(failed, 1);
  });

  it("has no sample to fall back to: the panel needs a real card", () => {
    const source = readFileSync(join(process.cwd(), "components/landing/showcase/quick-comp-demo.tsx"), "utf8");
    assert.doesNotMatch(source, /SAMPLE|Sample Rookie|sample-card\.svg|sample sales/);
    assert.match(source, /comp: CompDemo;/, "not optional");
    assert.doesNotMatch(source, /\brun\b/, "no Replay");
  });
});

describe("Quick Comp section", () => {
  async function section(comp: CompDemo | null) {
    const { QuickCompSection } = await import("@/components/landing/quick-comp-section");
    const { LandingCompProvider } = await import("@/components/landing/landing-links");
    return renderToStaticMarkup(createElement(LandingCompProvider, { comp }, createElement(QuickCompSection)));
  }

  it("draws for a real card, with one heading, one line and no Sample or Replay pill", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    try {
      const html = await section(REAL);
      assert.match(html, /data-section="quick-comp"/);
      assert.match(html, /<h2 class="lg-h2">Quick Comp<\/h2><p class="lg-lead">Recent sold prices, the median and the range\.<\/p>/);
      assert.doesNotMatch(html, />Sample<|Replay|<button/);
      assert.doesNotMatch(html, /From @|donnietaz/);
    } finally {
      delete process.env.NEXT_PUBLIC_QUICK_COMP;
    }
  });

  it("draws nothing without a real card: never a sample in its place", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    try {
      assert.equal(await section(null), "");
      assert.equal(await section({ ...REAL, real: false }), "");
    } finally {
      delete process.env.NEXT_PUBLIC_QUICK_COMP;
    }
  });
});
