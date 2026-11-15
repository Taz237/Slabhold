import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { StrictMode, act, createElement } from "react";
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
  Event: Object.getOwnPropertyDescriptor(globalThis, "Event"),
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
expose("Event", win.Event);
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

function Opener({ images, footer }: { images: string[]; footer?: boolean }) {
  const open = useImageLightbox();
  return (
    <button
      type="button"
      id="opener"
      onClick={() =>
        open(images[0] ?? "", "Card photo", images, {
          footer: footer
            ? (close) => (
                <button type="button" onClick={close}>
                  Like
                </button>
              )
            : undefined,
        })
      }
    >
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

/** The photo on screen: the one slide that isn't hidden from screen readers. */
function photoSrc() {
  return dialog().querySelector("[data-photo-slide]:not([aria-hidden]) img")?.getAttribute("src");
}

function dots() {
  return dialog().querySelector("[data-photo-dots]")?.getAttribute("aria-label") ?? null;
}

function pointer(type: string, x: number, y: number, id = 1) {
  const stage = dialog().querySelector("[data-photo-stage]");
  assert.ok(stage);
  const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: id });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  stage.dispatchEvent(event);
}

async function drag(from: [number, number], to: [number, number]) {
  await act(async () => {
    pointer("pointerdown", ...from);
    const steps = 4;
    for (let i = 1; i <= steps; i += 1) {
      pointer(
        "pointermove",
        from[0] + ((to[0] - from[0]) * i) / steps,
        from[1] + ((to[1] - from[1]) * i) / steps,
      );
    }
    pointer("pointerup", ...to);
  });
}

async function mount(images: string[], footer = false, strict = false) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root: Root = createRoot(host);
  const tree = createElement(ImageLightboxProvider, null, createElement(Opener, { images, footer }));
  await act(async () => {
    root.render(strict ? createElement(StrictMode, null, tree) : tree);
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
      // The viewer is its own lazily loaded chunk.
      for (let i = 0; i < 100 && !win.document.querySelector("[role=dialog]"); i += 1) await wait(10);
      assert.ok(win.document.querySelector("[role=dialog]"), "viewer opened");
    },
    async destroy() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => {
      win.setTimeout(resolve, ms);
    });
  });
}

const finishClose = () => wait(400);

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

  it("goes truly fullscreen: hides the header and tab bar while open", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      assert.equal(win.document.documentElement.hasAttribute("data-photo-viewer"), true);
      assert.match(dialog().querySelector("[aria-hidden=true]")?.className ?? "", /bg-black/);
      await act(async () => {
        key("Escape");
      });
      // The header and tab bar start fading back as the photo shrinks home.
      assert.equal(win.document.documentElement.hasAttribute("data-photo-viewer"), false);
      await finishClose();
    } finally {
      await view.destroy();
    }
  });

  it("clears fullscreen after close even when effects run twice (dev StrictMode)", async () => {
    const view = await mount(photos, false, true);
    try {
      await view.open();
      assert.equal(win.document.documentElement.hasAttribute("data-photo-viewer"), true);
      await act(async () => {
        key("Escape");
      });
      await finishClose();
      assert.equal(win.document.querySelector("[role=dialog]"), null);
      assert.equal(win.document.documentElement.hasAttribute("data-photo-viewer"), false);
    } finally {
      await view.destroy();
    }
  });

  it("has no arrow buttons, shows dots, and still moves with the arrow keys", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      assert.equal(dialog().querySelector("[aria-label='Previous photo']"), null);
      assert.equal(dialog().querySelector("[aria-label='Next photo']"), null);
      assert.equal(photoSrc(), photos[0]);
      assert.equal(dots(), "Photo 1 of 3");

      await act(async () => {
        key("ArrowRight");
      });
      assert.equal(photoSrc(), photos[1]);
      assert.equal(dots(), "Photo 2 of 3");
      await act(async () => {
        key("ArrowRight");
        key("ArrowRight");
      });
      assert.equal(photoSrc(), photos[2]);
      await act(async () => {
        key("ArrowLeft");
        key("ArrowLeft");
        key("ArrowLeft");
      });
      assert.equal(photoSrc(), photos[0]);
      assert.equal(dots(), "Photo 1 of 3");
    } finally {
      await view.destroy();
    }
  });

  it("loads the photo and its neighbours, and the next one as you go", async () => {
    const four = [...photos, "https://cdn.example/d.jpg"];
    const view = await mount(four);
    try {
      await view.open();
      const srcOf = (i: number) =>
        dialog().querySelector(`[data-photo-slide="${i}"] img`)?.getAttribute("src") ?? null;
      assert.equal(srcOf(0), four[0]);
      assert.equal(srcOf(1), four[1]);
      assert.equal(srcOf(2), null);
      await act(async () => {
        key("ArrowRight");
      });
      assert.equal(srcOf(2), four[2]);
      assert.equal(srcOf(3), null);
    } finally {
      await view.destroy();
    }
  });

  it("shows one photo without dots", async () => {
    const view = await mount([photos[0]]);
    try {
      await view.open();
      assert.equal(photoSrc(), photos[0]);
      assert.equal(dots(), null);
      await act(async () => {
        key("ArrowRight");
        key("ArrowLeft");
      });
      assert.equal(photoSrc(), photos[0]);
    } finally {
      await view.destroy();
    }
  });

  it("swipes to the next photo and springs back at the last", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      await drag([600, 400], [200, 400]);
      assert.equal(dots(), "Photo 2 of 3");
      await drag([600, 400], [200, 400]);
      assert.equal(dots(), "Photo 3 of 3");
      await drag([600, 400], [200, 400]);
      assert.equal(dots(), "Photo 3 of 3", "nothing past the last photo");
      await drag([200, 400], [600, 400]);
      assert.equal(dots(), "Photo 2 of 3");
    } finally {
      await view.destroy();
    }
  });

  it("closes on a long swipe down and springs back on a short one", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      await drag([500, 300], [500, 320]);
      await wait(400);
      assert.ok(win.document.querySelector("[role=dialog]"), "a short drag stays open");

      await drag([500, 200], [500, 600]);
      await finishClose();
      assert.equal(win.document.querySelector("[role=dialog]"), null);
      assert.equal(document.activeElement === view.opener, true);
    } finally {
      await view.destroy();
    }
  });

  it("one tap hides the buttons and another brings them back", async () => {
    const view = await mount(photos, true);
    try {
      await view.open();
      const chrome = () => dialog().querySelector("[data-photo-chrome]");
      assert.equal(chrome()?.getAttribute("data-photo-chrome"), "shown");
      await act(async () => {
        pointer("pointerdown", 500, 400);
        pointer("pointerup", 500, 400);
      });
      await wait(350);
      assert.equal(chrome()?.getAttribute("data-photo-chrome"), "hidden");
      assert.equal(chrome()?.hasAttribute("inert"), true);
      await act(async () => {
        pointer("pointerdown", 500, 400);
        pointer("pointerup", 500, 400);
      });
      await wait(350);
      assert.equal(chrome()?.getAttribute("data-photo-chrome"), "shown");
    } finally {
      await view.destroy();
    }
  });

  it("lifting the fingers after a pinch is not a tap", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      await act(async () => {
        pointer("pointerdown", 450, 400, 1);
        pointer("pointerdown", 550, 400, 2);
        pointer("pointermove", 400, 400, 1);
        pointer("pointermove", 600, 400, 2);
        pointer("pointerup", 400, 400, 1);
        pointer("pointerup", 600, 400, 2);
      });
      await wait(350);
      assert.equal(dialog().querySelector("[data-photo-chrome]")?.getAttribute("data-photo-chrome"), "shown");
      const layer = dialog().querySelector<HTMLElement>('[data-photo-slide="0"] .relative');
      assert.match(layer?.style.transform ?? "", /scale\(2\)/, "pinched to 2x");
    } finally {
      await view.destroy();
    }
  });

  it("a double tap zooms instead of hiding the buttons", async () => {
    const view = await mount(photos);
    try {
      await view.open();
      await act(async () => {
        pointer("pointerdown", 500, 400);
        pointer("pointerup", 500, 400);
        pointer("pointerdown", 502, 401);
        pointer("pointerup", 502, 401);
      });
      await wait(350);
      assert.equal(dialog().querySelector("[data-photo-chrome]")?.getAttribute("data-photo-chrome"), "shown");
      const layer = dialog().querySelector<HTMLElement>('[data-photo-slide="0"] .relative');
      assert.match(layer?.style.transform ?? "", /scale\(2\.5\)/);

      // Zoomed: a sideways drag pans the photo, it doesn't change photos.
      await drag([600, 400], [200, 400]);
      assert.equal(dots(), "Photo 1 of 3");
    } finally {
      await view.destroy();
    }
  });

  it("shows the post's actions and wraps Tab inside the dialog", async () => {
    const view = await mount(photos, true);
    try {
      await view.open();
      const buttons = [...dialog().querySelectorAll("button")];
      assert.deepEqual(
        buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent),
        ["Close", "Like"],
      );
      const [first, last] = buttons;
      await act(async () => {
        last?.focus();
        key("Tab");
      });
      assert.equal(win.document.activeElement, first);
      await act(async () => {
        key("Tab", { shiftKey: true });
      });
      assert.equal(win.document.activeElement, last);

      // A footer action closes the viewer first.
      await act(async () => {
        last?.click();
      });
      await finishClose();
      assert.equal(win.document.querySelector("[role=dialog]"), null);
    } finally {
      await view.destroy();
    }
  });
});

describe("photo viewer wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("fades the header and tab bar out while the viewer is open", () => {
    const shell = read("components/app-shell.tsx");
    assert.equal(shell.match(/data-app-chrome=""/g)?.length, 2);
    assert.match(read("app/globals.css"), /html\[data-photo-viewer\] \[data-app-chrome\] \{\s*opacity: 0;/);
  });

  it("hides the iOS status bar through the native module, never a static import", () => {
    assert.match(read("lib/ios/native.ts"), /export function setStatusBarHidden\(hidden: boolean\)/);
    const viewer = read("components/photo-viewer.tsx");
    assert.match(viewer, /isNativeApp\(\)/);
    assert.match(viewer, /native\.setStatusBarHidden\(true\)/);
    assert.match(viewer, /native\.setStatusBarHidden\(false\)/);
  });

  it("keeps the viewer out of every page's first load", () => {
    const provider = read("components/image-lightbox.tsx");
    assert.match(provider, /lazy\(loadViewer\)/);
    assert.match(provider, /import\("@\/components\/photo-viewer"\)/);
    assert.doesNotMatch(provider, /^import [^;]*photo-viewer/m);
  });

  it("sits inside SocialProvider so the footer can like, reply and repost", () => {
    const chrome = read("components/app-chrome.tsx");
    assert.ok(chrome.indexOf("<SocialProvider>") < chrome.indexOf("<ImageLightboxProvider>"));
    assert.match(read("components/tweet.tsx"), /footer: \(close\) => \(\s*<Engagement\s+media/);
  });
});
