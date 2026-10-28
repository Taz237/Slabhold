import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/cards/c1" });
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
expose("IS_REACT_ACT_ENVIRONMENT", true);

type Save = { saved: Promise<unknown> };

async function mount(kind: "card" | "tile", start: boolean, save: (next: boolean) => Save) {
  const { CardVisibilitySwitch, TileVisibilityButton } = await import("@/components/card-visibility");
  const { createRoot } = await import("react-dom/client");
  const calls: boolean[] = [];
  function Harness() {
    const [isPublic, setPublic] = useState(start);
    const onChange = (next: boolean) => {
      calls.push(next);
      setPublic(next);
      return save(next);
    };
    return kind === "card"
      ? createElement(CardVisibilitySwitch, { isPublic, onChange })
      : createElement(TileVisibilityButton, { isPublic, playerName: "Puka Nacua", onChange });
  }
  const host = win.document.createElement("div");
  win.document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
  const button = () => host.querySelector('[role="switch"]') as HTMLButtonElement;
  return {
    host,
    calls,
    button,
    async tap() {
      await act(async () => {
        button().dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      });
    },
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("card visibility switch", () => {
  after(() => win.close());

  it("saves right away and shows the new state", async () => {
    const view = await mount("card", false, () => ({ saved: Promise.resolve() }));
    try {
      assert.equal(view.button().getAttribute("aria-checked"), "false");
      assert.match(view.host.textContent ?? "", /Private/);
      await view.tap();
      assert.deepEqual(view.calls, [true]);
      assert.equal(view.button().getAttribute("aria-checked"), "true");
      assert.match(view.host.textContent ?? "", /Public on profile/);
      assert.match(view.host.textContent ?? "", /Saved/);
      await view.tap();
      assert.deepEqual(view.calls, [true, false]);
      assert.equal(view.button().getAttribute("aria-checked"), "false");
    } finally {
      view.unmount();
    }
  });

  it("says when the save failed", async () => {
    const view = await mount("card", true, () => ({ saved: Promise.reject(new Error("offline")) }));
    try {
      await view.tap();
      assert.match(view.host.textContent ?? "", /Couldn't save/);
    } finally {
      view.unmount();
    }
  });

  it("gives the switch a 44px or larger tap target", async () => {
    const view = await mount("card", true, () => ({ saved: Promise.resolve() }));
    try {
      assert.match(view.button().className, /min-h-14/);
      assert.equal(view.button().getAttribute("aria-label"), "Public on profile");
    } finally {
      view.unmount();
    }
  });
});

describe("collection tile visibility button", () => {
  it("toggles from the tile with a named 44px button", async () => {
    const view = await mount("tile", false, () => ({ saved: Promise.resolve() }));
    try {
      assert.match(view.button().className, /h-11 w-11/);
      assert.equal(view.button().getAttribute("aria-label"), "Puka Nacua: private");
      await view.tap();
      assert.deepEqual(view.calls, [true]);
      assert.equal(view.button().getAttribute("aria-checked"), "true");
      assert.equal(view.button().getAttribute("aria-label"), "Puka Nacua: public on profile");
    } finally {
      view.unmount();
    }
  });
});
