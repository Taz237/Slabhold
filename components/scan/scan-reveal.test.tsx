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
      // The card is the hero: no label box, no caret, no "Reading" line under it (the sheet's small title says it once).
      assert.equal(view.host.querySelector('[data-reveal="label"]')?.textContent, "");
    } finally {
      view.unmount();
    }
  });

  it("a studio stage: the cropped card on a purple-black vignette with a real shadow and a card's own corners", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO);
    try {
      const stage = view.host.querySelector<HTMLElement>('[data-reveal="scan-card"][data-stage]');
      assert.ok(stage, "the stage");
      assert.match(stage.querySelector("[data-stage-light]")?.className ?? "", /reveal-stage-light/);
      const card = stage.querySelector<HTMLElement>("[data-motion]")!;
      assert.equal(card.dataset.motion, "reading");
      assert.match(card.className, /\[border-radius:3\.5%\/2\.5%\]/, "about 3.5% of the card's width");
      assert.match(card.className, /shadow-\[0_26px_38px/);
      // It snaps in once, crisp, and floats: an object, not a JPG.
      const snap = view.host.querySelector<HTMLElement>('[data-reveal="scan-card"] > div')!;
      assert.match(snap.className, /motion-safe:animate-\[reveal-snap_220ms/);
      assert.match(card.parentElement?.className ?? "", /motion-safe:animate-\[reveal-float/);
      const css = read("app/globals.css");
      assert.match(css.slice(css.indexOf("@keyframes reveal-snap"), css.indexOf("@keyframes reveal-float")), /scale\(0\.92\)/);
      // Purple-black, lighter in the middle. Never teal.
      assert.match(css, /\.reveal-stage-light \{\s*background: radial-gradient\([^;]*#09090b 100%\);/);
    } finally {
      view.unmount();
    }
  });

  it("a wide white band of light crosses the card while it is read, looping, clipped to the card, with a purr on each pass", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO);
    try {
      const glare = view.host.querySelector<HTMLElement>("[data-glare]")!;
      assert.equal(glare.dataset.glare, "reading");
      assert.match(glare.className, /motion-safe:animate-\[reveal-sweep_1400ms[^\]]*_infinite\]/, "900ms across, a short rest, again");
      assert.match(glare.className, /w-\[42%\]/, "about 40% of the card wide");
      assert.match(glare.className, /via-white\/50/, "white light, never a rainbow");
      assert.match(glare.className, /mix-blend-screen/);
      assert.match(glare.parentElement?.className ?? "", /overflow-hidden/, "clipped to the card");
      assert.doesNotMatch(glare.className, /(^|\s)animate-\[/, "no sweep under reduced motion");
      const css = read("app/globals.css");
      const sweep = css.slice(css.indexOf("@keyframes reveal-sweep {"), css.indexOf("@keyframes reveal-sweep-final"));
      assert.match(sweep, /rotate\(22deg\)/);
      // Each pass starts a soft purr; the helper is the one place haptics live.
      const reveal = read("components/scan/scan-reveal.tsx");
      assert.match(reveal, /onAnimationStart=\{onPass\}\s+onAnimationIteration=\{onPass\}/);
      assert.match(reveal, /haptic\("sweep"\)/);
      assert.match(reveal, /haptic\("snap"\)/);
    } finally {
      view.unmount();
    }
  });

  it("with a back photo the stage holds both sides, and turns to the back for one pass of the light", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO, fixtures.PREVIEW_PHOTO);
    try {
      const card = view.host.querySelector<HTMLElement>("[data-motion]")!;
      assert.equal(view.host.querySelectorAll('[data-reveal="scan-card"] img').length, 2, "front and back");
      assert.equal(view.host.querySelectorAll("[data-glare]").length, 2, "the light reads either side");
      assert.equal(card.dataset.side, "front");
      const front = view.host.querySelector<HTMLElement>("[data-glare]")!;
      // jsdom has no AnimationEvent, so React listens for the prefixed name there: whichever it took, one fires.
      const fire = async (name: "Start" | "Iteration") => {
        await act(async () => {
          front.dispatchEvent(new win.Event(`animation${name.toLowerCase()}`, { bubbles: true }));
          front.dispatchEvent(new win.Event(`webkitAnimation${name}`, { bubbles: true }));
        });
      };
      const pass = () => fire("Iteration");
      // Pass 1 starts, then pass 2: at its end the stage turns to the back. Pass 3 crosses the back, then home.
      await fire("Start");
      await pass();
      await act(async () => new Promise((resolve) => setTimeout(resolve, 950)));
      assert.equal(card.dataset.side, "back");
      assert.match(card.className, /motion-safe:\[transform:rotateY\(180deg\)\]/);
      await pass();
      await act(async () => new Promise((resolve) => setTimeout(resolve, 950)));
      assert.equal(card.dataset.side, "front", "one pass on the back, then home for good");
    } finally {
      view.unmount();
    }
    // No back photo: one side, nothing to turn to.
    const single = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO);
    try {
      assert.equal(single.host.querySelectorAll('[data-reveal="scan-card"] img').length, 1);
      assert.equal(single.host.querySelector("[data-both-sides]"), null);
    } finally {
      single.unmount();
    }
  });

  it("only real reads show under the card, one field at a time: nothing before a read, no made-up progress", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO);
    try {
      const fields = view.host.querySelector<HTMLElement>('[data-reveal="label"]')!;
      assert.equal(fields.textContent, "", "nothing is read yet: nothing is shown");
      assert.equal(fields.getAttribute("role"), "status");
      assert.match(fields.className, /min-h-\[4\.75rem\]/, "the space is held: the card never jumps");
      // The phone read the player first.
      await view.update({ kind: "matching", read: { player: "Sam LaPorta" } });
      assert.deepEqual([...fields.querySelectorAll<HTMLElement>("[data-line]")].map((node) => [node.dataset.line, node.textContent]), [["player", "Sam LaPorta"]]);
      const player = fields.querySelector("[data-line='player']");
      // Then the set and the #: the player's line is the same node, so it never fades in twice.
      await view.update({ kind: "matching", read: { player: "Sam LaPorta", set: "2023 Panini Illusions", number: "#131" } });
      assert.equal(fields.querySelector("[data-line='player']"), player);
      assert.deepEqual([...fields.querySelectorAll<HTMLElement>("[data-line]")].map((node) => node.dataset.line), ["player", "set", "number"]);
      for (const node of fields.querySelectorAll<HTMLElement>("[data-line]")) {
        assert.match(node.className, /motion-safe:animate-\[reveal-field_280ms/);
        assert.match(node.className, /motion-reduce:animate-\[add-fade/);
        assert.doesNotMatch(node.className, /whitespace-nowrap|overflow-hidden|truncate|text-ellipsis/, "a long line wraps, never cut off");
      }
      assert.doesNotMatch(view.host.textContent ?? "", /%|Analyzing|Matching|Identifying/i);
    } finally {
      view.unmount();
    }
  });

  it("once matched: the same card (never snapped in twice), a last brighter pass or the first one finished, then it turns and glides to its slot", async () => {
    const view = await mount({ kind: "matching" }, fixtures.PREVIEW_PHOTO, fixtures.PREVIEW_PHOTO);
    try {
      const card = view.host.querySelector('[data-reveal="scan-card"] > div');
      await view.update({ kind: "ready", matches: [fixtures.PREVIEW_SLAB] });
      assert.equal(view.host.querySelector('[data-reveal="scan-card"] > div'), card, "the same card");
      // The match's own fields: player, year and set, then the # and serial.
      assert.deepEqual(
        [...view.host.querySelectorAll<HTMLElement>('[data-reveal="label"] [data-line]')].map((node) => node.dataset.line),
        ["player", "set", "number"],
      );
      // A fast read: the first sweep finishes (it is the only one), then the landing.
      await act(async () => new Promise((resolve) => setTimeout(resolve, 1000)));
      const landing = view.host.querySelector<HTMLElement>("[data-motion]")!;
      assert.equal(landing.dataset.motion, "landing");
      assert.match(landing.className, /motion-safe:animate-\[reveal-land-turn_650ms_cubic-bezier\(0\.65,0,0\.35,1\)/, "ease-in-out, no bounce");
      assert.match(view.host.querySelector('[data-reveal="scan-card"] > div')?.className ?? "", /motion-safe:animate-\[reveal-glide_650ms/);
      assert.equal(view.host.querySelector("[data-glare]"), null, "the light is done");
      // It locks in: the card's sheet takes over, and comes up under the card as one piece.
      await act(async () => new Promise((resolve) => setTimeout(resolve, 800)));
      assert.equal(view.host.querySelector("[data-stage]"), null);
      assert.ok(view.host.querySelector("[data-arrive]"), "the sheet rises once");
      assert.match(view.host.querySelector("[data-arrive]")?.className ?? "", /reveal-sheet-rise_320ms/);
    } finally {
      view.unmount();
    }
  });

  it("the reveal's clock never slows a fast scan: one sweep and the landing, about 1.6s", async () => {
    const { REVEAL_LAND_MS, REVEAL_SWEEP_MS, REVEAL_FINAL_SWEEP_MS, landingDelayMs } = await import("@/lib/scan/reveal");
    // The read was in at once: the rest of the first sweep, then the landing.
    assert.deepEqual(landingDelayMs(0), { finalSweep: false, delayMs: REVEAL_SWEEP_MS });
    assert.deepEqual(landingDelayMs(400), { finalSweep: false, delayMs: 500 });
    assert.ok(REVEAL_SWEEP_MS + REVEAL_LAND_MS <= 1600);
    // A slow read: the sweep kept looping, and the match gets one last brighter pass.
    assert.deepEqual(landingDelayMs(4000), { finalSweep: true, delayMs: REVEAL_FINAL_SWEEP_MS });
    assert.ok(REVEAL_LAND_MS >= 600 && REVEAL_LAND_MS <= 700);
  });

  it("moves only with motion allowed, with keyframes that never resize anything; reduced motion gets a plain fade and only the lock haptic", () => {
    const reveal = read("components/scan/scan-reveal.tsx");
    for (const name of ["reveal-snap", "reveal-float", "reveal-sweep", "reveal-sweep-final", "reveal-glide", "reveal-land-turn", "reveal-field"]) {
      assert.match(reveal, new RegExp(`motion-safe:animate-\\[${name}_`), name);
      assert.doesNotMatch(reveal, new RegExp(`(^|[\\s"\`])animate-\\[${name}`), `${name} never runs under reduced motion`);
    }
    assert.match(reveal, /motion-reduce:animate-\[add-fade_200ms/);
    // The snap is skipped under reduced motion; the sweep's purr rides an animation that never runs there.
    assert.match(reveal, /if \(!stage \|\| !photo \|\| motion !== "reading" \|\| reducedMotion\(\)\) return;\s+haptic\("snap"\)/);
    const steps = read("components/scan/comp-sheet.tsx");
    assert.match(steps, /haptic\(sure \? "lockSure" : "lock"\)/);
    const css = read("app/globals.css");
    for (const name of ["reveal-snap", "reveal-float", "reveal-sweep", "reveal-sweep-final", "reveal-glide", "reveal-land-turn", "reveal-stage-out", "reveal-field", "reveal-sheet-rise", "card-flip-in", "added-pop"]) {
      assert.match(css, new RegExp(`@keyframes ${name} `));
    }
    const motion = css.slice(css.indexOf("@keyframes reveal-snap"), css.indexOf("@keyframes card-flip-in"));
    assert.doesNotMatch(motion, /width|height|top:|left:|margin|blur/, "transform and opacity only");
    // No motion library: CSS keyframes and a little JS.
    assert.doesNotMatch(read("package.json"), /framer-motion|"motion"/);
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
