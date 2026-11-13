import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { AddCardSheetDeps } from "./add-card-sheet";

const { win } = installDom();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, writable: true, value: win.sessionStorage });

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const pushed: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  prefetch() {},
};

after(() => win.close());

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function mount(deps: Partial<AddCardSheetDeps>) {
  const { AddCardSheet } = await import("./add-card-sheet");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  let closed = 0;
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(AddCardSheet, { deps, onClose: () => closed++ }) as ReactNode,
      ),
    );
  });
  return {
    host,
    closed: () => closed,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const tiles = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>("[data-add-tile]")];

describe("Add card sheet", () => {
  it("is a labelled modal with only two big tiles, Scan and Upload photo, and no other text", async () => {
    const view = await mount({ native: () => false, scanner: () => false });
    try {
      const dialog = view.host.querySelector('[role="dialog"]');
      assert.equal(dialog?.getAttribute("aria-modal"), "true");
      const title = win.document.getElementById(dialog?.getAttribute("aria-labelledby") ?? "");
      assert.equal(title?.textContent, "Add card");
      assert.match(title?.className ?? "", /sr-only/, "the title is for screen readers only");
      assert.deepEqual(
        tiles(view.host).map((tile) => tile.textContent),
        ["Scan", "Upload photo"],
      );
      for (const tile of tiles(view.host)) assert.match(tile.className, /aspect-\[1\/1\.05\]/, "big tiles");
      // Nothing to read but the two labels.
      assert.equal(dialog?.textContent, "Add cardScanUpload photo");
      assert.equal(view.host.querySelectorAll("p").length, 0);
    } finally {
      view.unmount();
    }
  });

  it("sits over a blurred, dimmed screen that closes it on tap or Escape", async () => {
    const view = await mount({ native: () => false, scanner: () => false });
    try {
      const backdrop = view.host.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
      assert.match(backdrop?.className ?? "", /backdrop-blur/);
      assert.match(backdrop?.className ?? "", /bg-zinc-950\/55/);
      await act(async () => backdrop!.click());
      await act(async () => {
        win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
      });
      assert.equal(view.closed(), 2);
    } finally {
      view.unmount();
    }
  });

  it("in the iOS app with the scanner on, Scan opens the camera and Upload photo the library", async () => {
    pushed.length = 0;
    const view = await mount({ native: () => true, scanner: () => true });
    try {
      const [scan, upload] = tiles(view.host);
      await act(async () => scan.click());
      await act(async () => upload.click());
      assert.deepEqual(pushed, ["/scan", "/scan?start=library"]);
      assert.equal(view.closed(), 2);
    } finally {
      view.unmount();
    }
  });

  it("on the web, opens the camera or library picker from the tap itself, then Add card with the photo", async () => {
    pushed.length = 0;
    win.sessionStorage.clear();
    const view = await mount({ native: () => false, scanner: () => true, readPhoto: async () => "data:image/jpeg;base64,AAA" });
    try {
      const clicked: string[] = [];
      for (const input of view.host.querySelectorAll<HTMLInputElement>("input[type=file]")) {
        input.click = () => clicked.push(input.dataset.photoInput ?? "");
      }
      const [scan, upload] = tiles(view.host);
      await act(async () => scan.click());
      await act(async () => upload.click());
      assert.deepEqual(clicked, ["camera", "library"]);
      assert.equal(pushed.length, 0, "nothing moves until a photo is picked");
      const library = view.host.querySelector<HTMLInputElement>('input[data-photo-input="library"]')!;
      const file = new win.File(["x"], "card.jpg", { type: "image/jpeg" });
      Object.defineProperty(library, "files", { configurable: true, value: [file] });
      await act(async () => {
        library.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      assert.deepEqual(pushed, ["/cards/new"]);
      assert.equal(win.sessionStorage.getItem("cardflip.scan"), "data:image/jpeg;base64,AAA");
    } finally {
      view.unmount();
    }
  });

  it("says so in one line when a photo can't be read", async () => {
    pushed.length = 0;
    const view = await mount({
      native: () => false,
      scanner: () => false,
      readPhoto: async () => {
        throw new Error("");
      },
    });
    try {
      const library = view.host.querySelector<HTMLInputElement>('input[data-photo-input="library"]')!;
      Object.defineProperty(library, "files", { configurable: true, value: [new win.File(["x"], "a.jpg")] });
      await act(async () => {
        library.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      assert.equal(view.host.querySelector('[role="alert"]')?.textContent, "Couldn't read that photo. Try again.");
      assert.equal(pushed.length, 0);
    } finally {
      view.unmount();
    }
  });

  it("pops up with motion, fades under reduced motion, and keeps 44px+ targets", () => {
    const sheet = read("components/add-card/add-card-sheet.tsx");
    assert.match(sheet, /motion-safe:animate-\[sheet-up/);
    assert.match(sheet, /motion-reduce:animate-\[backdrop-in/);
    assert.match(sheet, /motion-safe:animate-\[add-tile-in/);
    assert.doesNotMatch(sheet, /teal|font-bold|animate-spin|\bAI\b|\bbest\b|\bfree\b/i);
  });
});

describe("Add card buttons open the sheet", () => {
  it("the Add card tab, Add a card links, the create menu and the ghost tile", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /if \(!opensAddSheet\(event\)\) return;\s*event\.preventDefault\(\);\s*openAddCardSheet\(\);/);
    assert.match(shell, /<AddCardSheetSlot \/>/);
    assert.match(read("components/add-card-link.tsx"), /onClick=\{openSheetFromLink\}/);
    assert.match(read("components/create-menu.tsx"), /openSheetFromLink\(event\)/);
    assert.match(read("components/collection-grid.tsx"), /onClick=\{openSheetFromLink\}/);
    // A plain link stays underneath, so a new-tab click (or no shell) still reaches Add card.
    assert.match(read("components/add-card-link.tsx"), /href="\/cards\/new"/);
  });
});
