import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType } from "react";
import type { ScanMatch } from "@/lib/scan/match";
import type { ConfirmSheetState } from "./confirm-sheet";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/scan" });
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLInputElement", win.HTMLInputElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("IS_REACT_ACT_ENVIRONMENT", true);

type ConfirmProps = {
  photo: string | null;
  state: ConfirmSheetState;
  onConfirm: (match: ScanMatch, options: { save: boolean }) => void;
  onStepByStep: () => void;
  onRetake: () => void;
  onSapphire?: () => void;
  onClose: () => void;
};

let ConfirmSheet: ComponentType<ConfirmProps>;
let fixtures: typeof import("@/lib/scan/preview-fixtures");

before(async () => {
  ({ ConfirmSheet } = await import("./confirm-sheet"));
  fixtures = await import("@/lib/scan/preview-fixtures");
});

after(() => win.close());

/** Taps the first row of "Pick your card", when the list shows: the price screen is one tap away. */
async function pickFirst(host: HTMLElement) {
  // The reveal types in first: a tap on its label goes on.
  const label = host.querySelector<HTMLElement>('[data-reveal="label"]');
  if (label) {
    await act(async () => {
      label.click();
    });
  }
  const row = host.querySelector<HTMLButtonElement>('[data-pick="list"] button');
  if (!row) return;
  await act(async () => {
    row.click();
  });
}

async function mount(state: ConfirmSheetState, onSapphire?: () => void) {
  const confirmed: ScanMatch[] = [];
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(ConfirmSheet, {
        photo: null,
        state,
        onConfirm: (match) => confirmed.push(match),
        onStepByStep: () => {},
        onRetake: () => {},
        onSapphire,
        onClose: () => {},
      }),
    );
  });
  await pickFirst(host);
  return {
    host,
    confirmed,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>("button")];
const chip = (host: HTMLElement, name: string) => buttons(host).find((button) => (button.getAttribute("aria-label") ?? button.textContent ?? "").startsWith(name));
const click = async (button: HTMLButtonElement | undefined) => {
  assert.ok(button, "button");
  await act(async () => {
    button.click();
  });
};

describe("a parallel the sales box names is also a chip", () => {
  it("Black shows in the Parallel row, not only Something else, and is selectable", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SAPPHIRE_ASK], solds: fixtures.PREVIEW_SOLDS_NAMES_BLACK });
    try {
      const group = view.host.querySelector('[role="group"][aria-label="Parallel"]');
      assert.ok(group);
      const black = [...group.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label")?.startsWith("Black"));
      assert.ok(black, "a Black chip in the Parallel row");
      assert.equal(black.getAttribute("aria-pressed") ?? black.getAttribute("aria-checked"), "false");
      // The sales box names it: "Black · 1 sale $40.00".
      assert.match(view.host.textContent ?? "", /Black · 1 sale\s*\$40\.00/);
      await click(black);
      const picked = [...view.host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Parallel"] button')].find((button) => button.getAttribute("aria-label")?.startsWith("Black"));
      assert.equal(picked?.getAttribute("aria-pressed") ?? picked?.getAttribute("aria-checked"), "true");
      // Its price then loads through the price screen's lookup (none in this test).
    } finally {
      view.unmount();
    }
  });

  it("tapping the sales row selects the same chip", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SAPPHIRE_ASK], solds: fixtures.PREVIEW_SOLDS_NAMES_BLACK });
    try {
      assert.match(view.host.textContent ?? "", /Black · 1 sale\s*\$40\.00/, "the sales row names it, with its price");
      await click(buttons(view.host).find((button) => button.getAttribute("aria-label") === "Show Black sales, 1 sale"));
      const picked = chip(view.host.querySelector('[role="group"][aria-label="Parallel"]') as HTMLElement, "Black");
      assert.equal(picked?.getAttribute("aria-pressed") ?? picked?.getAttribute("aria-checked"), "true");
    } finally {
      view.unmount();
    }
  });
});

describe("Is this Sapphire?", () => {
  it("is offered on a set with a Sapphire Edition while nothing confirms it, as a 44px target, and calls back", async () => {
    let asked = 0;
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SAPPHIRE_ASK], solds: fixtures.PREVIEW_SOLDS_NAMES_BLACK }, () => {
      asked += 1;
    });
    try {
      const ask = buttons(view.host).find((button) => button.textContent === "Is this Sapphire?");
      assert.ok(ask);
      assert.match(ask.className, /min-h-11/);
      assert.match(ask.getAttribute("aria-label") ?? "", /Bowman U Chrome Sapphire/);
      assert.match(view.host.textContent ?? "", /2026 Bowman U Chrome #BCP-68/);
      await click(ask);
      assert.equal(asked, 1);
    } finally {
      view.unmount();
    }
  });

  it("is not offered once the set is Sapphire; a set named by sales says so", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SAPPHIRE], solds: fixtures.PREVIEW_SOLDS_NAMES_BLACK }, () => {});
    try {
      assert.equal(buttons(view.host).some((button) => button.textContent === "Is this Sapphire?"), false);
      assert.match(view.host.textContent ?? "", /Bowman U Chrome Sapphire #BCP-68/);
      assert.match(view.host.textContent ?? "", /Sapphire matched from recent sales/);
    } finally {
      view.unmount();
    }
  });

  it("is not offered on a set with no Sapphire Edition, or with no way to look it up", async () => {
    const none = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] }, () => {});
    try {
      assert.equal(buttons(none.host).some((button) => button.textContent === "Is this Sapphire?"), false);
    } finally {
      none.unmount();
    }
    const noHandler = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SAPPHIRE_ASK] });
    try {
      assert.equal(buttons(noHandler.host).some((button) => button.textContent === "Is this Sapphire?"), false);
    } finally {
      noHandler.unmount();
    }
  });
});
