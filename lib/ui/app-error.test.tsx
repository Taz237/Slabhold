import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import AppError from "@/app/(app)/error";
import GlobalError from "@/app/global-error";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
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
expose("MouseEvent", win.MouseEvent);
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => {
  win.close();
});

function boom() {
  const error = new Error("secret token sk_live_abc");
  return Object.assign(error, { digest: "digest-9" });
}

describe("app error screens", () => {
  it("renders on-brand copy, Try again, and Go home without the error text", () => {
    const error = boom();
    const route = renderToStaticMarkup(
      createElement(AppError, { error, reset: () => undefined, retry: () => undefined }),
    );
    const root = renderToStaticMarkup(
      createElement(GlobalError, { error, reset: () => undefined, retry: () => undefined }),
    );

    for (const html of [route, root]) {
      assert.match(html, /Slabhold/);
      assert.match(html, /Something went wrong/);
      assert.match(html, /This screen hit a snag/);
      assert.match(html, /Try again/);
      assert.match(html, /Go home/);
      assert.match(html, /href="\/"/);
      assert.match(html, /min-height: 44px/);
      assert.match(html, /#f4f4f5/);
      assert.match(html, /#09090b/);
      assert.doesNotMatch(html, /sk_live_abc/);
      assert.doesNotMatch(html, /secret token/);
      assert.doesNotMatch(html, /Application error/);
      assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
    }

    assert.match(root, /<html[^>]*lang="en"/);
    assert.match(root, /<body/);
    assert.match(root, /<title>Something went wrong<\/title>/);
    assert.match(root, /class="slab-error slab-error-fill"/);
    assert.match(route, /class="slab-error"/);
    assert.doesNotMatch(route, /class="slab-error slab-error-fill"/);
  });

  it("logs the digest and Try again calls retry", async () => {
    const error = boom();
    let retries = 0;
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root: Root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(AppError, {
            error,
            reset: () => undefined,
            retry: () => {
              retries += 1;
            },
          }),
        );
      });
      const button = host.querySelector("button");
      assert.ok(button);
      assert.equal(button.textContent, "Try again");
      await act(async () => {
        button.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      assert.equal(retries, 1);
      assert.ok(logged.some((args) => args.includes(error)));
      const home = host.querySelector("a");
      assert.equal(home?.getAttribute("href"), "/");
      assert.equal(home?.textContent, "Go home");
    } finally {
      console.error = original;
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
