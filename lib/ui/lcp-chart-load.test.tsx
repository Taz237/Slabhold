import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { LandingShot } from "@/components/landing-page";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const win = dom.window;
const previous = {
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
  HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
  HTMLImageElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLImageElement"),
  Node: Object.getOwnPropertyDescriptor(globalThis, "Node"),
  Element: Object.getOwnPropertyDescriptor(globalThis, "Element"),
  Image: Object.getOwnPropertyDescriptor(globalThis, "Image"),
  IS_REACT_ACT_ENVIRONMENT: Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT"),
  getComputedStyle: Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle"),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"),
};

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLImageElement", win.HTMLImageElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("getComputedStyle", win.getComputedStyle.bind(win));
expose("requestAnimationFrame", (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(0), 0);
});
expose("IS_REACT_ACT_ENVIRONMENT", true);

let imageConstructs = 0;
class ProbeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    imageConstructs += 1;
  }
  constructor() {
    imageConstructs += 1;
  }
}
expose("Image", ProbeImage);
Object.defineProperty(win, "Image", { configurable: true, writable: true, value: ProbeImage });

after(async () => {
  await act(async () => {
    root.unmount();
  });
  for (const [name, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  win.close();
});

function shotImage(alt: string) {
  const node = win.document.querySelector(`img[alt="${alt}"]`);
  assert.ok(node instanceof win.HTMLImageElement, `missing optimized shot: ${alt}`);
  return node;
}

const host = win.document.getElementById("root");
assert.ok(host);
const root = createRoot(host);

function optimizedSrc(src: string | null, file: string) {
  assert.match(src ?? "", new RegExp(`/_next/image\\?url=%2Flanding%2F${file}\\.png`));
  assert.equal((src ?? "").includes(`/landing/${file}.png`), false);
}

describe("landing screenshots", () => {
  it("renders the optimized shot without constructing window.Image", async () => {
    const landing = read("components/landing-page.tsx");
    assert.doesNotMatch(landing, /new window\.Image|new Image\(/);
    assert.match(landing, /priority=\{index === 0\}/);
    assert.match(landing, /fetchPriority=\{priority \? "high" : "auto"\}/);
    assert.match(landing, /loading=\{priority \? "eager" : "lazy"\}/);
    assert.match(landing, /onError=\{\(\) => setMissingSrc\(src\)\}/);

    imageConstructs = 0;
    await act(async () => {
      root.render(
        createElement(LandingShot, {
          src: "/landing/1.png",
          label: "The timeline",
          width: 860,
          height: 1860,
          priority: true,
        }),
      );
    });

    const img = shotImage("The timeline screenshot");
    optimizedSrc(img.getAttribute("src"), "1");
    assert.match(img.getAttribute("srcset") ?? "", /w=640/);
    assert.equal(img.getAttribute("loading"), "eager");
    assert.equal(img.getAttribute("fetchpriority"), "high");
    assert.equal(imageConstructs, 0);
    assert.match(host.innerHTML, /aspect-ratio:\s*860\s*\/\s*1860/);

    await act(async () => {
      img.dispatchEvent(new win.Event("error", { bubbles: false }));
    });
    assert.equal(win.document.querySelector('img[alt="The timeline screenshot"]'), null);
    assert.match(host.textContent ?? "", /The timeline/);
    assert.match(host.innerHTML, /from-\[#2e1065\]/);
    assert.equal(imageConstructs, 0);
  });

  it("keeps later shots lazy", async () => {
    imageConstructs = 0;
    await act(async () => {
      root.render(
        createElement(LandingShot, {
          src: "/landing/2.png",
          label: "Your slabs",
          width: 860,
          height: 1734,
        }),
      );
    });
    const img = shotImage("Your slabs screenshot");
    optimizedSrc(img.getAttribute("src"), "2");
    assert.equal(img.getAttribute("loading"), "lazy");
    assert.notEqual(img.getAttribute("fetchpriority"), "high");
    assert.equal(imageConstructs, 0);
  });
});

describe("public card chart", () => {
  it("loads ValueChart with the card-detail dynamic import and a same-size placeholder", () => {
    const view = read("components/public-card-view.tsx");
    const detail = read("components/card-detail.tsx");
    const chart = read("components/value-chart.tsx");
    assert.match(view, /import\("@\/components\/value-chart"\)/);
    assert.doesNotMatch(view, /from "@\/components\/value-chart"/);
    assert.match(detail, /import\("@\/components\/value-chart"\)/);
    assert.match(view, /<ValueChart/);
    assert.match(view, /setValueChart\(\(\) => mod\.ValueChart\)/);
    assert.match(chart, /mt-3 h-44 animate-pulse rounded-xl bg-zinc-100 dark:bg-white\/5/);
    assert.match(view, /mt-3 h-44 rounded-xl bg-zinc-100 dark:bg-white\/5/);
    assert.match(view, /Loading sold prices…/);
    assert.match(view, /Sold comps/);
  });
});
