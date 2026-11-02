import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, createElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { NEAR_IDLE_TIMEOUT_MS, NEAR_MARGIN_PX, WhenNear, watchNear } from "./when-near";

installDom();

type Observed = { callback: IntersectionObserverCallback; options?: IntersectionObserverInit; nodes: Element[]; off: boolean };

let observers: Observed[];
let idles: { run: () => void; timeout?: number }[];
const realIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
const realIdle = (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;

function installObserver() {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    entry: Observed;
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.entry = { callback, options, nodes: [], off: false };
      observers.push(this.entry);
    }
    observe(node: Element) {
      this.entry.nodes.push(node);
    }
    disconnect() {
      this.entry.off = true;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
  };
}

function scrollNear(near: boolean) {
  for (const entry of observers) {
    if (entry.off) continue;
    entry.callback(
      entry.nodes.map((target) => ({ target, isIntersecting: near }) as IntersectionObserverEntry),
      {} as IntersectionObserver,
    );
  }
}

const Part = () => createElement("p", null, "the part");
const Wait = createElement("i", null, "skeleton");

let host: HTMLElement;
let root: Root | null;

beforeEach(() => {
  observers = [];
  idles = [];
  installObserver();
  delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
  host = document.createElement("div");
  document.body.append(host);
  root = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host.remove();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = realIO;
  (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = realIdle;
  mock.timers.reset();
});

describe("WhenNear", () => {
  it("draws the same fallback on the server and the first client render, with no mismatch", () => {
    const element = createElement(WhenNear, { fallback: Wait, className: "mt-2" }, createElement(Part));
    const html = renderToString(element);
    assert.equal(html, '<div class="mt-2"><i>skeleton</i></div>');
    host.innerHTML = html;
    const errors: unknown[] = [];
    act(() => {
      root = hydrateRoot(host, element, { onRecoverableError: (error) => errors.push(error) });
    });
    assert.deepEqual(errors, []);
    assert.equal(host.innerHTML, html);
  });

  it("mounts the part once it scrolls near the viewport, and stops watching", () => {
    root = createRoot(host);
    act(() => root!.render(createElement(WhenNear, { fallback: Wait }, createElement(Part))));
    assert.equal(host.innerHTML, "<div><i>skeleton</i></div>");
    assert.equal(observers.length, 1);
    assert.equal(observers[0].options?.rootMargin, `${NEAR_MARGIN_PX}px 0px ${NEAR_MARGIN_PX}px 0px`);
    act(() => scrollNear(false));
    assert.equal(host.innerHTML, "<div><i>skeleton</i></div>");
    act(() => scrollNear(true));
    assert.equal(host.innerHTML, "<div><p>the part</p></div>");
    assert.equal(observers[0].off, true);
  });

  it("without IntersectionObserver, mounts when the browser is idle (with a timeout)", () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = (
      run: () => void,
      options?: { timeout?: number },
    ) => {
      idles.push({ run, timeout: options?.timeout });
      return idles.length;
    };
    (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback = () => {};
    root = createRoot(host);
    act(() => root!.render(createElement(WhenNear, { fallback: Wait }, createElement(Part))));
    assert.equal(host.innerHTML, "<div><i>skeleton</i></div>");
    assert.equal(idles.length, 1);
    assert.equal(idles[0].timeout, NEAR_IDLE_TIMEOUT_MS);
    act(() => idles[0].run());
    assert.equal(host.innerHTML, "<div><p>the part</p></div>");
  });

  it("with neither, mounts on the next task", () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    mock.timers.enable({ apis: ["setTimeout"] });
    root = createRoot(host);
    act(() => root!.render(createElement(WhenNear, null, createElement(Part))));
    assert.equal(host.innerHTML, "<div></div>");
    act(() => mock.timers.tick(1));
    assert.equal(host.innerHTML, "<div><p>the part</p></div>");
  });
});

describe("watchNear", () => {
  it("cleans up: no mount after unmount", () => {
    const node = document.createElement("div");
    let fired = 0;
    const stop = watchNear(node, () => fired++);
    stop();
    scrollNear(true);
    assert.equal(fired, 0);
    assert.equal(observers[0].off, true);
  });
});
