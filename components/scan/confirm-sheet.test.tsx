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

type Props = {
  photo: string | null;
  state: ConfirmSheetState;
  onConfirm: (match: ScanMatch, options: { save: boolean }) => void;
  onStepByStep: () => void;
  onRetake: () => void;
  onClose: () => void;
};

let ConfirmSheet: ComponentType<Props>;
let fixtures: typeof import("@/lib/scan/preview-fixtures");

before(async () => {
  ({ ConfirmSheet } = await import("./confirm-sheet"));
  fixtures = await import("@/lib/scan/preview-fixtures");
});

after(() => win.close());

type Calls = { confirmed: ScanMatch[]; saves: boolean[]; stepByStep: number; retake: number; close: number };

async function mount(state: ConfirmSheetState, photo: string | null = null, pick: number | null = 0) {
  const calls: Calls = { confirmed: [], saves: [], stepByStep: 0, retake: 0, close: 0 };
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(ConfirmSheet, {
        photo,
        state,
        onConfirm: (match, options) => {
          calls.confirmed.push(match);
          calls.saves.push(options.save);
        },
        onStepByStep: () => {
          calls.stepByStep += 1;
        },
        onRetake: () => {
          calls.retake += 1;
        },
        onClose: () => {
          calls.close += 1;
        },
      }),
    );
  });
  // "Pick your card": the price screen is one tap on a row. Most tests price the first one.
  if (pick != null) await pickRow(host, pick);
  return {
    calls,
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Taps a row of "Pick your card", when the list shows. */
async function pickRow(host: HTMLElement, index: number) {
  const row = host.querySelectorAll<HTMLButtonElement>('[data-pick="list"] button')[index];
  if (!row) return;
  await act(async () => {
    row.click();
  });
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

describe("ConfirmSheet", () => {
  it("is a labelled dialog: 'Pick your card' lists the top matches, most likely first, with set, # and parallel", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW }, fixtures.PREVIEW_PHOTO, null);
    try {
      const dialog = win.document.querySelector('[role="dialog"]');
      assert.ok(dialog);
      const title = win.document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
      assert.equal(title?.textContent, "Pick your card");
      const rows = [...view.host.querySelectorAll<HTMLButtonElement>('[data-pick="list"] button')];
      assert.equal(rows.length, fixtures.PREVIEW_RAW.length);
      assert.match(rows[0].textContent ?? "", /^Most likely/);
      fixtures.PREVIEW_RAW.forEach((match, index) => {
        const row = rows[index].textContent ?? "";
        assert.ok(row.includes(match.playerName), row);
        assert.ok(row.includes(`${match.setBrand}`) && (!match.cardNumber || row.includes(`#${match.cardNumber}`)), row);
        assert.ok(row.includes(match.parallel || "Parallel open"), row);
      });
      // Nothing is added from the list: a row is one tap from its price.
      assert.equal(text().includes("Add to collection"), false);
      assert.equal(view.calls.confirmed.length, 0);
    } finally {
      view.unmount();
    }
  });

  it("one tap on a row opens that card's price screen with a big Add to collection; Pick another comes back", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW }, null, 1);
    try {
      const title = win.document.getElementById(win.document.querySelector('[role="dialog"]')?.getAttribute("aria-labelledby") ?? "");
      assert.equal(title?.textContent, "Your card");
      assert.ok(text().includes(fixtures.PREVIEW_RAW[1].setBrand));
      assert.equal(view.host.querySelector('[data-pick="list"]'), null);
      await click(button("Not this one? Pick another"));
      assert.ok(view.host.querySelector('[data-pick="list"]'), "back on the list");
      await pickRow(view.host, 1);
      await click(button("Add to collection"));
      assert.equal(view.calls.confirmed[0]?.setBrand, fixtures.PREVIEW_RAW[1].setBrand);
      assert.deepEqual(view.calls.saves, [false], "the parallel is still open, so Add card asks");
    } finally {
      view.unmount();
    }
  });

  it("a slab's price screen shows its grade and only the last 4 of its cert, and adds it in one tap", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] }, fixtures.PREVIEW_PHOTO);
    try {
      assert.ok(text().includes("PSA 10"));
      assert.ok(text().includes("••••0000"));
      assert.equal(text().includes("00000000"), false, "the full cert is never shown");
      assert.equal(button("Silver").getAttribute("aria-pressed"), "true");
      await click(button("Add to collection"));
      assert.equal(view.calls.confirmed[0]?.parallel, "Silver");
      assert.equal(view.calls.confirmed[0]?.grade?.certNumber, "00000000");
      assert.deepEqual(view.calls.saves, [true]);
    } finally {
      view.unmount();
    }
  });

  it("one tap picks an open parallel on the price screen", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW });
    try {
      await click(button("Silver"));
      assert.equal(button("Silver").getAttribute("aria-pressed"), "true");
      await click(button("Add to collection"));
      assert.equal(view.calls.confirmed[0]?.parallel, "Silver");
    } finally {
      view.unmount();
    }
  });

  it("while reading: the card turns between the front and back photos, fields fill in as found, never a spinner", async () => {
    const view = await mount({ kind: "matching", found: { player: "Cameron Boozer", number: "#RC-3" } }, fixtures.PREVIEW_PHOTO);
    try {
      assert.equal(win.document.querySelector('[role="dialog"]')?.getAttribute("aria-busy"), "true");
      assert.ok(text().includes("Reading your card"));
      assert.equal(win.document.querySelector(".animate-spin"), null);
      const found = [...view.host.querySelectorAll('[data-reveal="fields"] [data-found]')].map((node) => node.textContent);
      assert.deepEqual(found, ["Cameron Boozer", "#RC-3"]);
      // Year, set and parallel wait as skeletons.
      assert.equal(view.host.querySelectorAll('[data-reveal="fields"] .skeleton-shimmer').length, 3);
      assert.equal(view.host.querySelector("[data-turning]")?.getAttribute("data-turning"), "tilt", "only a front: it tilts");
    } finally {
      view.unmount();
    }
  });

  it("offers step by step and retake when nothing matched, with an offline note", async () => {
    const view = await mount({ kind: "none", offline: true });
    try {
      assert.ok(text().includes("We couldn't find this one yet"));
      assert.ok(text().includes("You're offline"));
      await click(button("Add it step by step"));
      await click(button("Retake"));
      assert.equal(view.calls.stepByStep, 1);
      assert.equal(view.calls.retake, 1);
    } finally {
      view.unmount();
    }
  });

  it("closes on Escape and from the close button", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
    try {
      await act(async () => {
        win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
      });
      const close = [...win.document.querySelectorAll('button[aria-label="Close"]')].find(
        (node) => node.getAttribute("tabindex") !== "-1",
      ) as HTMLButtonElement;
      await click(close);
      assert.equal(view.calls.close, 2);
    } finally {
      view.unmount();
    }
  });

  it("gives every button an accessible name", async () => {
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

describe("ConfirmSheet: last eBay solds", () => {
  it("shows the card first and says it's looking up last solds", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS_LOOKING });
    try {
      assert.ok(text().includes("Luka Doncic"), "the identity is there right away");
      assert.ok(text().includes("Looking up last solds…"));
      assert.equal(/\$\d/.test(text()), false);
    } finally {
      view.unmount();
    }
  });

  it("2 sales more than 10x apart: no value, 'Not enough recent sales for a value yet'", async () => {
    const solds = {
      status: "done" as const,
      comp: {
        status: "ok" as const,
        sales: [{ priceCents: 14000, soldAt: "2026-11-12T12:00:00Z" }, { priceCents: 60, soldAt: "2026-11-12T10:00:00Z" }],
        nSales: 2,
        medianCents: null,
        lowCents: null,
        highCents: null,
        trend: null,
        asOf: null,
        source: "live" as const,
        parallel: "Base",
        unclean: true,
      },
      query: "q",
    };
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds });
    try {
      // The price screen (Quick Comp style): no value from sales this far apart, said plainly.
      assert.ok(text().includes("Not enough recent sales for a value yet"));
      assert.doesNotMatch(text(), /Value\$/);
    } finally {
      view.unmount();
    }
  });

  it("then shows the value and the last sales, via Trawl", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS });
    try {
      assert.ok(text().includes("Last sales"));
      assert.ok(text().includes("$1,100.00"), "the newest sale");
      assert.ok(text().includes("Recent sold prices via Trawl"));
    } finally {
      view.unmount();
    }
  });

  it("says plainly when the search found nothing, or the day's lookups are used, with no price", async () => {
    for (const [solds, message] of [
      [fixtures.PREVIEW_SOLDS_NONE, "No sales yet"],
      [fixtures.PREVIEW_SOLDS_LIMITED, "You've used today's comps. Saved ones still open"],
    ] as const) {
      const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds });
      try {
        assert.ok(text().includes(message), message);
        assert.equal(/\$\d/.test(text()), false);
        assert.equal(/add it to your collection|we'll price it/i.test(text()), false);
      } finally {
        view.unmount();
      }
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

  it("the confirm sheet shows 2024 Bowman #BP-27 and 137/299, never CMPO73107, Topps or a guessed color", async () => {
    const view = await mount({ kind: "ready", matches: await millerMatches() });
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

  it("the confirm sheet shows #BP-27 and 137/299, and never CMPO73107 or Topps, even in an attribute", async () => {
    const view = await mount({ kind: "ready", matches: await messyMatches() });
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

  it("the confirm sheet shows 2024 Bowman #BP-27 and 137/299, never FOR-4, even in an attribute", async () => {
    const view = await mount({ kind: "ready", matches: await bioMatches() });
    try {
      assert.ok(text().includes("2024 Bowman #BP-27"));
      assert.ok(text().includes("137/299"));
      const html = win.document.body.innerHTML;
      assert.equal(/FOR-4|CMPO73107|Topps/i.test(html), false);
    } finally {
      view.unmount();
    }
  });
});
