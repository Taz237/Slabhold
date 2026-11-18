import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CollectionHeader } from "@/components/collection-header";
import { LeaderboardSettingsButton } from "@/components/collection-actions";
import { SocialContext } from "@/components/social-provider";
import { leaderboardMinimums } from "@/lib/leaderboard/eligibility";
import { leaderboardRequirementsLine } from "@/lib/leaderboard/requirements";

// A project is configured, and its client cannot load: the switch still draws, as it does in Settings.
const before = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-key";
after(() => {
  if (before.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = before.url;
  if (before.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = before.key;
});
const { win } = installDom();

const minimums = leaderboardMinimums();
const user = { id: "u1", username: "maya", displayName: "Maya", createdAt: "2026-01-01T00:00:00.000Z" };

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

function control(signedIn = true) {
  return createElement(
    SocialContext.Provider,
    { value: { ready: true, mode: "supabase", user: signedIn ? user : null } as never },
    createElement(CollectionHeader, {
      actions: createElement(LeaderboardSettingsButton, {
        minimums,
        valuedCards: 0,
        value: 0,
        publicCollection: false,
        ready: false,
      }),
    }),
  );
}

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

describe("Collection: the leaderboard switch's new home", () => {
  it("is a trophy in the header that opens the switch, its help and the requirements in a sheet", async () => {
    await act(async () => root!.render(control()));
    await settle();
    // Nothing of the old always-open block is on the page.
    assert.equal(host.querySelector("#show-on-leaderboards"), null);
    assert.doesNotMatch(host.textContent ?? "", /Show me on leaderboards|trusted cards/);
    const open = host.querySelector<HTMLButtonElement>('button[aria-label="Leaderboard settings"]');
    assert.ok(open);
    assert.match(open.className, /\bh-11 w-11\b/);
    assert.equal(open.getAttribute("aria-haspopup"), "dialog");
    assert.equal(host.querySelector('[data-slot="leaderboard-dot"]'), null, "no dot until the cards qualify");
    // It sits in the header row, before Add a card.
    assert.ok(open.compareDocumentPosition(host.querySelector('a[href="/cards/new"]')!) & win.Node.DOCUMENT_POSITION_FOLLOWING);

    open.focus();
    await act(async () => open.click());
    await settle();
    const dialog = document.querySelector<HTMLElement>("[data-collection-sheet] [role='dialog']");
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(dialog.querySelector("h2")?.textContent, "Leaderboard");
    const toggle = dialog.querySelector<HTMLInputElement>('input#show-on-leaderboards[role="switch"]');
    assert.ok(toggle, "the same switch as Settings");
    assert.equal(toggle.getAttribute("aria-checked"), "false");
    const words = dialog.textContent ?? "";
    assert.match(words, /Show me on leaderboards/);
    assert.ok(words.includes(leaderboardRequirementsLine(minimums)));
    assert.ok(dialog.contains(document.activeElement));

    act(() => {
      document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(document.querySelector("[data-collection-sheet]"), null);
    assert.ok(document.activeElement === open);
  });

  it("draws nothing when signed out", async () => {
    await act(async () => root!.render(control(false)));
    assert.equal(host.querySelector('button[aria-label^="Leaderboard settings"]'), null);
    assert.ok(host.querySelector('a[href="/cards/new"]'));
  });
});
