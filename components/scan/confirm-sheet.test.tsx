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

async function mount(state: ConfirmSheetState, photo: string | null = null) {
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

async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

describe("ConfirmSheet", () => {
  it("is a labelled dialog that shows a slab's grade and only the last 4 of its cert", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] }, fixtures.PREVIEW_PHOTO);
    try {
      const dialog = win.document.querySelector('[role="dialog"]');
      assert.ok(dialog);
      const title = win.document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
      assert.equal(title?.textContent, "Is this your card?");
      assert.ok(text().includes("PSA 10"));
      assert.ok(text().includes("••••0000"));
      assert.equal(text().includes("00000000"), false, "the full cert is never shown");
      assert.equal(button("Silver").getAttribute("aria-pressed"), "true");
      await click(button("Yes, add it"));
      assert.equal(view.calls.confirmed[0]?.parallel, "Silver");
      assert.equal(view.calls.confirmed[0]?.grade?.certNumber, "00000000");
      assert.deepEqual(view.calls.saves, [true]);
    } finally {
      view.unmount();
    }
  });

  it("leaves an open parallel unpicked, and one tap picks it", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW });
    try {
      assert.ok(text().includes("Pick the parallel"));
      assert.equal(button("Silver").getAttribute("aria-pressed"), "false");
      await click(button("Silver"));
      assert.equal(button("Silver").getAttribute("aria-pressed"), "true");
      await click(button("Yes, add it"));
      assert.equal(view.calls.confirmed[0]?.parallel, "Silver");
      assert.equal(view.calls.confirmed[0]?.sureness.parallel, "sure");
      assert.deepEqual(view.calls.saves, [true]);
    } finally {
      view.unmount();
    }
  });

  it("asks for the serial number on a numbered parallel and checks it", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW });
    try {
      await click(button("Purple, numbered to 99"));
      const input = win.document.querySelector<HTMLInputElement>('input[aria-label="Your number, out of 99"]');
      assert.ok(input);
      await type(input, "120");
      await click(button("Yes, add it"));
      assert.equal(view.calls.confirmed.length, 0);
      assert.ok(text().includes("Your number must be between 1 and 99."));
      await type(input, "12");
      await click(button("Yes, add it"));
      assert.equal(view.calls.confirmed[0]?.serialRun, 99);
      assert.equal(view.calls.confirmed[0]?.serialNo, "12");
    } finally {
      view.unmount();
    }
  });

  it("makes another row the top match in one tap", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW });
    try {
      assert.ok(text().includes("Or one of these"));
      const select = [...win.document.querySelectorAll("li button")].find((node) =>
        node.textContent?.includes("Panini Select"),
      ) as HTMLButtonElement;
      await click(select);
      await click(button("Yes, that's it"));
      assert.equal(view.calls.confirmed[0]?.setBrand, "Panini Select");
      assert.deepEqual(view.calls.saves, [false], "the parallel is still open, so Add card asks");
    } finally {
      view.unmount();
    }
  });

  it("lets Something else leave the parallel to Add card", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
    try {
      await click(button("Something else"));
      assert.equal(button("Something else").getAttribute("aria-pressed"), "true");
      assert.equal(text().includes("Yes, add it"), false);
      await click(button("Yes, that's it"));
      assert.equal(view.calls.confirmed[0]?.parallel, "");
      assert.deepEqual(view.calls.saves, [false]);
    } finally {
      view.unmount();
    }
  });

  it("offers Edit details next to the one-tap add, which opens Add card instead", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
    try {
      await click(button("Edit details"));
      assert.deepEqual(view.calls.saves, [false]);
      assert.equal(view.calls.confirmed[0]?.parallel, "Silver");
    } finally {
      view.unmount();
    }
  });

  it("shows skeletons, never a spinner, while matching", async () => {
    const view = await mount({ kind: "matching" });
    try {
      assert.equal(win.document.querySelector('[role="dialog"]')?.getAttribute("aria-busy"), "true");
      assert.ok(text().includes("Finding your card"));
      assert.equal(win.document.querySelector(".animate-spin"), null);
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

  it("2 sales more than 10x apart: no last sold, 'Not enough clean sales yet'", async () => {
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
      assert.ok(text().includes("Not enough clean sales yet"));
      assert.doesNotMatch(text(), /Last sold/);
      assert.doesNotMatch(text(), /\$140\.00|\$0\.60/);
    } finally {
      view.unmount();
    }
  });

  it("then shows the last sold, via Trawl", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS });
    try {
      assert.ok(text().includes("Last sold"));
      assert.ok(text().includes("$1,100.00"), "the newest sale");
      assert.ok(text().includes("Recent sold prices via Trawl"));
    } finally {
      view.unmount();
    }
  });

  it("says plainly when the search found nothing, or the day's lookups are used, with no price", async () => {
    for (const [solds, message] of [
      [fixtures.PREVIEW_SOLDS_NONE, "No recent eBay sales found for this card"],
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
