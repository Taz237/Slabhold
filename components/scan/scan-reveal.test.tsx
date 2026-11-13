import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function mount(state: ConfirmSheetState, photo: string | null = null) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const props = (next: ConfirmSheetState): Props => ({
    photo,
    state: next,
    onConfirm() {},
    onStepByStep() {},
    onRetake() {},
    onClose() {},
  });
  await act(async () => {
    root.render(createElement(ConfirmSheet, props(state)));
  });
  return {
    host,
    async update(next: ConfirmSheetState) {
      await act(async () => {
        root.render(createElement(ConfirmSheet, props(next)));
      });
    },
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("scan reveal", () => {
  it("is a full scene over a blurred, dimmed camera, with the card leading and a small title", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO);
    try {
      const backdrop = view.host.querySelector('button[tabindex="-1"]');
      assert.match(backdrop?.className ?? "", /backdrop-blur-xl/);
      const dialog = view.host.querySelector('[role="dialog"]')!;
      assert.match(dialog.className, /max-h-\[94dvh\]/);
      const title = win.document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
      assert.match(title?.className ?? "", /text-13/);
      assert.ok(view.host.querySelector('[data-reveal="scan-card"] img'), "the photo, big");
    } finally {
      view.unmount();
    }
  });

  it("flips the card in once, and fills the name in under it while the lookup runs", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO);
    try {
      const card = view.host.querySelector('[data-reveal="scan-card"] > div');
      assert.ok(view.host.querySelector('[data-reveal="name-skeleton"]'), "lines wait as skeletons");
      assert.equal(view.host.querySelector('[data-reveal="name"]'), null);
      await view.update({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
      assert.equal(view.host.querySelector('[data-reveal="scan-card"] > div'), card, "the same card: it never flips twice");
      assert.equal(view.host.querySelector('[data-reveal="name-skeleton"]'), null);
      assert.ok(view.host.querySelector('[data-reveal="name"]'));
    } finally {
      view.unmount();
    }
  });

  it("fills in player, then year and set, then number, then parallel, each a beat later", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] }, fixtures.PREVIEW_PHOTO);
    try {
      const stages = [...view.host.querySelectorAll<HTMLElement>("[data-stage]")];
      assert.deepEqual(
        stages.map((node) => node.dataset.stage),
        ["player", "set", "number", "parallel", "tags"],
      );
      const delays = stages.map((node) => Number.parseInt(node.style.animationDelay, 10));
      assert.deepEqual(delays, [0, 130, 260, 390, 520]);
      assert.equal(stages[0].textContent, fixtures.PREVIEW_SLAB.playerName);
      assert.equal(stages[3].textContent, "Silver");
      for (const node of stages) {
        assert.match(node.className, /motion-safe:animate-\[name-fill-in/);
        assert.match(node.className, /motion-reduce:animate-\[add-fade/, "a fade under reduced motion");
      }
    } finally {
      view.unmount();
    }
  });

  it("shows no parallel stage until one is picked", async () => {
    const view = await mount({ kind: "ready", matches: fixtures.PREVIEW_RAW });
    try {
      assert.equal(view.host.querySelector('[data-stage="parallel"]'), null);
    } finally {
      view.unmount();
    }
  });

  it("flips only with motion allowed, and adds no outline or guide box over the card", () => {
    const parts = read("components/scan/sheet-parts.tsx");
    assert.match(parts, /motion-safe:animate-\[card-flip-in[^"]*motion-reduce:animate-\[add-fade/);
    const css = read("app/globals.css");
    assert.match(css, /@keyframes card-flip-in/);
    assert.match(css, /@keyframes name-fill-in/);
    const reveal = parts.slice(parts.indexOf("export function RevealCard"), parts.indexOf("export function RevealNameSkeleton"));
    assert.doesNotMatch(reveal, /border-dashed|border-violet|ring-violet|outline-violet/);
    // The native camera draws nothing over the live picture either.
    assert.match(read("ios-app/ios/App/App/CardScannerViewController.swift"), /no outline, no guide box/);
  });
});
