import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentProps, type ComponentType, type ReactNode } from "react";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/cards/new" });
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
expose("IS_REACT_ACT_ENVIRONMENT", true);

const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };

type DoorProps = ComponentProps<typeof import("@/components/add-card/search-door").SearchDoor>;
let SearchDoor: ComponentType<DoorProps>;

before(async () => {
  ({ SearchDoor } = await import("@/components/add-card/search-door"));
});

after(() => win.close());

function doorProps(scanHref: string | null): DoorProps {
  const noop = () => {};
  return {
    initialQuery: "",
    recent: [],
    owned: [],
    insert: null,
    setBrand: "",
    onQuery: noop,
    onPickPlayer: noop,
    onPickInsert: noop,
    onPickSet: noop,
    onPickCatalog: noop,
    onStepByStep: noop,
    scanHref,
  };
}

async function mount(props: DoorProps) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppRouterContext.Provider, { value: router }, createElement(SearchDoor, props)));
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("Add card: Scan a card", () => {
  it("is the first thing on the door, a 44px-plus link to the scanner", async () => {
    const view = await mount(doorProps("/scan"));
    try {
      const first = view.host.querySelector("a, button, input");
      assert.equal(first?.getAttribute("href"), "/scan");
      assert.ok(first?.textContent?.includes("Scan a card"));
      assert.match(first?.className ?? "", /min-h-16/);
    } finally {
      view.unmount();
    }
  });

  it("is not there with the scanner off", async () => {
    const view = await mount(doorProps(null));
    try {
      assert.equal(view.host.querySelector("[data-scan-entry]"), null);
    } finally {
      view.unmount();
    }
  });

  it("steps aside once the collector starts typing", async () => {
    const view = await mount({ ...doorProps("/scan"), initialQuery: "wemb" });
    try {
      assert.equal(view.host.querySelector("[data-scan-entry]"), null);
    } finally {
      view.unmount();
    }
  });
});

describe("Quick Comp: Scan a card", () => {
  it("links to the scanner in comp mode when the scanner is on", () => {
    const source = readFileSync(join(process.cwd(), "components/quick-comp/quick-comp-view.tsx"), "utf8");
    assert.match(source, /const scanHref = quickCompScanHref\(scannerEnabled\(\)\);/);
    assert.match(source, /<ScanEntry href=\{scanHref\}/);
  });

  it("keeps the readers out of the Add card and Quick Comp bundles", () => {
    for (const path of ["components/quick-comp/quick-comp-view.tsx", "components/add-card/search-door.tsx", "components/add-card/add-card-flow.tsx"]) {
      const valueImports = readFileSync(join(process.cwd(), path), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("import ") && !line.startsWith("import type "));
      assert.equal(
        valueImports.some((line) => /@\/lib\/scan\/(session|raw-text|slab-label|match)"/.test(line)),
        false,
        path,
      );
    }
  });
});
