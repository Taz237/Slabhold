import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

type Call = { node: Element; keyframes: Keyframe[] };

function spyAnimate() {
  const calls: Call[] = [];
  const proto = win.Element.prototype as unknown as { animate?: unknown };
  const had = Object.getOwnPropertyDescriptor(proto, "animate");
  proto.animate = function (this: Element, keyframes: Keyframe[]) {
    calls.push({ node: this, keyframes });
    return { cancel() {}, pause() {}, play() {}, finished: Promise.resolve(), playState: "finished" };
  };
  return {
    calls,
    restore() {
      if (had) Object.defineProperty(proto, "animate", had);
      else delete proto.animate;
    },
  };
}

let cleanup = () => {};

async function mount(motion: boolean) {
  const { CollectionVisual } = await import("@/components/onboarding/intro/screens");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(CollectionVisual, { motion })));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup();
  cleanup = () => {};
  state.reducedMotion = false;
});

describe("intro collection slab", () => {
  it("draws one straight brand slab: YOUR COLLECTION, a star, no grader, grade or photo", async () => {
    const host = await mount(false);
    const slabs = host.querySelectorAll("[data-slab]");
    assert.equal(slabs.length, 1, "one slab");
    const slab = slabs[0] as HTMLElement;
    assert.equal(slab.getAttribute("aria-hidden"), "true");
    assert.equal(slab.textContent?.trim(), "YOUR COLLECTION");
    assert.doesNotMatch(host.textContent ?? "", /PSA|SGC|BGS|CGC/);
    assert.equal(slab.querySelectorAll("img").length, 0, "no photo");
    assert.equal(slab.querySelectorAll("svg").length, 1, "the star");
    assert.doesNotMatch(slab.getAttribute("style") ?? "", /rotate/, "sits straight");
    // Same 88px box, the case centred in it.
    assert.match(slab.parentElement?.className ?? "", /h-\[88px\] w-\[88px\]/);
    assert.match(slab.className, /h-\[84px\] w-\[60px\]/);
    assert.match(slab.className, /left-\[14px\]/);
    // The value, its change and the chart stay.
    assert.match(host.textContent ?? "", /Collection value/);
    assert.match(host.textContent ?? "", /\+\$38/);
  });

  it("rises in once without rotating, then loops the glow and the sweep in CSS", async () => {
    const spy = spyAnimate();
    try {
      const host = await mount(true);
      const slab = host.querySelector("[data-slab]");
      const rise = spy.calls.filter((call) => call.node === slab);
      assert.equal(rise.length, 1, "rises in once");
      const frames = JSON.stringify(rise[0].keyframes);
      assert.match(frames, /translateY/);
      assert.doesNotMatch(frames, /rotate/);
      assert.ok(host.querySelector(".collection-slab-glow"), "glow layer");
      assert.ok(host.querySelector(".collection-slab-sweep"), "light sweep");
    } finally {
      spy.restore();
    }
  });

  it("draws the final frame with reduced motion: no animations, no loops", async () => {
    state.reducedMotion = true;
    const spy = spyAnimate();
    try {
      const host = await mount(false);
      assert.equal(spy.calls.length, 0);
      assert.equal(host.querySelector(".collection-slab-sweep"), null);
      assert.equal(host.querySelector(".collection-slab-glow-pulse"), null);
      assert.ok(host.querySelector(".collection-slab-glow"), "the glow stays, still");
      assert.match(host.textContent ?? "", /\$412/);
    } finally {
      spy.restore();
    }
  });

  it("keeps the loops in globals.css: transform and opacity only, off with reduced motion", () => {
    const css = read("app/globals.css");
    for (const name of ["collection-slab-glow", "collection-slab-sweep"]) {
      const block = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`));
      assert.ok(block, name);
      const props = [...block[1].matchAll(/([a-z-]+):/g)].map((match) => match[1]);
      assert.ok(props.length > 0, name);
      for (const prop of props) assert.match(prop, /^(transform|opacity)$/, `${name}: ${prop}`);
    }
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.collection-slab-glow-pulse,\s*\.collection-slab-sweep \{\s*animation: none;/,
    );
    const slab = read("components/onboarding/intro/screens.tsx").split("function CollectionSlab")[1].split("\nexport ")[0];
    // Tailwind only sees a class with a space after it: "blur-[14px]${...}" never gets built.
    assert.doesNotMatch(slab, /\]\$\{/);
    assert.doesNotMatch(slab, /PSA|SGC|<img|teal/i);
    const visual = read("components/onboarding/intro/screens.tsx").split("export function CollectionVisual")[1].split("\nexport ")[0];
    assert.doesNotMatch(visual, /CardSlabArt|SAMPLE_SLABS|PSA|SGC|<img/);
    assert.doesNotMatch(visual, /#14B8A6|teal/i);
    // The chart and the count-up stay.
    assert.match(visual, /<ValueChart points=\{points\}/);
    assert.match(visual, /countUp\(value\.current/);
  });
});
