import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { SheetLoadFailed } from "./part-load-failed";

installDom();

/*
 * Where SheetLoadFailed sends focus when it goes. React's own focus restore
 * after a commit hides both of these from the older tests, so they are pinned
 * here: it only refocuses the opener when focus is still its own, and it does
 * so in the same commit (layout cleanup), before the parent's layout effects.
 * `opener.isConnected` needs a real browser's detach timing; jsdom can't show it.
 */

let root: Root;
let host: HTMLElement;
let opener: HTMLButtonElement;
let outside: HTMLButtonElement;

beforeEach(() => {
  opener = document.createElement("button");
  opener.textContent = "Open";
  outside = document.createElement("button");
  outside.textContent = "Elsewhere";
  host = document.createElement("div");
  document.body.append(opener, outside, host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
  outside.remove();
  mock.restoreAll();
});

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

/** Opens the sheet from `opener`, as a tap would: the opener has focus when it mounts. */
function open(onCommit?: (active: Element | null) => void) {
  function Parent({ show }: { show: boolean }) {
    useLayoutEffect(() => {
      onCommit?.(document.activeElement);
    }, [show]);
    return show ? createElement(SheetLoadFailed, { retry: () => {}, onClose: () => {} }) : null;
  }
  opener.focus();
  act(() => root.render(createElement(Parent, { show: true })));
  assert.ok(dialog(), "sheet open");
  return () => act(() => root.render(createElement(Parent, { show: false })));
}

describe("SheetLoadFailed hands focus back", () => {
  it("leaves focus alone when it has already moved outside the sheet", () => {
    const close = open();
    const focus = mock.method(opener, "focus");
    outside.focus();
    assert.equal(document.activeElement, outside);
    close();
    assert.equal(dialog(), null);
    assert.equal(focus.mock.callCount(), 0, "the opener is not refocused");
    assert.equal(document.activeElement, outside);
  });

  it("refocuses the opener once when focus is still inside the sheet", () => {
    const close = open();
    assert.ok(dialog()!.contains(document.activeElement), "Try again took focus");
    const focus = mock.method(opener, "focus");
    close();
    assert.equal(focus.mock.callCount(), 1);
    assert.equal(document.activeElement, opener);
  });

  it("has the opener focused by the time the parent's layout effects run in the same commit", () => {
    const seen: (Element | null)[] = [];
    const close = open((active) => seen.push(active));
    seen.length = 0;
    close();
    assert.equal(seen.length, 1, "one commit");
    assert.equal(seen[0], opener, "focus is back before layout effects of the commit that closed it");
  });
});
