import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType } from "react";
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

/* eslint-disable @typescript-eslint/no-explicit-any */
let CompSheet: ComponentType<any>;
let ConfirmSheet: ComponentType<any>;
let fixtures: typeof import("@/lib/scan/preview-fixtures");

before(async () => {
  ({ CompSheet } = await import("./comp-sheet"));
  ({ ConfirmSheet } = await import("./confirm-sheet"));
  fixtures = await import("@/lib/scan/preview-fixtures");
});

after(() => win.close());

const WAITING = { status: "done", comp: { status: "version" }, query: null } as const;

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

async function mount(sheet: "comp" | "confirm", state: ConfirmSheetState) {
  const calls = { versions: [] as string[], lookups: 0 };
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const shared = { photo: null, state, onClose: () => {}, onVersion: (name: string) => calls.versions.push(name) };
  await act(async () => {
    root.render(
      sheet === "comp"
        ? createElement(CompSheet, {
            ...shared,
            lookup: async () => {
              calls.lookups += 1;
              return { status: "none" };
            },
            onAdd: () => {},
            onScanAnother: () => {},
            onSearch: () => {},
          })
        : createElement(ConfirmSheet, { ...shared, onConfirm: () => {}, onStepByStep: () => {}, onRetake: () => {} }),
    );
  });
  await pickFirst(host);
  const chip = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === name || button.textContent?.trim() === name);
  return {
    host,
    calls,
    chip,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("a slab waiting on its version", () => {
  it("scan to comp: asks which version, prices nothing, looks nothing up, and never marks Base", async () => {
    const view = await mount("comp", { kind: "ready", matches: [fixtures.PREVIEW_SLAB_VERSION], solds: WAITING });
    try {
      assert.match(view.host.textContent ?? "", /Pick your version/);
      assert.doesNotMatch(view.host.textContent ?? "", /\$\d/);
      assert.equal(view.calls.lookups, 0);
      assert.notEqual(view.chip("Base")?.getAttribute("aria-pressed"), "true");
      assert.deepEqual(view.calls.versions, []);
      await act(async () => view.chip("X-Fractor")!.click());
      assert.deepEqual(view.calls.versions, ["X-Fractor"]);
      // The sales come from reading the slab again as that version, never from a cached Base lookup.
      assert.equal(view.calls.lookups, 0);
    } finally {
      view.unmount();
    }
  });

  it("scan to add: the same ask on the sold line, and the pick is read as the version", async () => {
    const view = await mount("confirm", { kind: "ready", matches: [fixtures.PREVIEW_SLAB_VERSION], solds: WAITING });
    try {
      assert.match(view.host.textContent ?? "", /Pick your version/);
      await act(async () => view.chip("Refractor")!.click());
      assert.deepEqual(view.calls.versions, ["Refractor"]);
    } finally {
      view.unmount();
    }
  });

  it("a slab whose label named its parallel never asks", async () => {
    const view = await mount("confirm", { kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS });
    try {
      assert.doesNotMatch(view.host.textContent ?? "", /Which version\?|Pick the version|Pick your version/);
      assert.deepEqual(view.calls.versions, []);
    } finally {
      view.unmount();
    }
  });
});

describe("Pick your version: a patch auto whose serial didn't read (the LaPorta First Impressions #131)", () => {
  it("lists every version on the checklist with its print run, the /10 included; sold ones first with their price, the rest 'No recent sales'; nothing preselected", async () => {
    const view = await mount("confirm", { kind: "ready", matches: [fixtures.PREVIEW_VERSIONS], solds: fixtures.PREVIEW_SOLDS_VERSIONS });
    try {
      const list = view.host.querySelector<HTMLElement>('[data-slot="pick-version"]');
      assert.ok(list);
      assert.match(list.textContent ?? "", /^Pick your version/);
      const rows = [...list.querySelectorAll<HTMLButtonElement>("button[data-version]")];
      assert.deepEqual(
        rows.map((row) => row.getAttribute("aria-label")),
        [
          // On an insert the plain version reads as the insert, never "Base".
          "First Impressions, numbered to 399",
          "Red, numbered to 199",
          "Blue, numbered to 99",
          "Black, numbered to 50",
          "FOTL Black Ice, numbered to 50",
          "Gold, numbered to 25",
          "FOTL Green, numbered to 10",
          "Green, numbered to 10",
          "FOTL Purple, numbered to 1",
          "Purple, numbered to 1",
        ],
      );
      assert.match(rows[0].textContent ?? "", /\/399\s*\$42\.00\s*3 sold/);
      assert.match(rows[1].textContent ?? "", /\/199\s*\$61\.00\s*2 sold/);
      for (const row of rows.slice(2)) assert.match(row.textContent ?? "", /No recent sales$/);
      assert.match(rows[9].textContent ?? "", /1\/1/);
      assert.ok(rows.every((row) => row.getAttribute("aria-pressed") === "false"), "open beats wrong: nothing is picked for them");
      // Rows are real tap targets, and no box of sold groups stands in front of the list.
      assert.ok(rows.every((row) => /min-h-12/.test(row.className)));
      assert.doesNotMatch(view.host.textContent ?? "", /Recent sales name|Show all/);
      assert.equal(view.host.querySelector('[role="group"][aria-label="Parallel"]'), null, "one picker, not two");
      // One tap picks the /10: it reads selected, with its run, and the list gives way to its price.
      await act(async () => rows[7].click());
      assert.equal(view.host.querySelector('[data-slot="pick-version"]'), null);
      const picked = [...view.host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Parallel"] button')].find((chip) => chip.getAttribute("aria-pressed") === "true");
      assert.equal(picked?.getAttribute("aria-label"), "Green, numbered to 10");
    } finally {
      view.unmount();
    }
  });

  it("a serial read as /10: only the /10 versions are listed", async () => {
    const read = { ...fixtures.PREVIEW_VERSIONS, serialRun: 10, serialNo: "03" };
    const view = await mount("confirm", { kind: "ready", matches: [read] });
    try {
      const rows = [...view.host.querySelectorAll<HTMLButtonElement>('[data-slot="pick-version"] button[data-version]')];
      assert.deepEqual(rows.map((row) => row.dataset.version), ["FOTL Green", "Green"]);
    } finally {
      view.unmount();
    }
  });
});
