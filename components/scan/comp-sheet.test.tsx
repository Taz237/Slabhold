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

import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { ScanCompResult } from "@/lib/scan/comp";

type Props = {
  photo: string | null;
  state: ConfirmSheetState;
  lookup: (identity: QuickCompIdentity) => Promise<ScanCompResult>;
  onAdd: (match: ScanMatch, options: { save: boolean }) => void;
  onScanAnother: () => void;
  onSearch: () => void;
  onClose: () => void;
};

let CompSheet: ComponentType<Props>;
let fixtures: typeof import("@/lib/scan/preview-fixtures");

before(async () => {
  ({ CompSheet } = await import("./comp-sheet"));
  fixtures = await import("@/lib/scan/preview-fixtures");
});

after(() => win.close());

type Calls = { lookups: QuickCompIdentity[]; added: ScanMatch[]; saves: boolean[]; next: number; search: number };

async function mount(state: ConfirmSheetState, lookup?: Props["lookup"]) {
  const calls: Calls = { lookups: [], added: [], saves: [], next: 0, search: 0 };
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(CompSheet, {
        photo: null,
        state,
        lookup: async (identity) => {
          calls.lookups.push(identity);
          return (lookup ?? fixtures.previewCompLookup)(identity);
        },
        onAdd: (match, options) => {
          calls.added.push(match);
          calls.saves.push(options.save);
        },
        onScanAnother: () => {
          calls.next += 1;
        },
        onSearch: () => {
          calls.search += 1;
        },
        onClose: () => {},
      }),
    );
  });
  return {
    calls,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function text(): string {
  return win.document.body.textContent ?? "";
}

function button(name: string): HTMLButtonElement {
  const found = [...win.document.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === name || node.textContent?.trim() === name,
  );
  assert.ok(found, `button ${name}`);
  return found as HTMLButtonElement;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

async function waitFor(check: () => boolean, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  throw new Error(text().slice(0, 600));
}

describe("CompSheet", () => {
  it("shows a slab's value and last sales with no tap, from its own grade", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
    try {
      assert.ok(text().includes("Checking recent sales"), "a skeleton while it loads");
      await waitFor(() => text().includes("Last sales"));
      assert.equal(view.calls.lookups[0]?.grade, "PSA 10");
      assert.equal(view.calls.lookups[0]?.parallel, "Silver");
      assert.ok(text().includes("$975.00"), "the median of the 6 cached sales");
      assert.ok(text().includes("Based on 6 sales"));
      assert.ok(text().includes("Trending up"));
      assert.ok(text().includes("Recent sold prices via Trawl"));
    } finally {
      view.unmount();
    }
  });

  it("looks up again in one tap when the grade changes, and switching back is instant", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
    try {
      await waitFor(() => text().includes("Based on 6 sales"));
      await click(button("Raw"));
      await waitFor(() => text().includes("Based on 4 sales"));
      assert.equal(view.calls.lookups.at(-1)?.grade, "Raw");
      await click(button("PSA 10"));
      assert.ok(text().includes("Based on 6 sales"));
      assert.equal(view.calls.lookups.length, 2, "PSA 10 came from the sheet's memory");
    } finally {
      view.unmount();
    }
  });

  it("prices Base when the parallel is open, says so, and one tap changes it", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW });
    try {
      await waitFor(() => text().includes("Not enough recent sales for a value yet"));
      assert.ok(text().includes("Showing Base. Tap your parallel if it's different."));
      assert.equal(view.calls.lookups[0]?.parallel, "Base");
      assert.equal(button("Base").getAttribute("aria-pressed"), "true", "the chip matches the prices shown");
      await click(button("Silver"));
      await waitFor(() => text().includes("Based on 5 sales"));
      assert.equal(text().includes("Showing Base"), false);
    } finally {
      view.unmount();
    }
  });

  it("says plainly when we have no sales, and shows no price", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] }, async () => ({ status: "none" }));
    try {
      await waitFor(() => text().includes("No recent sales saved for this card yet"));
      assert.equal(/\$\d/.test(text()), false, "no dollar figure anywhere");
    } finally {
      view.unmount();
    }
  });

  it("offers Try again when the lookup fails", async () => {
    let fail = true;
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] }, async (identity) => {
      if (fail) throw new Error("down");
      return fixtures.previewCompLookup(identity);
    });
    try {
      await waitFor(() => text().includes("We couldn't load sold prices"));
      fail = false;
      await click(button("Try again"));
      await waitFor(() => text().includes("Based on 6 sales"));
    } finally {
      view.unmount();
    }
  });

  it("adds the card in one tap without leaving, with the picked parallel", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
    try {
      await click(button("Add to collection"));
      assert.equal(view.calls.added[0]?.parallel, "Silver");
      assert.deepEqual(view.calls.saves, [true]);
      await click(button("Scan another"));
      assert.equal(view.calls.next, 1);
    } finally {
      view.unmount();
    }
  });

  it("sends None of these and no match to a typed search", async () => {
    const view = await mount({ kind: "none" });
    try {
      await click(button("Look it up by name"));
      assert.equal(view.calls.search, 1);
    } finally {
      view.unmount();
    }
  });

  it("keeps every button at an accessible name", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW });
    try {
      for (const node of win.document.querySelectorAll("button")) {
        const name = node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "";
        assert.ok(name.length > 0, node.outerHTML.slice(0, 80));
      }
    } finally {
      view.unmount();
    }
  });
});
