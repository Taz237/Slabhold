import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  state.reducedMotion = false;
});

async function landingHtml() {
  const { LandingPage } = await import("@/components/landing-page");
  return renderToStaticMarkup(
    createElement(SearchParamsContext.Provider, { value: new URLSearchParams("next=/leaderboard") }, createElement(LandingPage)),
  );
}

async function mountPanels() {
  const { FeaturePanels } = await import("@/components/landing/feature-panels");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(FeaturePanels));
  });
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

describe("landing page", () => {
  it("leads with the headline, Create account and Log in, carrying next", async () => {
    const html = await landingHtml();
    assert.match(text(html), /Your cards\. Your comps\. Your people\./);
    assert.match(html, /href="\/signup\?next=%2Fleaderboard"[^>]*>Create account</);
    assert.match(html, /href="\/login\?next=%2Fleaderboard"/);
    assert.match(text(html), /Join free/);
    assert.equal((html.match(/>Create account</g) ?? []).length, 2, "hero and final call to action");
    assert.match(html, /data-hero-slabs/);
  });

  it("makes no made-up claims and doesn't sell", async () => {
    const all = [await landingHtml(), read("components/landing/feature-panels.tsx")].join("\n");
    assert.doesNotMatch(all, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i);
    assert.doesNotMatch(all, /join (thousands|\d)/i);
    assert.doesNotMatch(all, /marketplace|buy now|for sale|sell your/i);
    assert.doesNotMatch(all, /pok[eé]mon|tcg|mail day/i);
    assert.doesNotMatch(all, /eBay data|eBay logo/i);
  });

  it("loads the feature panels lazily, below the hero, with a skeleton", () => {
    const landing = read("components/landing-page.tsx");
    assert.match(landing, /dynamic\(\s*\(\) => import\("@\/components\/landing\/feature-panels"\)/);
    assert.match(landing, /loading: \(\) => <PanelsSkeleton \/>/);
    assert.doesNotMatch(landing, /next\/image|\.png/);
    for (const file of ["components/landing-page.tsx", "components/landing/feature-panels.tsx", "components/landing/hero-slabs.tsx"]) {
      assert.doesNotMatch(read(file), /from "(framer-motion|motion|gsap|lottie|swiper|embla)/);
    }
  });

  it("shows five sample-marked panels with dots", async () => {
    const host = await mountPanels();
    const slides = host.querySelectorAll('[aria-roledescription="slide"]');
    assert.equal(slides.length, 5);
    assert.deepEqual(
      [...slides].map((slide) => slide.querySelector("h2")?.textContent),
      ["Track your collection", "Real comps", "Weekly leaderboard", "Earn badges", "Post, share, DM"],
    );
    for (const slide of slides) assert.match(slide.textContent ?? "", /Sample/);
    assert.match(slides[1].textContent ?? "", /Matched to recent sold prices/);
    assert.match(slides[1].textContent ?? "", /via Trawl/);
    assert.equal(slides[2].querySelectorAll(".lb-banner-1, .lb-banner-2, .lb-banner-3").length, 3);
    assert.equal(slides[3].querySelectorAll("[data-badge]").length, 6);
    assert.equal(slides[3].querySelectorAll(".badge-legendary").length, 1, "only Legendary glows");
    const dots = host.querySelectorAll('[aria-label="Choose a panel"] button');
    assert.equal(dots.length, 5);
    assert.equal(dots[0].getAttribute("aria-current"), "true");
    for (const dot of dots) assert.ok(dot.getAttribute("aria-label")?.startsWith("Show "));
  });

  it("jumps without smooth scrolling for reduced motion", async () => {
    const host = await mountPanels();
    const scroller = host.querySelector<HTMLElement>(".snap-x");
    assert.ok(scroller);
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as typeof scroller.scrollTo;
    const dots = host.querySelectorAll<HTMLButtonElement>('[aria-label="Choose a panel"] button');

    await act(async () => dots[2].click());
    assert.equal(calls.at(-1)?.behavior, "smooth");
    assert.equal(dots[2].getAttribute("aria-current"), "true");

    state.reducedMotion = true;
    await act(async () => dots[3].click());
    assert.equal(calls.at(-1)?.behavior, "auto");
  });

  it("floats the hero slabs in CSS and stops them for reduced motion", () => {
    const css = read("app/globals.css");
    assert.match(css, /@keyframes landing-float/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.landing-float \{\s*animation: none;/);
  });
});

describe("panel index", () => {
  it("rounds to the nearest panel and stays in range", async () => {
    const { panelIndexAt } = await import("@/components/landing/feature-panels");
    assert.equal(panelIndexAt(0, 358, 5), 0);
    assert.equal(panelIndexAt(200, 358, 5), 1);
    assert.equal(panelIndexAt(5000, 358, 5), 4);
    assert.equal(panelIndexAt(100, 0, 5), 0);
  });
});
