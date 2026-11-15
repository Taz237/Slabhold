import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "@/components/avatar";
import { MailDayTileBody } from "@/components/mail-day-card";
import { ImageLightboxContext, type LightboxOptions } from "@/components/image-lightbox";
import { forgetPhotoSizes, knownPhotoSize } from "@/lib/social/photo-sizes";
import { thumbnailsIn } from "./thumbnail-origins";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const win = dom.window;
const names = ["window", "document", "navigator", "HTMLElement", "HTMLImageElement", "Node", "Element", "MouseEvent", "IS_REACT_ACT_ENVIRONMENT"];
const previous = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const values: Record<string, unknown> = {
  window: win,
  document: win.document,
  navigator: win.navigator,
  HTMLElement: win.HTMLElement,
  HTMLImageElement: win.HTMLImageElement,
  Node: win.Node,
  Element: win.Element,
  MouseEvent: win.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
};
for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: values[name] });
after(() => {
  for (const [name, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name as keyof typeof globalThis];
  }
  win.close();
});

type Call = { src: string; alt: string; gallery?: readonly string[]; options?: LightboxOptions };

/** Renders with a fake viewer that records what each tap opens. */
async function render(element: React.ReactElement) {
  const calls: Call[] = [];
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const open = (src: string, alt: string, gallery?: readonly string[], options?: LightboxOptions) => {
    calls.push({ src, alt, gallery, options });
  };
  await act(async () => {
    root.render(createElement(ImageLightboxContext.Provider, { value: open }, element));
  });
  return {
    host,
    calls,
    async tap(button: Element) {
      await act(async () => {
        button.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async destroy() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function sized(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: height });
}

describe("thumbnail origins", () => {
  it("lists a frame's thumbnails in order and notes their sizes", () => {
    forgetPhotoSizes();
    const frame = win.document.createElement("div");
    frame.innerHTML = `<img data-photo-index="1" src="b.jpg"><img src="x.jpg"><img data-photo-index="0" src="a.jpg">`;
    const [b, , a] = [...frame.querySelectorAll("img")];
    sized(a, 1000, 800);
    sized(b, 0, 0);
    const thumbs = thumbnailsIn(frame);
    assert.deepEqual(thumbs.map((img) => img.getAttribute("src")), ["a.jpg", "b.jpg"]);
    assert.deepEqual(knownPhotoSize("a.jpg"), { width: 1000, height: 800 });
    assert.equal(knownPhotoSize("b.jpg"), null, "not loaded yet");
    assert.deepEqual(thumbnailsIn(null), []);
  });

  it("an avatar grows out of its round thumbnail", async () => {
    const markup = renderToStaticMarkup(createElement(Avatar, { name: "Sam", image: "me.jpg" }));
    assert.match(markup, /data-photo-index="0"/);
    assert.match(markup, /data-photo-radius="full"/);

    const view = await render(createElement(Avatar, { name: "Sam", image: "me.jpg" }));
    try {
      const button = view.host.querySelector("button");
      assert.ok(button);
      await view.tap(button);
      assert.equal(view.calls.length, 1);
      const [call] = view.calls;
      assert.equal(call.src, "me.jpg");
      assert.equal(call.alt, "Sam's profile picture");
      assert.equal(call.options?.origins?.length, 1);
      assert.equal(call.options?.origins?.[0], view.host.querySelector("img"));
    } finally {
      await view.destroy();
    }
  });

  it("pickup photos open as one swipeable set, each growing from its own tile", async () => {
    const photos = ["p1.jpg", "p2.jpg", "p3.jpg"];
    const view = await render(
      createElement(MailDayTileBody, {
        hero: false,
        player: "A player",
        detail: "",
        photos,
        href: null,
        priceLabel: null,
        soldHref: null,
        sourceLabel: null,
        paidLabel: null,
        onOpen: () => undefined,
      }),
    );
    try {
      const imgs = [...view.host.querySelectorAll("img")];
      assert.deepEqual(imgs.map((img) => img.getAttribute("data-photo-index")), ["0", "1", "2"]);
      const buttons = view.host.querySelectorAll("button[aria-label^='View photo']");
      assert.equal(buttons.length, 3);
      assert.deepEqual([...buttons].map((b) => b.getAttribute("aria-label")), ["View photo 1", "View photo 2", "View photo 3"]);
    } finally {
      await view.destroy();
    }

    const opened: Call[] = [];
    const tile = await render(
      createElement(MailDayTileBody, {
        hero: true,
        player: "A player",
        detail: "",
        photos,
        href: null,
        priceLabel: null,
        soldHref: null,
        sourceLabel: null,
        paidLabel: null,
        onOpen: (src: string, alt: string, gallery?: readonly string[], options?: LightboxOptions) =>
          opened.push({ src, alt, gallery, options }),
      }),
    );
    try {
      const second = tile.host.querySelectorAll("button[aria-label^='View photo']")[1];
      await tile.tap(second);
      assert.equal(opened.length, 1);
      assert.equal(opened[0].src, "p2.jpg");
      assert.deepEqual(opened[0].gallery, photos);
      assert.deepEqual(
        opened[0].options?.origins?.map((img) => img?.getAttribute("src")),
        photos,
      );
    } finally {
      await tile.destroy();
    }
  });
});
