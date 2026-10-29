import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttachCardField } from "@/components/attach-card-field";
import { isChromelessPath, loadingShellFor } from "@/lib/auth/guest-paths";
import { charRing } from "@/lib/ui/char-ring";
import { keyboardInset, sheetFrame } from "@/lib/ui/use-keyboard-inset";

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
    assert.match(shell, /showNav && !chromeless \? \(\s*<nav/);
    assert.match(shell, /showNav && !chromeless \? <CreateMenu/);
    assert.match(shell, /showJoin && !chromeless \? <JoinBar/);
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
    assert.match(post, /useKeyboardInset\(\)/);
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
