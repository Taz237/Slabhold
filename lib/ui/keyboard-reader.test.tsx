import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";
import { useKeyboardInset, useKeyboardOpen } from "@/lib/ui/use-keyboard-inset";

const { win } = installDom();

const seen: { inset: number; keyboardOpen: boolean; open: boolean }[] = [];
function Probe() {
  const keyboard = useKeyboardInset();
  const open = useKeyboardOpen();
  seen.push({ ...keyboard, open });
  return null;
}

function setHeight(height: number, viewport: EventTarget & { height: number }) {
  Object.defineProperty(win, "innerHeight", { configurable: true, value: height });
  viewport.height = height;
}

async function frames(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await new Promise((resolve) => win.requestAnimationFrame(() => resolve(null)));
    });
  }
}

function fire(name: string, keyboardHeight?: number) {
  act(() => {
    win.dispatchEvent(Object.assign(new win.Event(name), keyboardHeight ? { keyboardHeight } : {}));
  });
}

describe("the shared keyboard reader", () => {
  const viewport = Object.assign(new win.EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  Object.defineProperty(win, "visualViewport", { configurable: true, value: viewport });
  Object.defineProperty(win, "innerHeight", { configurable: true, value: 844 });
  let unmount = () => {};

  after(() => unmount());

  it("mounts one hidden probe, and lifts by the keys over a full-height web view", async () => {
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
    unmount = () => act(() => root.unmount());
    await frames();
    assert.equal(win.document.querySelectorAll("[data-keyboard-probe]").length, 1);
    assert.deepEqual(seen.at(-1), { inset: 0, keyboardOpen: false, open: false });

    fire("keyboardWillShow", 336);
    fire("keyboardDidShow", 336);
    await frames();
    assert.deepEqual(seen.at(-1), { inset: 336, keyboardOpen: true, open: true });

    fire("keyboardWillHide");
    await frames();
    assert.deepEqual(seen.at(-1), { inset: 0, keyboardOpen: false, open: false });
  });

  it("a web view that shrinks for the keys: open, but no lift, and no jump on the next open", async () => {
    // Learn it once: the page gets 336px shorter as the keys come up.
    fire("keyboardWillShow", 336);
    setHeight(508, viewport);
    act(() => {
      viewport.dispatchEvent(new win.Event("resize"));
    });
    fire("keyboardDidShow", 336);
    await frames();
    assert.deepEqual(seen.at(-1), { inset: 0, keyboardOpen: true, open: true });

    fire("keyboardWillHide");
    setHeight(844, viewport);
    act(() => {
      viewport.dispatchEvent(new win.Event("resize"));
    });
    await frames();
    assert.deepEqual(seen.at(-1), { inset: 0, keyboardOpen: false, open: false });

    // Next open: keyboardWillShow arrives before the resize. The lift never shows the raw height.
    const from = seen.length;
    fire("keyboardWillShow", 336);
    await frames();
    setHeight(508, viewport);
    act(() => {
      viewport.dispatchEvent(new win.Event("resize"));
    });
    await frames();
    const during = seen.slice(from);
    assert.ok(during.some((state) => state.open), "the tab bar hides");
    assert.ok(during.every((state) => state.inset === 0), `no lift on the way up: ${JSON.stringify(during)}`);
  });

  it("Safari: the visual viewport shrinks, so the bar lifts by what it covers", async () => {
    fire("keyboardWillHide");
    setHeight(844, viewport);
    await frames();
    viewport.height = 508;
    act(() => {
      viewport.dispatchEvent(new win.Event("resize"));
    });
    await frames();
    assert.deepEqual(seen.at(-1), { inset: 336, keyboardOpen: true, open: true });
    viewport.height = 844;
    act(() => {
      viewport.dispatchEvent(new win.Event("resize"));
    });
    await frames();
    assert.deepEqual(seen.at(-1), { inset: 0, keyboardOpen: false, open: false });
  });
});
