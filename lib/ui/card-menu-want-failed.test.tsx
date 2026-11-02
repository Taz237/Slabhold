import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { WantButtonPending, menuWantButton } from "@/components/menu-want-button";
import { LAZY_PART_RETRY_MS } from "@/lib/ui/lazy-part";

installDom();

const card = { id: "22222222-2222-4222-8222-222222222222" } as never;
const Real: ComponentType<{ card: { id: string } }> = () =>
  createElement("button", { type: "button", "data-real": "" }, "Add to want list");

let host: HTMLElement;
let root: Root;
const realWarn = console.warn;

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  console.warn = () => {};
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  mock.timers.reset();
  console.warn = realWarn;
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

/** A Want slot whose chunk fails until `working` is set, drawn past its one automatic retry. */
async function failedSlot() {
  const state = { working: false, loads: 0 };
  const Slot = menuWantButton(async () => {
    state.loads += 1;
    if (!state.working) throw new Error("ChunkLoadError");
    return Real as never;
  });
  act(() => root.render(createElement(Slot, { card })));
  await settle();
  await act(async () => {
    mock.timers.tick(LAZY_PART_RETRY_MS);
  });
  await settle();
  return state;
}

const classes = (html: string) => new Set((/class="([^"]*)"/.exec(html)?.[1] ?? "").split(/\s+/));

describe("the ⋯ menu's Want slot when its chunk fails", () => {
  it("shows one compact retry chip in the placeholder's box, not the tall Try again panel", async () => {
    await failedSlot();
    assert.ok(!host.querySelector("[data-read-retry]"), "not the section panel");
    const buttons = host.querySelectorAll("button");
    assert.equal(buttons.length, 1);
    const retry = buttons[0];
    assert.equal(retry.getAttribute("aria-label"), "Try again");
    assert.match(retry.textContent ?? "", /Couldn.t load ·\s*Try again/);
    assert.equal(retry.disabled, false);

    // Same box as the pending chip (and the loaded one): 44px high, pill, same width cap.
    const chip = classes(retry.outerHTML);
    const pending = classes(renderToString(createElement(WantButtonPending)).replace(/^<div class="relative">/, ""));
    for (const cls of ["inline-flex", "min-h-11", "max-w-[12rem]", "rounded-full", "px-3", "py-1.5", "text-sm", "leading-5"]) {
      assert.ok(pending.has(cls), `pending has ${cls}`);
      assert.ok(chip.has(cls), `retry chip has ${cls}`);
    }
    assert.ok(chip.has("whitespace-nowrap"), "one line, so it never grows taller");
    assert.ok([...chip].some((cls) => /^text-violet-/.test(cls)), "purple text");
    assert.ok([...chip].some((cls) => /^focus-visible:ring-violet-/.test(cls)), "purple focus ring");
    assert.doesNotMatch(host.innerHTML, /teal|cyan/);
    assert.equal(host.firstElementChild?.className, "relative", "same wrapper as the pending chip");

    const live = host.querySelector('[aria-live="polite"]');
    assert.ok(live, "a polite live label");
    assert.match(live!.textContent ?? "", /Couldn.t load this\./);
  });

  it("Try again loads the real Want button", async () => {
    const state = await failedSlot();
    assert.equal(state.loads, 2);
    state.working = true;
    act(() => host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    assert.equal(state.loads, 3);
    assert.ok(host.querySelector("button[data-real]"));
    assert.ok(!host.querySelector('[aria-label="Try again"]'));
  });
});
