import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { SHEET_SETTLE_MS } from "@/lib/ui/sheet-drag";

const { win } = installDom();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(onClose: () => void, onRow: () => void = () => {}) {
  const { MenuSheet, menuSheetItem } = await import("@/components/menu-sheet");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      createElement(
        "article",
        { onClick: onRow },
        createElement(
          MenuSheet as (props: { label: string; onClose: () => void; children?: ReactNode }) => ReactNode,
          { label: "Post options", onClose },
          createElement("button", { type: "button", role: "menuitem", className: menuSheetItem, id: "edit" }, "Edit post"),
        ),
      ),
    );
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the ⋯ menu is a bottom sheet", () => {
  it("draws at the end of the page as a labelled menu with a Cancel row, and focuses the first item", async () => {
    await mount(() => {});
    const sheet = document.querySelector<HTMLElement>("[data-menu-sheet]");
    assert.ok(sheet, "the sheet is drawn");
    assert.equal(sheet.parentElement, document.body, "outside the post row, so nothing clips it");
    const menu = sheet.querySelector<HTMLElement>("[role='menu']");
    assert.ok(menu);
    assert.equal(document.getElementById(menu.getAttribute("aria-labelledby") ?? "")?.textContent, "Post options");
    assert.match(menu.className, /sheet-slide/);
    assert.equal(document.activeElement?.id, "edit");
    assert.match(menu.textContent ?? "", /Cancel/);
  });

  it("slides away on a backdrop tap or Cancel, then closes, and the tap never reaches the post row", async () => {
    let closed = 0;
    let rowTaps = 0;
    await mount(() => (closed += 1), () => (rowTaps += 1));
    const sheet = document.querySelector<HTMLElement>("[data-menu-sheet]")!;
    await act(async () => sheet.click());
    assert.equal(closed, 0, "it slides away first");
    await act(async () => wait(SHEET_SETTLE_MS + 60));
    assert.equal(closed, 1);
    assert.equal(rowTaps, 0);
  });

  it("keeps a tap on a menu row away from the post row too", async () => {
    let rowTaps = 0;
    await mount(() => {}, () => (rowTaps += 1));
    await act(async () => document.getElementById("edit")!.click());
    assert.equal(rowTaps, 0);
  });

  it("closes on Escape", async () => {
    let closed = 0;
    await mount(() => (closed += 1));
    await act(async () => {
      document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(closed, 1);
  });

  it("swipes down to close through the shared sheet hook", () => {
    const sheet = read("components/menu-sheet.tsx");
    assert.match(sheet, /const dismiss = useSheetDrag\(panelRef, rootRef, onClose\);/);
    assert.match(sheet, /min-h-\[3\.25rem\]/, "rows are at least 52px tall");
    assert.doesNotMatch(sheet, /teal|font-bold|animate-spin|shadow-violet|\bglow\b/i);
  });

  it("is what the post, reply and other-people menus open", () => {
    for (const file of ["components/tweet.tsx", "components/post-view.tsx", "components/safety-menu.tsx"]) {
      const source = read(file);
      assert.match(source, /<MenuSheet label=/, file);
      assert.match(source, /aria-haspopup="menu"/, file);
    }
    // The little popover is gone from all three.
    assert.doesNotMatch(read("components/safety-menu.tsx"), /absolute top-9 right-0/);
    assert.doesNotMatch(read("components/post-view.tsx"), /absolute top-9 right-0/);
    assert.doesNotMatch(read("components/tweet.tsx"), /absolute top-9 right-0/);
  });
});
