import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType } from "react";
import type { PeopleCountsLoad } from "./scan-people-line";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/cards/card-1" });
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("sessionStorage", win.sessionStorage);
expose("IS_REACT_ACT_ENVIRONMENT", true);

let ScanPeopleLine: ComponentType<{ cardId: string; load?: PeopleCountsLoad }>;

before(async () => {
  ({ ScanPeopleLine } = await import("./scan-people-line"));
});

after(() => win.close());

async function mount(cardId: string, load: PeopleCountsLoad) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ScanPeopleLine, { cardId, load }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("ScanPeopleLine", () => {
  it("shows the two counts after a scan save", async () => {
    win.sessionStorage.setItem("cardflip.scan-added", "card-1");
    const view = await mount("card-1", async () => ({ owners: 4, hunters: 2 }));
    try {
      assert.equal(view.host.textContent, "4 collectors own this · 2 are hunting it");
    } finally {
      view.unmount();
    }
  });

  it("shows nothing for a card that wasn't scanned, and never loads", async () => {
    win.sessionStorage.setItem("cardflip.scan-added", "other-card");
    let loads = 0;
    const view = await mount("card-1", async () => (loads++, { owners: 4, hunters: 2 }));
    try {
      assert.equal(view.host.textContent, "");
      assert.equal(loads, 0);
    } finally {
      view.unmount();
    }
  });

  it("shows nothing when nobody else has it or the load fails", async () => {
    win.sessionStorage.setItem("cardflip.scan-added", "card-1");
    let view = await mount("card-1", async () => ({ owners: 0, hunters: 0 }));
    try {
      assert.equal(view.host.textContent, "");
    } finally {
      view.unmount();
    }
    view = await mount("card-1", async () => {
      throw new Error("down");
    });
    try {
      assert.equal(view.host.textContent, "");
    } finally {
      view.unmount();
    }
  });
});

describe("where owners and hunters show", () => {
  it("is the card-added screen only, never the card page", () => {
    const panel = readFileSync(join(process.cwd(), "components/card-added-panel.tsx"), "utf8");
    assert.match(panel, /<ScanPeopleLine cardId=\{cardId\} \/>/);
    const detail = readFileSync(join(process.cwd(), "components/card-detail.tsx"), "utf8");
    assert.equal(/ScanPeopleLine|CardPeopleSections|api\/cards\/people/.test(detail), false);
  });
});
