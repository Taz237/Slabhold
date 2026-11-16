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
      assert.match(view.host.textContent ?? "", /Which version\?/);
      assert.match(view.host.textContent ?? "", /Pick the version to see its sold prices/);
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
      assert.match(view.host.textContent ?? "", /Which version\?/);
      assert.match(view.host.textContent ?? "", /Pick the version to see its sold prices/);
      await act(async () => view.chip("Refractor")!.click());
      assert.deepEqual(view.calls.versions, ["Refractor"]);
    } finally {
      view.unmount();
    }
  });

  it("'Something else' picks no version: nothing is read again", async () => {
    const view = await mount("confirm", { kind: "ready", matches: [fixtures.PREVIEW_SLAB_VERSION], solds: WAITING });
    try {
      await act(async () => view.chip("Something else")!.click());
      assert.deepEqual(view.calls.versions, []);
    } finally {
      view.unmount();
    }
  });

  it("a slab whose label named its parallel never asks", async () => {
    const view = await mount("confirm", { kind: "ready", matches: [fixtures.PREVIEW_SLAB], solds: fixtures.PREVIEW_SOLDS });
    try {
      assert.doesNotMatch(view.host.textContent ?? "", /Which version\?|Pick the version/);
      assert.deepEqual(view.calls.versions, []);
    } finally {
      view.unmount();
    }
  });
});
