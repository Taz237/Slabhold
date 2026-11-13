import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/" });
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
expose("IS_REACT_ACT_ENVIRONMENT", true);

let OfflineBanner: ComponentType;

before(async () => {
  ({ OfflineBanner } = await import("./offline-banner"));
});

after(() => win.close());

function setOnline(online: boolean) {
  Object.defineProperty(win.navigator, "onLine", { configurable: true, get: () => online });
  win.dispatchEvent(new win.Event(online ? "online" : "offline"));
}

function banner() {
  return win.document.querySelector("[data-offline-banner]");
}

describe("OfflineBanner", () => {
  it("shows while the phone is offline and goes when it's back", async () => {
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(OfflineBanner)));
    assert.equal(banner(), null, "nothing while online");

    await act(async () => setOnline(false));
    assert.equal(banner()?.getAttribute("role"), "status");
    assert.match(banner()?.textContent ?? "", /^You're offline/);

    await act(async () => setOnline(true));
    assert.equal(banner(), null);

    act(() => root.unmount());
    host.remove();
  });

  it("renders nothing on the server, so the first paint never shifts", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    assert.equal(renderToStaticMarkup(createElement(OfflineBanner)), "");
  });

  it("sits in the app shell's header, in zinc, with plain copy", () => {
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
    assert.match(header, /<OfflineBanner \/>/);
    const source = readFileSync(join(process.cwd(), "components/offline-banner.tsx"), "utf8");
    assert.doesNotMatch(source, /teal|cyan|amber|rose|animate-/);
    const copy = source.match(/OFFLINE_COPY = "([^"]+)"/)?.[1] ?? "";
    assert.ok(copy.length > 0);
    assert.doesNotMatch(copy, /!|\.$|\bbest\b|\bAI\b|\bfree\b/);
  });
});
