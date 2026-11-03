import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { BadgeRevealView } from "./badge-reveal";
import type { BadgeReveal } from "@/lib/badges/reveal";

const { state } = installDom();

let root: Root | null = null;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.reducedMotion = false;
});

function mount(element: ReactNode) {
  act(() => root!.render(element));
}

const reveal: BadgeReveal = {
  headline: { id: "b1", category: "leaderboard", tier: "silver" },
  title: "Silver Leaderboard unlocked",
  next: "2 / 4 weeks to Gold",
  others: [],
  ids: ["b1"],
};

function button(name: string) {
  return [...document.querySelectorAll("button")].find(
    (node) => (node.getAttribute("aria-label") ?? node.textContent) === name,
  );
}

async function click(node: Element | undefined) {
  assert.ok(node, "button");
  await act(async () => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("reveal pin toggle", () => {
  it("unpins a pinned badge, saves the rest, then pins it again", async () => {
    const saves: string[][] = [];
    const savePins = async (pins: readonly string[]) => {
      saves.push([...pins]);
      return { ok: true as const };
    };
    mount(
      createElement(BadgeRevealView, {
        reveal,
        pinned: ["collector:gold", "leaderboard:silver"],
        savePins,
        onClose() {},
      }),
    );
    const pinned = button("Pinned");
    assert.ok(pinned, "Pinned");
    assert.equal(pinned.hasAttribute("disabled"), false);
    await click(pinned);
    assert.deepEqual(saves, [["collector:gold"]]);
    assert.ok(button("Pin to profile"), "back to Pin to profile");
    assert.match(document.querySelector("[role='status']")?.textContent ?? "", /Unpinned\. Tap Pin to profile to undo\./);

    await click(button("Pin to profile"));
    assert.deepEqual(saves[1], ["collector:gold", "leaderboard:silver"]);
    assert.ok(button("Pinned"), "pinned again");
  });

  it("shows Saving… with aria-busy while the save runs", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    const savePins = () => new Promise<{ ok: true }>((resolve) => (finish = resolve));
    mount(createElement(BadgeRevealView, { reveal, pinned: [], savePins, onClose() {} }));
    await click(button("Pin to profile"));
    const saving = button("Saving…");
    assert.ok(saving, "Saving…");
    assert.equal(saving.getAttribute("aria-busy"), "true");
    assert.doesNotMatch(saving.className, /opacity/);
    await act(async () => finish({ ok: true }));
    assert.ok(button("Pinned"));
  });

  it("says so in the status line when the save fails", async () => {
    const savePins = async () => ({ ok: false as const, error: "nope" });
    mount(createElement(BadgeRevealView, { reveal, pinned: [], savePins, onClose() {} }));
    await click(button("Pin to profile"));
    assert.match(document.querySelector("[role='status']")?.textContent ?? "", /Couldn't pin it/);
    assert.ok(button("Pin to profile"));
  });
});
