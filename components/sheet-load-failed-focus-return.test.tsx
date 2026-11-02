import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { SheetLoadFailed } from "./part-load-failed";

installDom();

let root: Root;
let host: HTMLElement;
let opener: HTMLButtonElement;
let other: HTMLButtonElement;

beforeEach(() => {
  opener = document.createElement("button");
  opener.textContent = "Open";
  other = document.createElement("button");
  other.textContent = "Real sheet";
  document.body.append(opener, other);
  opener.focus();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
  other.remove();
});

const open = () => act(() => root.render(createElement(SheetLoadFailed, { retry: () => {}, onClose: () => {} })));
const close = () => act(() => root.render(null));
const inDialog = () => Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement));

describe("SheetLoadFailed focus return", () => {
  it("returns focus to the opener when it closes with focus inside the sheet", () => {
    open();
    assert.ok(inDialog(), "Try again has focus");
    close();
    assert.ok(document.activeElement === opener, "back on the opener");
  });

  it("leaves focus alone when something outside the sheet took it first", () => {
    open();
    // A real sheet that loaded on retry and focused itself.
    other.focus();
    close();
    assert.ok(document.activeElement === other, "focus stays where the real sheet put it");
  });

  it("returns focus to the opener when focus had fallen back to the body", () => {
    open();
    (document.activeElement as HTMLElement | null)?.blur();
    assert.ok(document.activeElement === document.body);
    close();
    assert.ok(document.activeElement === opener);
  });

  it("does not throw or focus a disconnected opener", () => {
    open();
    opener.remove();
    assert.doesNotThrow(close);
    assert.ok(document.activeElement !== opener);
  });

  it("hands focus to a sheet that swaps in and focuses itself in the same commit", () => {
    function RealSheet() {
      return createElement("button", { autoFocus: true }, "Real");
    }
    open();
    act(() => root.render(createElement(RealSheet)));
    assert.equal(document.activeElement?.textContent, "Real");
  });
});
