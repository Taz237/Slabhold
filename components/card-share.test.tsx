import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CardShareButton } from "./card-share";

installDom();

let root: Root | null = null;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

function mount(element: ReactNode) {
  act(() => root!.render(element));
}

const ID = "3f1c2b8e-1d2a-4f5b-9c8d-7e6f5a4b3c2d";
const card = { id: ID, playerName: "Puka Nacua", year: 2023, yearLabel: "2023", setBrand: "Prizm" };

async function tapShare() {
  const button = document.querySelector<HTMLButtonElement>("button[aria-label='Share card']");
  assert.ok(button, "share button");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // The sheet is its own chunk, fetched on the tap.
    await (await import("@/components/share-sheet")).ShareSheet.preload();
  });
}

describe("card share", () => {
  it("private cards can't be shared: shows the public switch instead", async () => {
    const changes: boolean[] = [];
    mount(
      createElement(CardShareButton, {
        card: { ...card, isPublic: false },
        username: "democollector",
        onTogglePublic: (next: boolean) => void changes.push(next),
      }),
    );
    await tapShare();
    const text = document.body.textContent ?? "";
    assert.match(text, /Make this card public to share/);
    assert.equal(document.querySelector("a[href*='x.com']"), null);
    assert.equal(document.querySelector("a[download]"), null);
    assert.equal(text.includes(ID), false);
    const toggle = document.querySelector<HTMLButtonElement>("[role='switch']");
    assert.ok(toggle, "public switch");
    act(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.deepEqual(changes, [true]);
  });

  it("public cards open the sheet with the profile card link and the portrait image", async () => {
    mount(
      createElement(CardShareButton, {
        card: { ...card, isPublic: true },
        username: "democollector",
        onTogglePublic() {},
      }),
    );
    await tapShare();
    const x = document.querySelector<HTMLAnchorElement>("a[href*='x.com']");
    assert.ok(x, "Post on X");
    const intent = new URL(x.getAttribute("href")!);
    assert.match(intent.searchParams.get("url") ?? "", new RegExp(`/u/democollector/cards/${ID}\\?ref=share$`));
    assert.equal(intent.searchParams.get("text"), "2023 Prizm Puka Nacua on Slabhold");
    assert.equal(document.querySelector("a[download]")?.getAttribute("href"), `/api/share-image/card/${ID}`);
  });
});
