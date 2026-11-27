import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { act, createElement, type ComponentType } from "react";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();

let InlinePollButton: ComponentType<{ state: "hidden" | "disabled" | "on"; onStart: () => void }>;

before(async () => {
  ({ InlinePollButton } = await import("./inline-poll-button"));
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

async function render(state: "hidden" | "disabled" | "on") {
  let starts = 0;
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(InlinePollButton, { state, onStart: () => (starts += 1) })));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { button: host.querySelector<HTMLButtonElement>('button[aria-label="Add a poll"]'), starts: () => starts };
}

describe("Add a poll on the home feed", () => {
  it("is a 44px purple tool button that opens the poll on a tap", async () => {
    const { button, starts } = await render("on");
    assert.ok(button);
    assert.equal(button.disabled, false);
    assert.match(button.className, /\bh-11 w-11\b/);
    assert.match(button.className, /text-\[#7C3AED\]/);
    assert.doesNotMatch(button.className, /teal/);
    act(() => button.click());
    assert.equal(starts(), 1);
  });

  it("rests when disabled and is gone when hidden", async () => {
    const disabled = await render("disabled");
    assert.equal(disabled.button?.disabled, true);
    act(() => disabled.button!.click());
    assert.equal(disabled.starts(), 0);
    cleanup?.();
    cleanup = null;
    assert.equal((await render("hidden")).button, null);
  });
});
