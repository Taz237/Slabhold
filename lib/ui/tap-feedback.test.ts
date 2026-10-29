import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installDom } from "@/lib/test/dom";
import { clearPendingNav, installTapFeedback, pendingSkeletonFor } from "./tap-feedback";

const { win } = installDom();
const CARD = "/u/maya/cards/ba95893e-89fe-4735-be3f-1509b6b6f3b9";

let uninstall: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = `
    <ul>
      <li data-tile="c1"><a id="tile" href="${CARD}"><span id="inner">Jalen Brunson</span></a></li>
      <li data-tile="c2"><a id="profile-tile" href="/u/maya">Maya</a></li>
    </ul>
    <a id="plain" href="/leaderboard">Leaderboard</a>
    <a id="away" href="https://example.test/">Away</a>`;
  window.history.replaceState(null, "", "/moving-today?dir=all");
  delete document.documentElement.dataset.navPending;
  uninstall = installTapFeedback(window);
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
});

const el = (id: string) => document.getElementById(id)!;
function pointer(type: string, target: Element, init: { x?: number; y?: number; button?: number } = {}) {
  target.dispatchEvent(
    new win.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: init.button ?? 0,
      clientX: init.x ?? 0,
      clientY: init.y ?? 0,
    }),
  );
}
function click(target: Element, init: MouseEventInit = {}) {
  target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
}

describe("tap feedback", () => {
  it("marks the pressed link on pointerdown, before any render", () => {
    pointer("pointerdown", el("inner"));
    assert.equal(el("tile").hasAttribute("data-pressed"), true);
    pointer("pointerup", el("inner"));
    assert.equal(el("tile").hasAttribute("data-pressed"), false);

    pointer("pointerdown", el("plain"));
    assert.equal(el("plain").hasAttribute("data-pressed"), true);
    pointer("pointercancel", el("plain"));
    assert.equal(el("plain").hasAttribute("data-pressed"), false);
  });

  it("lets go when the finger moves off into a scroll", () => {
    pointer("pointerdown", el("tile"), { x: 10, y: 10 });
    pointer("pointermove", el("tile"), { x: 12, y: 14 });
    assert.equal(el("tile").hasAttribute("data-pressed"), true, "a small wobble keeps the press");
    pointer("pointermove", el("tile"), { x: 12, y: 40 });
    assert.equal(el("tile").hasAttribute("data-pressed"), false);

    pointer("pointerdown", el("tile"));
    window.dispatchEvent(new win.Event("scroll"));
    assert.equal(el("tile").hasAttribute("data-pressed"), false);
  });

  it("ignores a secondary button", () => {
    pointer("pointerdown", el("tile"), { button: 2 });
    assert.equal(el("tile").hasAttribute("data-pressed"), false);
  });

  it("shows the card skeleton at once when a card tile is tapped", () => {
    click(el("inner"));
    assert.equal(document.documentElement.dataset.navPending, "card");
    assert.equal(clearPendingNav(document), true);
    assert.equal(document.documentElement.dataset.navPending, undefined);
    assert.equal(clearPendingNav(document), false);
  });

  it("does not show it for other links, modified clicks or the page already open", () => {
    click(el("profile-tile"));
    click(el("plain"));
    click(el("away"));
    click(el("tile"), { metaKey: true });
    click(el("tile"), { button: 1 });
    assert.equal(document.documentElement.dataset.navPending, undefined);
    window.history.replaceState(null, "", CARD);
    click(el("tile"));
    assert.equal(document.documentElement.dataset.navPending, undefined);
  });

  it("clears on Back before the card lands", () => {
    click(el("tile"));
    window.dispatchEvent(new win.PopStateEvent("popstate"));
    assert.equal(document.documentElement.dataset.navPending, undefined);
  });

  it("knows the card page path", () => {
    assert.equal(pendingSkeletonFor(CARD), "card");
    assert.equal(pendingSkeletonFor(`${CARD}?from=moving`), "card");
    assert.equal(pendingSkeletonFor("/u/maya"), null);
    assert.equal(pendingSkeletonFor("/u/maya/cards/x/edit"), null);
    assert.equal(pendingSkeletonFor("/cards/abc"), null);
  });
});

describe("tap feedback wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("runs from NavMotion and clears in the route change commit", () => {
    const nav = read("components/nav-motion.tsx");
    assert.match(nav, /installTapFeedback\(window\)/);
    assert.match(nav, /clearPendingNav\(document\)/);
    // A route the skeleton already slid in for swaps in place, no second slide.
    assert.match(nav, /pending \? "none"/);
  });

  it("keeps a static skeleton in the shell that CSS alone shows", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /<NavPendingSkeleton \/>/);
    assert.doesNotMatch(shell, /from "@\/components\/public-card-view"/, "the shell must not pull in the card page");
    const css = read("app/globals.css");
    assert.match(css, /html\[data-nav-pending="card"\] \[data-nav-pending-skeleton\] \{\s*display: block;/);
    assert.match(css, /\[data-pressed\]/);
    const reduced = css.slice(css.indexOf("[data-nav-pending-skeleton]"));
    assert.match(reduced, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
