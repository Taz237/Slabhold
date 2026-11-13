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
  lookup: (identity: QuickCompIdentity, options?: { serialRun?: number | null }) => Promise<ScanCompResult>;
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

type Calls = { lookups: QuickCompIdentity[]; runs: (number | null | undefined)[]; added: ScanMatch[]; saves: boolean[]; next: number; search: number };

async function mount(state: ConfirmSheetState, lookup?: Props["lookup"]) {
  const calls: Calls = { lookups: [], runs: [], added: [], saves: [], next: 0, search: 0 };
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(CompSheet, {
        photo: null,
        state,
        lookup: async (identity, options) => {
          calls.lookups.push(identity);
          calls.runs.push(options?.serialRun);
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

  it("sends the card's print run, so cached /199 sales of that card count", async () => {
    const numbered = { ...fixtures.PREVIEW_SLAB, serialRun: 199, serialNo: "88" };
    const view = await mount({ kind: "ready", matches: [numbered] });
    try {
      await waitFor(() => view.calls.lookups.length > 0);
      assert.equal(view.calls.runs[0], 199);
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
      await waitFor(() => text().includes("No recent sales for this one yet"));
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

describe("CompSheet: the scan's live eBay search", () => {
  it("says it's looking up last solds and doesn't look up the same card twice", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS_LOOKING });
    try {
      assert.ok(text().includes("Luka Doncic"));
      assert.ok(text().includes("Looking up last solds…"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(view.calls.lookups.length, 0, "the scan's own search is already running");
    } finally {
      view.unmount();
    }
  });

  it("shows the scan's last solds with no second lookup", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS });
    try {
      await waitFor(() => text().includes("Based on 6 sales"));
      assert.equal(view.calls.lookups.length, 0);
    } finally {
      view.unmount();
    }
  });

  it("a cap shows the Quick Comp message and no price", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS_LIMITED });
    try {
      await waitFor(() => text().includes("You've used today's comps. Saved ones still open"));
      assert.equal(/\$\d/.test(text()), false);
    } finally {
      view.unmount();
    }
  });

  it("after a search that found nothing, says so plainly", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS_NONE });
    try {
      await waitFor(() => text().includes("No recent eBay sales found for this card"));
      assert.ok(text().includes("We looked at eBay sales from the last 90 days."));
    } finally {
      view.unmount();
    }
  });
});

describe("Aidan Miller from Donnie's phone, front and back", () => {
  async function millerMatches() {
    const [{ INDEXED_DIRECTORY }, { rankScanMatches }, { scanReadFrom }] = await Promise.all([
      import("@/lib/players/directory"),
      import("@/lib/scan/match"),
      import("@/lib/scan/session"),
    ]);
    const read = scanReadFrom(
      {
        lines: ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"],
        backLines: ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."],
        image: null,
        kind: "card",
      },
      INDEXED_DIRECTORY,
    );
    const sku = {
      id: "CMPO73107",
      playerName: "Aidan Miller",
      yearLabel: "2024",
      setBrand: "Topps",
      cardNumber: "CMPO73107",
      sport: "Baseball",
      parallel: "Base",
      isRookie: false,
    };
    return rankScanMatches(read, [sku], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
  }

  it("the comp sheet shows 2024 Bowman #BP-27 and 137/299, never CMPO73107, Topps or a guessed color", async () => {
    const view = await mount({ kind: "ready", matches: await millerMatches() }, async () => ({ status: "none" as const }));
    try {
      const shown = text();
      assert.ok(shown.includes("Aidan Miller"));
      assert.ok(shown.includes("2024 Bowman #BP-27"));
      assert.ok(shown.includes("137/299"), "the print run read from the front");
      assert.equal(/CMPO73107|Topps/.test(shown), false);
      for (const guess of ["Silver", "Refractor", "Gold", "Green"]) assert.equal(shown.includes(guess), false, guess);
      assert.equal(win.document.body.innerHTML.includes("CMPO73107"), false, "not even in an attribute");
    } finally {
      view.unmount();
    }
  });
});

describe("Aidan Miller after #244: a factory SKU and a copyright Topps on the back, empty catalog", () => {
  async function messyMatches() {
    const [{ INDEXED_DIRECTORY }, { rankScanMatches }, { scanReadFrom }] = await Promise.all([
      import("@/lib/players/directory"),
      import("@/lib/scan/match"),
      import("@/lib/scan/session"),
    ]);
    const read = scanReadFrom(
      {
        lines: ["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"],
        backLines: ["AIDAN MILLER", "#CMPO73107", "BP-27", "2024 TOPPS"],
        image: null,
        kind: "card",
      },
      INDEXED_DIRECTORY,
    );
    return rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
  }

  it("the comp sheet shows #BP-27 and 137/299, and never CMPO73107 or Topps, even in an attribute", async () => {
    const view = await mount({ kind: "ready", matches: await messyMatches() }, async () => ({ status: "none" as const }));
    try {
      const shown = text();
      assert.ok(shown.includes("Aidan Miller"));
      assert.ok(shown.includes("#BP-27"));
      assert.ok(shown.includes("137/299"));
      const html = win.document.body.innerHTML;
      assert.equal(/CMPO73107/.test(html), false);
      assert.equal(/Topps/.test(html), false);
    } finally {
      view.unmount();
    }
  });
});

describe("Aidan Miller after #245: a bio 'for-4' on the back, empty catalog", () => {
  async function bioMatches() {
    const [{ INDEXED_DIRECTORY }, { rankScanMatches }, { scanReadFrom }] = await Promise.all([
      import("@/lib/players/directory"),
      import("@/lib/scan/match"),
      import("@/lib/scan/session"),
    ]);
    const read = scanReadFrom(
      {
        lines: ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"],
        backLines: ["AIDAN MILLER", "hasn't had to sacrifice his average for-4 power", "BP-27", "2024 TOPPS"],
        image: null,
        kind: "card",
      },
      INDEXED_DIRECTORY,
    );
    return rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
  }

  it("the comp sheet shows 2024 Bowman #BP-27 and 137/299, never FOR-4, even in an attribute", async () => {
    const view = await mount({ kind: "ready", matches: await bioMatches() }, async () => ({ status: "none" as const }));
    try {
      assert.ok(text().includes("2024 Bowman #BP-27"));
      assert.ok(text().includes("137/299"));
      const html = win.document.body.innerHTML;
      assert.equal(/FOR-4|CMPO73107|Topps/i.test(html), false);
    } finally {
      view.unmount();
    }
  });

  it("Fuchsia /299 sales name the value and preselect Fuchsia, never Base", async () => {
    const match = { ...fixtures.PREVIEW_FROM_SALES, parallel: "Fuchsia", parallelOptions: [{ name: "Fuchsia", serialRun: 299 }] };
    const comp = fixtures.PREVIEW_SOLDS_PARALLEL.status === "done" ? fixtures.PREVIEW_SOLDS_PARALLEL.comp : null;
    assert.ok(comp && comp.status === "ok");
    const solds = { status: "done" as const, comp: { ...comp, parallel: "Fuchsia", groups: [{ label: "Fuchsia", nSales: 3 }] }, query: "q" };
    const view = await mount({ kind: "ready", matches: [match], solds });
    try {
      await waitFor(() => text().includes("Value · Fuchsia /299"));
      assert.ok(text().includes("Matched from recent sales. Tap yours if it's different."));
      const pressed = [...win.document.querySelectorAll("button[aria-pressed='true']")].map((node) => node.textContent ?? "");
      assert.ok(pressed.some((label) => label.includes("Fuchsia")), pressed.join(" | "));
      assert.doesNotMatch(text(), /\bBase\b/);
      assert.equal(view.calls.lookups.length, 0);
    } finally {
      view.unmount();
    }
  });

  it("a numbered card whose sales name no color: labelled by its run, never Base, no chip picked", async () => {
    const match = { ...fixtures.PREVIEW_FROM_SALES, parallel: "", parallelSource: undefined, sureness: { ...fixtures.PREVIEW_FROM_SALES.sureness, parallel: "unsure" as const }, parallelOptions: [] };
    const comp = fixtures.PREVIEW_SOLDS_PARALLEL.status === "done" ? fixtures.PREVIEW_SOLDS_PARALLEL.comp : null;
    assert.ok(comp && comp.status === "ok");
    const label = "/299, parallel not named";
    const solds = { status: "done" as const, comp: { ...comp, parallel: label, groups: [{ label, nSales: 3 }] }, query: "q" };
    const view = await mount({ kind: "ready", matches: [match], solds });
    try {
      await waitFor(() => text().includes(`Value · ${label}`));
      assert.doesNotMatch(text(), /\bBase\b/);
      assert.doesNotMatch(text(), /Showing Base/);
      assert.doesNotMatch(text(), /parallel not named \/299/, "the run isn't repeated");
      assert.equal(win.document.querySelectorAll("button[aria-pressed='true']").length, 1, "only the grade chip");
      assert.equal(view.calls.lookups.length, 0);
    } finally {
      view.unmount();
    }
  });

  it("an unnumbered base: Base priced and labelled, 'Showing Base', Silver offered to tap", async () => {
    const match = { ...fixtures.PREVIEW_RAW[0], parallel: "", serialRun: null, serialNo: "", parallelSource: undefined };
    const base = fixtures.PREVIEW_SOLDS_PARALLEL.status === "done" ? fixtures.PREVIEW_SOLDS_PARALLEL.comp : null;
    assert.ok(base && base.status === "ok");
    const groups = [{ label: "Silver", nSales: 10 }, { label: "Base", nSales: 3 }];
    const solds = { status: "done" as const, comp: { ...base, parallel: "Base", groups }, query: "q" };
    const view = await mount({ kind: "ready", matches: [match], solds });
    try {
      await waitFor(() => text().includes("Value · Base"));
      assert.ok(text().includes("Showing Base. Tap your parallel if it's different."));
      assert.doesNotMatch(text(), /Matched from recent sales/);
      assert.ok(text().includes("Other parallels in recent sales"));
      await click(button("Show Silver sales, 10 sales"));
      await waitFor(() => view.calls.lookups.length > 0);
      assert.equal(view.calls.lookups.at(-1)?.parallel, "Silver");
      const pressed = [...win.document.querySelectorAll("button[aria-pressed='true']")].map((node) => node.textContent ?? "");
      assert.ok(pressed.some((label) => label.includes("Silver")), pressed.join(" | "));
    } finally {
      view.unmount();
    }
  });

  it("an unnumbered card with only Silver sales: 'No recent Base sales', never a Base price", async () => {
    const match = { ...fixtures.PREVIEW_RAW[0], parallel: "", serialRun: null, serialNo: "", parallelSource: undefined };
    const solds = {
      status: "done" as const,
      comp: { status: "split" as const, missing: "Base" as const, groups: [{ label: "Silver", nSales: 10, lastPriceCents: 6500, lastSoldAt: "2026-11-12" }] },
      query: "q",
    };
    const view = await mount({ kind: "ready", matches: [match], solds });
    try {
      await waitFor(() => text().includes("No recent Base sales"));
      assert.doesNotMatch(text(), /Value · /);
      assert.ok(button("Show Silver sales, 10 sales"));
    } finally {
      view.unmount();
    }
  });

  it("draws the sales as dots, one per sale, with the range in words; fewer than 3 sales draw none", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS });
    try {
      await waitFor(() => text().includes("Based on 6 sales"));
      const chart = win.document.querySelector("[role='img'][aria-label^='6 sales from']");
      assert.ok(chart, "the chart says what it shows");
      assert.match(chart.getAttribute("aria-label") ?? "", /\$880\.00 to \$1,100\.00$/);
      assert.equal(chart.querySelectorAll("span.rounded-full").length, 6);
    } finally {
      view.unmount();
    }
    const few = await mount({ kind: "ready", matches: [fixtures.PREVIEW_UNNUMBERED], solds: fixtures.PREVIEW_SOLDS_UNCLEAN });
    try {
      await waitFor(() => text().includes("Last sales"));
      assert.equal(win.document.querySelector("[role='img'][aria-label*='sales']"), null);
    } finally {
      few.unmount();
    }
  });
});
