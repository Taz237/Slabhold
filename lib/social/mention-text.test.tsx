import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MentionText } from "@/components/mention-text";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("MouseEvent", win.MouseEvent);
expose("KeyboardEvent", win.KeyboardEvent);
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => {
  win.close();
});

function Card({ text }: { text: string }) {
  const [opened, setOpened] = useState(false);
  return createElement(
    "article",
    {
      onClick: () => setOpened(true),
      onKeyDown: () => setOpened(true),
    },
    createElement(MentionText, { text }),
    opened ? createElement("span", { id: "opened" }, "opened") : null,
  );
}

async function mount(text: string) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(createElement(Card, { text }));
  });
  return {
    host,
    async press(selector: string, type: "click" | "keydown" = "click") {
      const node = host.querySelector(selector);
      assert.ok(node, selector);
      await act(async () => {
        node.dispatchEvent(
          type === "click"
            ? new win.MouseEvent("click", { bubbles: true, cancelable: true })
            : new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
      });
    },
    opened() {
      return Boolean(host.querySelector("#opened"));
    },
    async destroy() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("tapping a link inside a post", () => {
  it("does not open the post for a URL or a hashtag, and mentions still bubble", async () => {
    const view = await mount("See https://ebay.com/itm/12 #psa @donnie");
    await view.press('a[href="https://ebay.com/itm/12"]');
    assert.equal(view.opened(), false);
    await view.press('a[href="/search?q=%23psa"]');
    assert.equal(view.opened(), false);
    await view.press('a[href="https://ebay.com/itm/12"]', "keydown");
    assert.equal(view.opened(), false);
    await view.press('a[href="/u/donnie"]');
    assert.equal(view.opened(), true);
    await view.destroy();
  });
});
