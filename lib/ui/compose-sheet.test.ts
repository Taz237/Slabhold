import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttachCardField } from "@/components/attach-card-field";
import { isChromelessPath, loadingShellFor } from "@/lib/auth/guest-paths";
import { charRing } from "@/lib/ui/char-ring";
import { KEYBOARD_CLOSED, keyboardInset, resolveKeyboard, sheetFrame } from "@/lib/ui/use-keyboard-inset";
import { replyDockStyle } from "@/lib/ui/reply-dock";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("chrome-less composer route", () => {
  it("is only /compose", () => {
    assert.equal(isChromelessPath("/compose"), true);
    assert.equal(isChromelessPath("/compose?quote=abc"), true);
    assert.equal(isChromelessPath("/compose/"), true);
    for (const path of ["/", "/posts/x", "/compose-something", "/composer", "/u/compose"]) {
      assert.equal(isChromelessPath(path), false, path);
    }
  });

  it("loads without the header or tab bar", () => {
    assert.equal(loadingShellFor("/compose"), "chromeless");
    assert.equal(loadingShellFor("/compose?edit=abc"), "chromeless");
    assert.equal(loadingShellFor("/collection"), "blank");
  });

  it("drops header, tabs, create menu, join bar and bottom padding in the shell", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /isChromelessPath\(pathname\)/);
    assert.match(shell, /!chromeless \? \(\s*<header/);
    assert.match(shell, /showNav && !chromeless(?: && !fullScreen)? \? \(\s*<nav/);
    assert.match(shell, /showNav && !chromeless(?: && !fullScreen)? \? \(\s*<div data-keyboard-hides=""[^>]*>\s*<CreateMenu/);
    assert.match(shell, /showJoin && !chromeless(?: && !fullScreen)? \? <JoinBar/);
    assert.match(shell, /const mainPad = chromeless\s*\? ""/);
  });
});

describe("keyboard inset", () => {
  it("is zero with the keyboard closed or for small toolbar wobble", () => {
    assert.equal(keyboardInset({ innerHeight: 844, height: 844, offsetTop: 0 }), 0);
    assert.equal(keyboardInset({ innerHeight: 844, height: 800, offsetTop: 0 }), 0);
    assert.equal(keyboardInset({ innerHeight: 844, height: 900, offsetTop: 0 }), 0);
  });

  it("is the part of the layout viewport the keyboard covers", () => {
    assert.equal(keyboardInset({ innerHeight: 844, height: 508, offsetTop: 0 }), 336);
    assert.equal(keyboardInset({ innerHeight: 844, height: 508.4, offsetTop: 20 }), 316);
  });

  it("sizes the sheet to the visual viewport, or full height without one", () => {
    assert.deepEqual(sheetFrame(null), null);
    assert.deepEqual(sheetFrame({ height: 508, offsetTop: 0 }), { top: 0, height: 508 });
    assert.deepEqual(sheetFrame({ height: 507.6, offsetTop: 12.2 }), { top: 12, height: 508 });
  });
});

describe("keyboard from the iOS app", () => {
  it("uses the visual viewport when Safari shrinks it", () => {
    assert.deepEqual(resolveKeyboard({ viewport: { height: 508, offsetTop: 0 }, innerHeight: 844, native: 0 }), {
      frame: { top: 0, height: 508 },
      inset: 336,
      keyboardOpen: true,
    });
  });

  it("uses keyboardWillShow's height when the web view stays full height", () => {
    assert.deepEqual(resolveKeyboard({ viewport: { height: 844, offsetTop: 0 }, innerHeight: 844, native: 336 }), {
      frame: { top: 0, height: 508 },
      inset: 336,
      keyboardOpen: true,
    });
    assert.deepEqual(resolveKeyboard({ viewport: null, innerHeight: 844, native: 336 }), {
      frame: { top: 0, height: 508 },
      inset: 336,
      keyboardOpen: true,
    });
  });

  it("never counts the keyboard twice, and ignores a tiny height", () => {
    assert.equal(resolveKeyboard({ viewport: { height: 508, offsetTop: 0 }, innerHeight: 844, native: 336 }).inset, 336);
    assert.deepEqual(resolveKeyboard({ viewport: { height: 844, offsetTop: 0 }, innerHeight: 844, native: 40 }), {
      frame: { top: 0, height: 844 },
      inset: 0,
      keyboardOpen: false,
    });
    assert.deepEqual(resolveKeyboard({ viewport: null, innerHeight: 844, native: 0 }), KEYBOARD_CLOSED);
    assert.deepEqual(KEYBOARD_CLOSED, { frame: null, inset: 0, keyboardOpen: false });
  });
});

/*
 * The reply box floated mid-screen in the iOS app: the web view had already
 * shrunk to sit above the keys, and the old reader added the keys' height on
 * top. The lift is now measured from where a fixed bottom: 0 box really sits.
 */
describe("keyboard lift, measured", () => {
  const phone = { innerHeight: 844, baseline: 844 };

  it("A: native overlay, web view full height: lifts by the keyboard's height", () => {
    const state = resolveKeyboard({
      ...phone,
      viewport: { height: 844, offsetTop: 0 },
      native: 336,
      probe: { top: 0, bottom: 844 },
    });
    assert.deepEqual(state, { frame: { top: 0, height: 508 }, inset: 336, keyboardOpen: true });
  });

  it("B: the web view shrank by the keyboard's height: no lift, keyboard still open", () => {
    const state = resolveKeyboard({
      viewport: { height: 508, offsetTop: 0 },
      innerHeight: 508,
      baseline: 844,
      native: 336,
      probe: { top: 0, bottom: 508 },
    });
    assert.equal(state.inset, 0, "bottom: 0 is already on the keys");
    assert.equal(state.keyboardOpen, true);
    assert.deepEqual(state.frame, { top: 0, height: 508 }, "a sheet keeps the whole space above the keys");
  });

  it("B: also when fixed boxes follow the visual viewport and innerHeight stays put", () => {
    const state = resolveKeyboard({
      ...phone,
      viewport: { height: 508, offsetTop: 0 },
      native: 336,
      probe: { top: 0, bottom: 508 },
    });
    assert.equal(state.inset, 0);
    assert.equal(state.keyboardOpen, true);
  });

  it("B: before the resize lands, a web view known to resize never lifts by the raw height", () => {
    const state = resolveKeyboard({
      ...phone,
      viewport: { height: 844, offsetTop: 0 },
      native: 336,
      probe: { top: 0, bottom: 844 },
      nativeOverlays: false,
    });
    assert.equal(state.inset, 0);
    assert.equal(state.keyboardOpen, true);
  });

  it("C: Safari's visual viewport, with and without the page scrolled under it", () => {
    assert.deepEqual(
      resolveKeyboard({ ...phone, viewport: { height: 508, offsetTop: 0 }, native: 0, probe: { top: 0, bottom: 844 } }),
      { frame: { top: 0, height: 508 }, inset: 336, keyboardOpen: true },
    );
    assert.deepEqual(
      resolveKeyboard({ ...phone, viewport: { height: 508, offsetTop: 20 }, native: 0, probe: { top: 0, bottom: 844 } }),
      { frame: { top: 20, height: 508 }, inset: 316, keyboardOpen: true },
    );
  });

  it("calls it open only past a 120px shrink, and never for a pinch zoom", () => {
    const toolbar = resolveKeyboard({ ...phone, viewport: { height: 734, offsetTop: 0 }, native: 0 });
    assert.equal(toolbar.keyboardOpen, false);
    assert.equal(toolbar.inset, 0);
    const zoom = resolveKeyboard({ ...phone, viewport: { height: 422, offsetTop: 200, scale: 2 }, native: 0 });
    assert.equal(zoom.keyboardOpen, false);
    assert.equal(zoom.inset, 0);
  });
});

describe("reply box dock", () => {
  it("keyboard down: above the floating tab bar and the home indicator", () => {
    assert.deepEqual(replyDockStyle({ inset: 0, keyboardOpen: false }), {
      bottom: "calc(6.15rem + env(safe-area-inset-bottom))",
    });
  });

  it("keyboard up: the measured lift only, no safe area and no tab bar room", () => {
    assert.deepEqual(replyDockStyle({ inset: 336, keyboardOpen: true }), { bottom: "336px" });
    assert.deepEqual(replyDockStyle({ inset: 0, keyboardOpen: true }), { bottom: "0px" });
    assert.deepEqual(replyDockStyle({ inset: 335.6, keyboardOpen: true }), { bottom: "336px" });
  });

  it("is what the Post page uses", () => {
    const post = read("components/post-view.tsx");
    assert.match(post, /import \{ replyDockStyle \} from "@\/lib\/ui\/reply-dock"/);
    assert.equal((post.match(/style=\{replyDockStyle\(keyboard\)\}/g) ?? []).length, 2);
    assert.doesNotMatch(post, /function replyDockStyle/);
  });
});

describe("tab bar while typing", () => {
  const shell = read("components/app-shell.tsx");
  const css = read("app/globals.css");

  it("hides the tab bar and the Post button off keyboardOpen, not off the inset", () => {
    assert.match(shell, /const keyboardOpen = useKeyboardOpen\(\);/);
    const nav = shell.slice(shell.indexOf('viewTransitionName: "app-nav"'), shell.indexOf("</nav>"));
    assert.match(nav, /data-keyboard-hides=""\s+data-keyboard-open=\{keyboardOpen \? "" : undefined\}/);
    assert.match(shell, /<div data-keyboard-hides="" data-keyboard-open=\{keyboardOpen \? "" : undefined\}[^>]*>\s*<CreateMenu/);
    assert.doesNotMatch(shell, /inset > 0/);
  });

  it("fades them fast with opacity and visibility only, so nothing moves", () => {
    const rule = css.slice(css.indexOf("[data-keyboard-hides][data-keyboard-open] {"));
    assert.match(rule, /^\[data-keyboard-hides\]\[data-keyboard-open\] \{\s*opacity: 0;\s*visibility: hidden;\s*pointer-events: none;\s*transition:\s*opacity 120ms ease-out,\s*visibility 0s linear 120ms;/);
    const block = css.slice(css.indexOf("The keyboard is up"), css.indexOf("The photo viewer is fullscreen"));
    assert.doesNotMatch(block, /transform|height|bottom|margin|display/);
    assert.match(block, /prefers-reduced-motion: reduce[\s\S]*transition: none/);
  });
});

describe("character ring", () => {
  it("hides when empty", () => {
    const ring = charRing(0, 280);
    assert.equal(ring.visible, false);
    assert.equal(ring.progress, 0);
  });

  it("is a plain purple ring below 260", () => {
    const ring = charRing(259, 280);
    assert.equal(ring.visible, true);
    assert.equal(ring.tone, "normal");
    assert.equal(ring.label, null);
    assert.equal(ring.remaining, 21);
  });

  it("turns amber and counts down from 260", () => {
    const ring = charRing(260, 280);
    assert.equal(ring.tone, "warn");
    assert.equal(ring.label, "20");
  });

  it("turns rose at the limit", () => {
    const ring = charRing(280, 280);
    assert.equal(ring.tone, "over");
    assert.equal(ring.label, "0");
    assert.equal(ring.progress, 1);
  });
});

describe("composer sheet wiring", () => {
  const compose = read("components/compose-view.tsx");

  it("portals to body and never keeps a transform animation on the toolbar's ancestors", () => {
    assert.match(compose, /createPortal\(/);
    assert.match(compose, /document\.body/);
    assert.doesNotMatch(compose, /animate-\[composer-in[^\]]*_both\]/);
    assert.match(compose, /motion-safe:animate-\[composer-in_220ms_[^\]]*_backwards\]/);
    assert.doesNotMatch(compose, /bottom-\[calc\(6\.15rem/);
  });

  it("auto-grows the text, pins the toolbar to the keyboard and locks page scroll", () => {
    assert.match(compose, /autoGrow/);
    assert.doesNotMatch(compose, /rows=\{6\}/);
    assert.match(compose, /useVisualViewport\(\)/);
    assert.match(compose, /overflow = "hidden"/);
    assert.match(read("components/mention-textarea.tsx"), /style\.height = `\$\{field\.scrollHeight\}px`/);
  });

  it("shares the keyboard hook with the reply bar", () => {
    const post = read("components/post-view.tsx");
    assert.match(post, /const keyboard = useKeyboardInset\(\);/);
    assert.doesNotMatch(post, /function useReplyKeyboardOffset/);
  });

  it("names every toolbar button", () => {
    assert.match(compose, /aria-label="Camera"/);
    assert.match(compose, /aria-label="Photo library"/);
    assert.match(compose, /aria-label="Attach a card"/);
    assert.match(compose, /\{body\.length\}\/\{POST_LIMIT\}/);
  });
});

describe("card picker list", () => {
  it("draws a tappable row per card and marks the attached one", () => {
    const html = renderToStaticMarkup(
      createElement(AttachCardField, {
        variant: "list",
        cards: [
          { id: "a", year: 2024, playerName: "Ada Fixture", setBrand: "Prizm", photoDataUrl: null, accent: "#7C3AED" },
          { id: "b", year: 2023, playerName: "Bo Fixture", photoDataUrl: "data:image/png;base64,x" },
        ],
        value: "b",
        onChange: () => undefined,
      }),
    );
    assert.match(html, /aria-label="Attach a card"/);
    assert.equal((html.match(/<button/g) ?? []).length, 2);
    assert.match(html, /Ada Fixture/);
    assert.match(html, /2024 Prizm/);
    assert.match(html, /aria-pressed="false"[\s\S]*aria-pressed="true"/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /min-h-14/);
  });
});
