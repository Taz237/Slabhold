import { after } from "node:test";
import { JSDOM } from "jsdom";

/**
 * A jsdom window on globalThis for component tests, put back after the file.
 * `reducedMotion` answers `(prefers-reduced-motion: reduce)` in matchMedia.
 */
export function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const state = { reducedMotion: false, scrollY: 0, scrolls: [] as number[] };
  const names = [
    "window",
    "self",
    "document",
    "navigator",
    "HTMLElement",
    "Node",
    "Element",
    "SVGElement",
    "MouseEvent",
    "KeyboardEvent",
    "FocusEvent",
    "Event",
    "localStorage",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "matchMedia",
    "IntersectionObserver",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const previous = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

  function expose(name: string, value: unknown) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const matchMedia = (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? state.reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(win, "matchMedia", { configurable: true, value: matchMedia });
  Object.defineProperty(win, "IntersectionObserver", { configurable: true, value: NoopObserver });
  Object.defineProperty(win, "scrollY", { configurable: true, get: () => state.scrollY });
  Object.defineProperty(win, "scrollTo", {
    configurable: true,
    value: (arg: number | ScrollToOptions, y?: number) => {
      const top = typeof arg === "number" ? (y ?? 0) : (arg.top ?? 0);
      state.scrollY = top;
      state.scrolls.push(top);
    },
  });

  expose("window", win);
  expose("self", win);
  expose("document", win.document);
  expose("navigator", win.navigator);
  expose("HTMLElement", win.HTMLElement);
  expose("Node", win.Node);
  expose("Element", win.Element);
  expose("SVGElement", win.SVGElement);
  expose("MouseEvent", win.MouseEvent);
  expose("KeyboardEvent", win.KeyboardEvent);
  expose("FocusEvent", win.FocusEvent);
  expose("Event", win.Event);
  expose("localStorage", win.localStorage);
  expose("getComputedStyle", win.getComputedStyle.bind(win));
  expose("requestAnimationFrame", win.requestAnimationFrame.bind(win));
  expose("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
  expose("matchMedia", matchMedia);
  expose("IntersectionObserver", NoopObserver);
  expose("IS_REACT_ACT_ENVIRONMENT", true);

  after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    win.close();
  });

  return { win, state };
}
