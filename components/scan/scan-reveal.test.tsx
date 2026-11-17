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
  backPhoto?: string | null;
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

async function mount(state: ConfirmSheetState, photo: string | null = null, backPhoto: string | null = null) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const props = (next: ConfirmSheetState): Props => ({
    photo,
    backPhoto,
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

  it("never a blank screen: the card turns between the collector's front and back photos while it is read", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO, fixtures.PREVIEW_PHOTO);
    try {
      const card = view.host.querySelector<HTMLElement>("[data-motion]");
      assert.equal(card?.dataset.motion, "reading");
      assert.match(card?.className ?? "", /motion-safe:animate-\[reveal-turn/);
      assert.equal(view.host.querySelectorAll('[data-reveal="scan-card"] img').length, 2, "front and back");
      assert.doesNotMatch(card?.className ?? "", /(^|\s)animate-\[/, "nothing turns under reduced motion");
      // A caret waits on the label while the card is read.
      assert.match(view.host.querySelector('[data-reveal="label"]')?.textContent ?? "", /Reading your card/);
    } finally {
      view.unmount();
    }
  });

  it("once read, the card spins from its back to its front with a glare sweep, flipped in only once", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO, fixtures.PREVIEW_PHOTO);
    try {
      const card = view.host.querySelector('[data-reveal="scan-card"] > div');
      await view.update({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
      assert.equal(view.host.querySelector('[data-reveal="scan-card"] > div'), card, "the same card: it never flips in twice");
      const spinning = view.host.querySelector<HTMLElement>("[data-motion]");
      assert.equal(spinning?.dataset.motion, "landing");
      assert.match(spinning?.className ?? "", /motion-safe:animate-\[reveal-land_/);
      assert.match(view.host.querySelector("[data-glare]")?.className ?? "", /motion-safe:animate-\[reveal-glare/);
    } finally {
      view.unmount();
    }
  });

  it("a slab's label types its cert, then player, year, set, number, grade and parallel, line by line", async () => {
    const view = await mount({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] }, fixtures.PREVIEW_PHOTO);
    try {
      const lines = [...view.host.querySelectorAll<HTMLElement>("[data-line]")];
      assert.deepEqual(
        lines.map((node) => node.dataset.line),
        ["cert", "player", "year", "set", "number", "grade", "parallel"],
      );
      assert.equal(lines[0].textContent, "Cert ••••0000");
      const delays = lines.map((node) => Number.parseInt((node.firstElementChild as HTMLElement).style.getPropertyValue("--type-delay"), 10));
      for (let index = 1; index < delays.length; index += 1) assert.ok(delays[index] > delays[index - 1], "one line after another");
      for (const node of lines) {
        const typed = node.firstElementChild as HTMLElement;
        assert.match(typed.className, /motion-safe:animate-\[reveal-type/);
        assert.match(typed.className, /motion-reduce:animate-\[add-fade/, "no typing under reduced motion");
      }
    } finally {
      view.unmount();
    }
  });

  it("a raw card's label types year, set, number, player, then the parallel, and an open one says so", async () => {
    const view = await mount({ kind: "ready", matches: [{ ...fixtures.PREVIEW_RAW[0], parallel: "" }] });
    try {
      const lines = [...view.host.querySelectorAll<HTMLElement>("[data-line]")];
      assert.deepEqual(
        lines.map((node) => node.dataset.line),
        ["year", "set", "number", "player", "parallel"],
      );
      assert.equal(lines.at(-1)?.textContent, "Version not read yet");
    } finally {
      view.unmount();
    }
  });

  it("spins and types only with motion allowed, with keyframes that never resize anything", () => {
    const reveal = read("components/scan/scan-reveal.tsx");
    for (const name of ["reveal-turn", "reveal-tilt", "reveal-land", "reveal-glare", "reveal-type"]) assert.match(reveal, new RegExp(`motion-safe:animate-\\[${name}`));
    const css = read("app/globals.css");
    for (const name of ["reveal-turn", "reveal-tilt", "reveal-land", "reveal-glare", "reveal-type", "card-flip-in", "added-pop"]) assert.match(css, new RegExp(`@keyframes ${name}`));
    const motion = css.slice(css.indexOf("@keyframes added-pop"), css.indexOf("@keyframes card-flip-in"));
    assert.doesNotMatch(motion, /width|height|top:|left:|margin|blur/, "transform, opacity and clip only");
  });

  it("the native camera draws purple corner guides, and the shutter is the only way to take a picture", () => {
    const camera = read("ios-app/ios/App/App/CardScannerViewController.swift");
    assert.match(camera, /final class CardGuideView/);
    assert.match(camera, /static let purple = UIColor\(red: 124 \/ 255, green: 58 \/ 255, blue: 237 \/ 255/);
    assert.equal((camera.match(/capturePhoto\(/g) ?? []).length, 1);
    assert.match(camera, /@objc private func shutterTapped\(\) \{\s*capture\(\)/);
    assert.doesNotMatch(camera, /auto-?capture/i);
    assert.match(camera, /case flip = "Now flip it over"/);
  });
});
