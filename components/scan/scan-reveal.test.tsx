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
      const turning = view.host.querySelector<HTMLElement>("[data-turning]");
      assert.equal(turning?.dataset.turning, "both-sides");
      assert.match(turning?.className ?? "", /motion-safe:animate-\[reveal-turn/);
      assert.equal(view.host.querySelectorAll('[data-reveal="scan-card"] img').length, 2, "front and back");
      // Reduced motion: no turning at all (motion-safe only).
      assert.doesNotMatch(turning?.className ?? "", /(^|\s)animate-\[/);
    } finally {
      view.unmount();
    }
  });

  it("flips the card in once; it stops turning and rests once the card is read", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO);
    try {
      const card = view.host.querySelector('[data-reveal="scan-card"] > div');
      assert.equal(view.host.querySelector<HTMLElement>("[data-turning]")?.dataset.turning, "tilt");
      await view.update({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
      assert.equal(view.host.querySelector('[data-reveal="scan-card"] > div'), card, "the same card: it never flips twice");
      assert.equal(view.host.querySelector<HTMLElement>("[data-turning]")?.dataset.turning, "rest");
    } finally {
      view.unmount();
    }
  });

  it("Player, Year, Set, Number and Parallel fill in as each is found, each on its own beat", async () => {
    const view = await mount({ kind: "matching", found: { player: "Luka Doncic" } }, fixtures.PREVIEW_PHOTO);
    try {
      const labels = [...view.host.querySelectorAll('[data-reveal="fields"] dt')].map((node) => node.textContent);
      assert.deepEqual(labels, ["Player", "Year", "Set", "Number", "Parallel"]);
      assert.equal(view.host.querySelectorAll('[data-reveal="fields"] [data-found]').length, 1);
      await view.update({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
      const found = [...view.host.querySelectorAll<HTMLElement>('[data-reveal="fields"] [data-found]')];
      assert.deepEqual(
        found.map((node) => node.textContent),
        [fixtures.PREVIEW_SLAB.playerName, fixtures.PREVIEW_SLAB.yearLabel, fixtures.PREVIEW_SLAB.setBrand, `#${fixtures.PREVIEW_SLAB.cardNumber}`, "Silver"],
      );
      assert.deepEqual(
        found.map((node) => Number.parseInt(node.style.animationDelay, 10)),
        [0, 130, 260, 390, 520],
      );
      for (const node of found) {
        assert.match(node.className, /motion-safe:animate-\[name-fill-in/);
        assert.match(node.className, /motion-reduce:animate-\[add-fade/, "a fade under reduced motion");
      }
    } finally {
      view.unmount();
    }
  });

  it("a field nothing found says so plainly once the read is done, never a guess", async () => {
    const view = await mount({ kind: "ready", matches: [{ ...fixtures.PREVIEW_RAW[0], parallel: "" }] });
    try {
      const parallel = view.host.querySelector('[data-field="parallel"] dd');
      assert.equal(parallel?.textContent, "Not sure yet");
    } finally {
      view.unmount();
    }
  });

  it("turns only with motion allowed, with transform-only keyframes", () => {
    const reveal = read("components/scan/scan-reveal.tsx");
    assert.match(reveal, /motion-safe:animate-\[reveal-turn/);
    assert.match(reveal, /motion-safe:animate-\[reveal-tilt/);
    assert.match(reveal, /motion-safe:animate-\[card-flip-in[^"]*motion-reduce:animate-\[add-fade/);
    const css = read("app/globals.css");
    for (const name of ["reveal-turn", "reveal-tilt", "card-flip-in", "name-fill-in"]) assert.match(css, new RegExp(`@keyframes ${name}`));
    const turn = css.slice(css.indexOf("@keyframes reveal-turn"), css.indexOf("@keyframes card-flip-in"));
    assert.doesNotMatch(turn, /width|height|top:|left:|margin|blur/, "transform only");
  });

  it("the native camera draws purple corner guides, and the shutter is the only way to take a picture", () => {
    const camera = read("ios-app/ios/App/App/CardScannerViewController.swift");
    assert.match(camera, /final class CardGuideView/);
    assert.match(camera, /static let purple = UIColor\(red: 124 \/ 255, green: 58 \/ 255, blue: 237 \/ 255/);
    // Taken only from shutterTapped (and the photo picker): never from the live frames.
    assert.equal((camera.match(/capturePhoto\(/g) ?? []).length, 1);
    assert.match(camera, /@objc private func shutterTapped\(\) \{\s*capture\(\)/);
    assert.doesNotMatch(camera, /auto-?capture/i);
    assert.match(camera, /case flip = "Now flip it over"/);
  });
});
