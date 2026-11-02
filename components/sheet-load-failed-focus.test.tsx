import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { PartLoadFailed, SheetLoadFailed } from "./part-load-failed";

installDom();

let root: Root;
let host: HTMLElement;
let opener: HTMLButtonElement;

beforeEach(() => {
  opener = document.createElement("button");
  opener.textContent = "Open";
  document.body.append(opener);
  opener.focus();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
});

const tryAgain = () =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Try again") ?? null;

describe("SheetLoadFailed focus", () => {
  it("is a modal dialog and moves focus to Try again", () => {
    act(() => root.render(createElement(SheetLoadFailed, { retry: () => {}, onClose: () => {} })));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.ok(tryAgain());
    assert.ok(document.activeElement === tryAgain(), "focus");
  });

  it("gives focus back to the opener when it closes", () => {
    act(() => root.render(createElement(SheetLoadFailed, { retry: () => {}, onClose: () => {} })));
    assert.ok(document.activeElement === tryAgain(), "focus");
    act(() => root.render(null));
    assert.ok(document.activeElement === opener, "focus");
  });

  it("leaves focus alone for the in-place PartLoadFailed", () => {
    act(() => root.render(createElement(PartLoadFailed, { retry: () => {} })));
    assert.ok(tryAgain());
    assert.ok(document.activeElement === opener, "focus");
    assert.equal(tryAgain()?.hasAttribute("autofocus"), false);
  });
});
