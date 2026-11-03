import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { BadgeRevealView, SPARK_COLORS, earnedDateLabel, nextStepLabel } from "./badge-reveal";
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

describe("reveal close and focus", () => {
  it("closes on Escape and on the X", () => {
    let closed = 0;
    mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose: () => (closed += 1) }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(closed, 1);
    const close = button("Close");
    assert.ok(close);
    act(() => close.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(closed, 2);
  });

  it("focuses the dialog on open and keeps Tab inside it", () => {
    mount(createElement(BadgeRevealView, { reveal, pinned: [], username: "democollector", onClose() {} }));
    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    assert.ok(dialog);
    assert.equal(document.activeElement, dialog);
    assert.equal(dialog.getAttribute("tabindex"), "-1");
    const tab = (shiftKey = false) =>
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true }));
      });
    const share = button("Share");
    share!.focus();
    tab();
    assert.equal(document.activeElement, button("Close"), "Tab on the last wraps to the first");
    tab(true);
    assert.equal(document.activeElement, share, "Shift+Tab on the first wraps to the last");
    dialog.focus();
    tab(true);
    assert.equal(document.activeElement, share, "Shift+Tab from the dialog goes to the last");
  });
});

describe("reveal motion", () => {
  it("draws no sparks with reduced motion", () => {
    state.reducedMotion = true;
    mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose() {} }));
    assert.equal(document.querySelector(".badge-reveal-sparks"), null);
  });

  it("colours the sparks with the tier's metal, never purple", () => {
    mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose() {} }));
    const sparks = document.querySelector<HTMLElement>(".badge-reveal-sparks");
    assert.ok(sparks);
    assert.equal(sparks.style.getPropertyValue("--spark"), SPARK_COLORS.silver);
    assert.equal(SPARK_COLORS.silver, "#8D96A3");
    assert.ok(sparks.children.length >= 10 && sparks.children.length <= 12);
    assert.doesNotMatch(sparks.outerHTML, /violet|purple/i);
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const rule = css.match(/\.badge-reveal-sparks > i \{([\s\S]*?)\}/)?.[1] ?? "";
    assert.match(rule, /background: var\(--spark\)/);
    assert.doesNotMatch(rule, /violet|purple|blur|shadow/);
  });

  it("keeps the Legendary loop off inside the reveal", () => {
    mount(
      createElement(BadgeRevealView, {
        reveal: { ...reveal, headline: { id: "l", category: "collector", tier: "legendary" }, next: null },
        pinned: [],
        onClose() {},
      }),
    );
    assert.equal(document.querySelector("[data-reveal-badge] .badge-aura"), null);
  });

  it("uses no tracked uppercase, bold, or radial washes", () => {
    const source = readFileSync(join(process.cwd(), "components/badges/badge-reveal.tsx"), "utf8");
    assert.doesNotMatch(source, /uppercase|tracking-\[|font-bold|font-extrabold|radial-gradient|infinite/);
  });
});

describe("reveal haptic", () => {
  it("ticks once at landing, only after the person has tapped the page", async () => {
    const calls: number[] = [];
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    const activation = { hasBeenActive: false };
    Object.defineProperty(nav, "userActivation", { configurable: true, value: activation });
    Object.defineProperty(nav, "vibrate", { configurable: true, value: (ms: number) => (calls.push(ms), true) });
    try {
      mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose() {} }));
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert.deepEqual(calls, [], "no tap yet: Chrome would log a blocked call");
      act(() => root!.unmount());
      root = null;
      activation.hasBeenActive = true;
      const host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      mount(createElement(BadgeRevealView, { reveal, pinned: [], onClose() {} }));
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert.deepEqual(calls, [8]);
    } finally {
      delete (nav as { userActivation?: unknown }).userActivation;
      delete (nav as { vibrate?: unknown }).vibrate;
    }
  });
});

describe("reveal copy", () => {
  it("leads with the badge name, the date, the rule and the next step", () => {
    mount(
      createElement(BadgeRevealView, {
        reveal: { ...reveal, headline: { ...reveal.headline, earnedAt: "2026-11-03T15:00:00.000Z" } },
        pinned: [],
        onClose() {},
      }),
    );
    const dialog = document.querySelector("[role='dialog']")!;
    assert.equal(dialog.querySelector("h2")?.textContent, "Silver Leaderboard");
    const text = dialog.textContent ?? "";
    assert.match(text, /Nov 3, 2026/);
    assert.match(text, /Weeks finished top 3 on any weekly board/);
    assert.match(text, /2 of 4 weeks to Gold/);
    assert.doesNotMatch(text, /Badge unlocked|Nice/);
  });

  it("formats the earned date and falls back to today", () => {
    const today = new Date(2026, 10, 3, 12);
    assert.equal(earnedDateLabel(undefined, today), "Nov 3, 2026");
    assert.equal(earnedDateLabel("not a date", today), "Nov 3, 2026");
    assert.equal(earnedDateLabel(new Date(2026, 0, 9, 12).toISOString(), today), "Jan 9, 2026");
  });

  it("reads the next step with of, and says top tier at Legendary only", () => {
    assert.equal(nextStepLabel("2 / 4 weeks to Gold", "silver"), "2 of 4 weeks to Gold");
    assert.equal(nextStepLabel(null, "legendary"), "Top tier. Nothing left to chase here.");
    assert.equal(nextStepLabel(null, "gold"), null);
  });
});
