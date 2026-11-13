import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import type { ScanMatch, ScanMatchResult } from "@/lib/scan/match";
import type { ScanCapture, ScanPurpose } from "@/lib/scan/session";
import type { ScanHubDeps } from "./scan-hub";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/scan" });
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLInputElement", win.HTMLInputElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("sessionStorage", win.sessionStorage);
expose("IS_REACT_ACT_ENVIRONMENT", true);

const pushed: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  prefetch() {},
};

let ScanHub: ComponentType<{ purpose: ScanPurpose; start?: "camera" | "library"; deps?: Partial<ScanHubDeps> }>;
let fixtures: typeof import("@/lib/scan/preview-fixtures");

before(async () => {
  ({ ScanHub } = await import("./scan-hub"));
  fixtures = await import("@/lib/scan/preview-fixtures");
});

after(() => win.close());

/** A made-up capture: what the native scanner would send for a slab. */
const CAPTURE: ScanCapture = {
  lines: ["PSA", "2018 PANINI PRIZM #280", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "00000000"],
  backLines: null,
  image: null,
  kind: "slab",
};

function result(matches: ScanMatch[]): ScanMatchResult {
  return { matches, settled: true };
}

async function mount(purpose: ScanPurpose, deps: Partial<ScanHubDeps>) {
  pushed.length = 0;
  win.sessionStorage.clear();
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppRouterContext.Provider, { value: router }, createElement(ScanHub, { purpose, deps })));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function text(): string {
  return win.document.body.textContent ?? "";
}

function button(name: string): HTMLElement {
  const found = [...win.document.querySelectorAll("button, a")].find(
    (node) => node.getAttribute("aria-label") === name || node.textContent?.trim() === name,
  );
  assert.ok(found, `control ${name}`);
  return found as HTMLElement;
}

async function waitFor(check: () => boolean, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  throw new Error(text().slice(0, 600));
}

function nativeDeps(overrides: Partial<ScanHubDeps> = {}): Partial<ScanHubDeps> {
  return {
    scannerAvailable: async () => true,
    scan: async () => CAPTURE,
    pickAndRead: async () => CAPTURE,
    identify: async () => result([fixtures.PREVIEW_SLAB]),
    compLookup: fixtures.previewCompLookup,
    solds: fixtures.previewSolds,
    online: () => true,
    ...overrides,
  };
}

describe("ScanHub with the native scanner", () => {
  it("opens the camera on arrival, then one tap adds the card", async () => {
    let scans = 0;
    const view = await mount("add", nativeDeps({ scan: async () => (scans++, CAPTURE) }));
    try {
      await waitFor(() => text().includes("Is this your card?"));
      assert.equal(scans, 1, "no tap needed to open the camera");
      await act(async () => button("Yes, add it").click());
      assert.match(pushed[0] ?? "", /^\/cards\/new\?scan=[a-z0-9]+$/);
      const stored = JSON.parse(win.sessionStorage.getItem("cardflip.scan-match") ?? "{}");
      assert.equal(stored.autoSave, true);
      assert.equal(stored.grade.certNumber, "00000000");
      assert.equal(pushed[0]?.includes("00000000"), false, "the cert never goes in the URL");
    } finally {
      view.unmount();
    }
  });

  it("goes from snap to sold prices with no tap in comp mode", async () => {
    const view = await mount("comp", nativeDeps());
    try {
      await waitFor(() => text().includes("Based on 6 sales"));
      assert.ok(text().includes("Recent sold prices"));
    } finally {
      view.unmount();
    }
  });

  it("lands on the hub with a Scan a card button after a cancel", async () => {
    let scans = 0;
    const view = await mount("add", nativeDeps({ scan: async () => (scans++, null) }));
    try {
      await waitFor(() => scans === 1);
      assert.equal(win.document.querySelector('[role="dialog"]'), null);
      assert.ok(text().includes("Scan as many cards as you want."));
      await act(async () => button("Scan a card").click());
      await waitFor(() => scans === 2);
    } finally {
      view.unmount();
    }
  });

  it("says when it could not read the card", async () => {
    const view = await mount("add", nativeDeps({ scan: async () => Promise.reject(new Error("camera")) }));
    try {
      await waitFor(() => text().includes("We couldn't read that one"));
    } finally {
      view.unmount();
    }
  });

  it("says offline when the search fails offline", async () => {
    const view = await mount("add", nativeDeps({ identify: async () => null, online: () => false }));
    try {
      await waitFor(() => text().includes("You're offline"));
    } finally {
      view.unmount();
    }
  });

  it("reads a library photo the same way", async () => {
    let reads = 0;
    const view = await mount("add", nativeDeps({ scan: async () => null, pickAndRead: async () => (reads++, CAPTURE) }));
    try {
      await waitFor(() => text().includes("Choose a photo"));
      await act(async () => button("Choose a photo").click());
      await waitFor(() => text().includes("Is this your card?"));
      assert.equal(reads, 1);
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub: identify, then last eBay solds", () => {
  it("shows the card first, then fills in its last solds", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = await mount(
      "add",
      nativeDeps({
        solds: async (capture, matches) => {
          await gate;
          return fixtures.previewSolds(capture, matches);
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Looking up last solds…"));
      assert.ok(text().includes("Luka Doncic"), "the identity shows while the search runs");
      release();
      await waitFor(() => text().includes("Last sold"));
    } finally {
      view.unmount();
    }
  });

  it("a card the catalog didn't find can still be found by the sold titles", async () => {
    const view = await mount(
      "comp",
      nativeDeps({
        identify: async () => result([]),
        solds: async () => ({ matches: [fixtures.PREVIEW_SLAB], comp: { status: "none", searched: true }, query: "q" }),
      }),
    );
    try {
      await waitFor(() => text().includes("No recent eBay sales found for this card"));
      assert.ok(text().includes("Luka Doncic"));
    } finally {
      view.unmount();
    }
  });

  it("with nothing found either way, says so", async () => {
    const view = await mount(
      "add",
      nativeDeps({ identify: async () => result([]), solds: async () => ({ matches: [], comp: { status: "none" }, query: null }) }),
    );
    try {
      await waitFor(() => text().includes("We couldn't find this one yet"));
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub without the native scanner", () => {
  it("says reading is coming and keeps the photo and search ways in", async () => {
    let scans = 0;
    const view = await mount("add", { scannerAvailable: async () => false, scan: async () => (scans++, CAPTURE) });
    try {
      await waitFor(() => text().includes("Card reading is coming to the iPhone app"));
      assert.equal(scans, 0);
      assert.equal(button("Type it instead").getAttribute("href"), "/cards/new");
      assert.ok(button("Choose a photo"));
    } finally {
      view.unmount();
    }
  });

  it("sends comp to the search by name", async () => {
    const view = await mount("comp", { scannerAvailable: async () => false });
    try {
      await waitFor(() => text().includes("Find it by name"));
      assert.equal(button("Find it by name").getAttribute("href"), "/comp");
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub from the Add card sheet's Upload photo", () => {
  it("opens the library on arrival instead of the camera, into the same reveal", async () => {
    let scans = 0;
    let reads = 0;
    pushed.length = 0;
    win.sessionStorage.clear();
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    const deps = nativeDeps({ scan: async () => (scans++, CAPTURE), pickAndRead: async () => (reads++, CAPTURE) });
    await act(async () => {
      root.render(
        createElement(AppRouterContext.Provider, { value: router }, createElement(ScanHub, { purpose: "add", start: "library", deps })),
      );
    });
    try {
      await waitFor(() => text().includes("Is this your card?"));
      assert.equal(reads, 1);
      assert.equal(scans, 0, "the camera stays closed");
      assert.ok(win.document.querySelector('[data-reveal="scan-card"]'), "the same flip-in reveal");
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
