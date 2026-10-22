import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ImageLightboxProvider, useImageLightbox } from "@/components/image-lightbox";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const win = dom.window;
const previous = {
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
  HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
  Node: Object.getOwnPropertyDescriptor(globalThis, "Node"),
  Element: Object.getOwnPropertyDescriptor(globalThis, "Element"),
  SVGElement: Object.getOwnPropertyDescriptor(globalThis, "SVGElement"),
  KeyboardEvent: Object.getOwnPropertyDescriptor(globalThis, "KeyboardEvent"),
  MouseEvent: Object.getOwnPropertyDescriptor(globalThis, "MouseEvent"),
  FocusEvent: Object.getOwnPropertyDescriptor(globalThis, "FocusEvent"),
  getComputedStyle: Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle"),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"),
  cancelAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame"),
  IS_REACT_ACT_ENVIRONMENT: Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT"),
};

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("SVGElement", win.SVGElement);
expose("KeyboardEvent", win.KeyboardEvent);
expose("MouseEvent", win.MouseEvent);
expose("FocusEvent", win.FocusEvent);
expose("getComputedStyle", win.getComputedStyle.bind(win));
expose("requestAnimationFrame", win.requestAnimationFrame.bind(win));
expose("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => {
  for (const [name, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name as keyof typeof globalThis];
  }
  win.close();
});

const photos = ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg", "https://cdn.example/c.jpg"];

function Opener({ images }: { images: string[] }) {
  const open = useImageLightbox();
  return (
    <button type="button" id="opener" onClick={() => open(images[0] ?? "", "Card photo", images)}>
      Open photo
    </button>
  );
}

function key(name: string, extras?: { shiftKey?: boolean }) {
  win.dispatchEvent(
    new win.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...extras }),
  );
}

function dialog() {
  const node = win.document.querySelector("[role=dialog]");
  assert.ok(node instanceof win.HTMLElement);
  return node;
}

function photoSrc() {
  return dialog().querySelector("img")?.getAttribute("src");
}

async function mount(images: string[]) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(createElement(ImageLightboxProvider, null, createElement(Opener, { images })));
  });
  const opener = win.document.getElementById("opener");
  assert.ok(opener instanceof win.HTMLButtonElement);
  return {
    opener,
    async open() {
      await act(async () => {
        opener.focus();
        opener.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async destroy() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function finishClose() {
  await act(async () => {
    await new Promise((resolve) => {
      win.setTimeout(resolve, 250);
    });
  });
}

describe("ImageLightbox", () => {
  it("returns focus to the opener after Escape and after Close", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      assert.equal(win.document.activeElement, dialog().querySelector("[aria-label=Close]"));

      await act(async () => {
        key("Escape");
      });
      await finishClose();
      assert.equal(win.document.querySelector("[role=dialog]"), null);
      assert.equal(document.activeElement === view.opener, true);

      await view.open();
      const close = dialog().querySelector("[aria-label=Close]");
      assert.ok(close instanceof win.HTMLButtonElement);
      await act(async () => {
        close.click();
      });
      await finishClose();
      assert.equal(win.document.querySelector("[role=dialog]"), null);
      assert.equal(document.activeElement === view.opener, true);
    } finally {
      await view.destroy();
    }
  });

  it("moves between photos with the arrow keys and stops at the ends", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      assert.equal(photoSrc(), photos[0]);
      assert.equal((dialog().querySelector("[aria-label='Previous photo']") as HTMLButtonElement).disabled, true);

      await act(async () => {
        key("ArrowRight");
      });
      assert.equal(photoSrc(), photos[1]);
      await act(async () => {
        key("ArrowRight");
      });
      assert.equal(photoSrc(), photos[2]);
      await act(async () => {
        key("ArrowRight");
      });
      assert.equal(photoSrc(), photos[2]);
      assert.equal((dialog().querySelector("[aria-label='Next photo']") as HTMLButtonElement).disabled, true);

      await act(async () => {
        key("ArrowLeft");
      });
      assert.equal(photoSrc(), photos[1]);
      await act(async () => {
        key("ArrowLeft");
      });
      assert.equal(photoSrc(), photos[0]);
      await act(async () => {
        key("ArrowLeft");
      });
      assert.equal(photoSrc(), photos[0]);
    } finally {
      await view.destroy();
    }
  });

  it("shows one photo without arrow buttons", async () => {
    const view = await mount([photos[0]]);
    try {
      await view.open();
      assert.equal(photoSrc(), photos[0]);
      assert.equal(dialog().querySelector("[aria-label='Previous photo']"), null);
      assert.equal(dialog().querySelector("[aria-label='Next photo']"), null);
      await act(async () => {
        key("ArrowRight");
        key("ArrowLeft");
      });
      assert.equal(photoSrc(), photos[0]);
    } finally {
      await view.destroy();
    }
  });

  it("wraps Tab and Shift+Tab inside the dialog", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      await act(async () => {
        key("ArrowRight");
      });
      const buttons = [...dialog().querySelectorAll("button")].filter(
        (button) => !button.hasAttribute("disabled"),
      );
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      assert.equal(buttons.length, 3);
      assert.equal(first?.getAttribute("aria-label"), "Close");
      assert.equal(last?.getAttribute("aria-label"), "Next photo");

      await act(async () => {
        last?.focus();
        key("Tab");
      });
      assert.equal(win.document.activeElement, first);

      await act(async () => {
        key("Tab", { shiftKey: true });
      });
      assert.equal(win.document.activeElement, last);
    } finally {
      await view.destroy();
    }
  });
});
