import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import { INVITE_MOMENT_WEEK_MS, inviteMomentKey } from "@/lib/invites/moments";
import type { Profile } from "@/lib/social/types";

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };

const maya = {
  id: "user-maya",
  username: "maya",
  displayName: "Maya Chen",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00Z",
  email: "",
} as Profile;

function social(overrides: Record<string, unknown> = {}) {
  return { ready: true, mode: "local", user: maya, profiles: [maya], ...overrides };
}

async function render(node: ReactNode, value = social()) {
  const { SocialContext } = await import("@/components/social-provider");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(SocialContext.Provider, { value: value as never }, node),
      ),
    );
  });
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  win.localStorage.clear();
  win.document.body.innerHTML = "";
});

function moment(name: string) {
  return win.document.querySelector(`[data-invite-moment="${name}"]`);
}

describe("invite moments on screen", () => {
  it("Home: shows the row, shares the invite line and link, and starts the week", async () => {
    const shared: unknown[] = [];
    Object.defineProperty(win.navigator, "share", {
      configurable: true,
      value: async (data: unknown) => void shared.push(data),
    });
    const { HomeInviteRow } = await import("@/components/invite/invite-moment");
    cleanup = await render(createElement(HomeInviteRow));
    try {
      const row = moment("home");
      assert.ok(row, "home invite row");
      assert.match(row.textContent ?? "", /Your feed gets better with your card buddies\. Invite one\./);
      assert.ok(win.localStorage.getItem(inviteMomentKey("home", maya.id)), "first showing is stamped");
      await act(async () => {
        row.querySelector<HTMLButtonElement>("button")?.click();
      });
    } finally {
      delete (win.navigator as { share?: unknown }).share;
    }
    assert.deepEqual(shared, [
      {
        title: "Invite a collector",
        text: "I'm putting my cards on Slabhold. Come talk cards with me:",
        url: "https://slabhold.app/i/maya?ref=share",
      },
    ]);
  });

  it("Home: dismiss hides it, and it stays hidden on the next visit that week", async () => {
    const { HomeInviteRow } = await import("@/components/invite/invite-moment");
    cleanup = await render(createElement(HomeInviteRow));
    await act(async () => {
      win.document.querySelector<HTMLButtonElement>('[aria-label="Dismiss invite"]')?.click();
    });
    assert.equal(moment("home"), null);
    cleanup();
    cleanup = await render(createElement(HomeInviteRow));
    assert.equal(moment("home"), null);
  });

  it("Home: shown earlier this week hides it; a week later it's back", async () => {
    const { HomeInviteRow } = await import("@/components/invite/invite-moment");
    const key = inviteMomentKey("home", "user-other");
    const other = { ...maya, id: "user-other", username: "other" };
    win.localStorage.setItem(key, JSON.stringify({ shownAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }));
    cleanup = await render(createElement(HomeInviteRow), social({ user: other }));
    assert.equal(moment("home"), null);
    cleanup();
    win.localStorage.setItem(key, JSON.stringify({ shownAt: Date.now() - INVITE_MOMENT_WEEK_MS - 1000 }));
    cleanup = await render(createElement(HomeInviteRow), social({ user: other }));
    assert.ok(moment("home"));
  });

  it("Home: nothing for a signed-out reader", async () => {
    const { HomeInviteRow } = await import("@/components/invite/invite-moment");
    cleanup = await render(createElement(HomeInviteRow), social({ user: null }));
    assert.equal(moment("home"), null);
  });

  it("Added: a 'Show a buddy' action that can be dismissed", async () => {
    const { AddedInviteAction } = await import("@/components/invite/invite-moment");
    cleanup = await render(createElement(AddedInviteAction, { userId: maya.id, username: "maya" }));
    assert.match(moment("added")?.textContent ?? "", /Show a buddy/);
    await act(async () => {
      win.document.querySelector<HTMLButtonElement>('[aria-label="Dismiss Show a buddy"]')?.click();
    });
    assert.equal(moment("added"), null);
  });

  it("Leaderboard: 'Bring a buddy onto this board'", async () => {
    const { LeaderboardInviteRow } = await import("@/components/invite/invite-moment");
    cleanup = await render(createElement(LeaderboardInviteRow));
    assert.match(moment("leaderboard")?.textContent ?? "", /Bring a buddy onto this board/);
  });
});

describe("where the moments live", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("Home's row sits at the top of the feed, gated by follows under 5", () => {
    const feed = read("components/feed-view.tsx");
    assert.match(feed, /homeInviteEligible\(\{[\s\S]*?following,[\s\S]*?\}\) \? \(\s*<HomeInviteRow \/>/);
    assert.ok(feed.indexOf("<HomeInviteRow />") < feed.indexOf("<GetStartedCard"), "above Get started");
  });

  it("the Added scene has Show a buddy", () => {
    assert.match(read("components/card-added-panel.tsx"), /<AddedInviteAction userId=\{viewer\.id\} username=\{viewer\.username\} \/>/);
  });

  it("the leaderboard shows it under your own spot, this week only", () => {
    const board = read("components/leaderboard-view.tsx");
    assert.match(board, /leaderboardInviteEligible\(\{ week, hasSpot: Boolean\(board\.you && board\.you\.rank > 0\) \}\)/);
    assert.ok(board.indexOf("<PinnedSpot") < board.indexOf("<LeaderboardInviteRow />"), "under the spot");
  });

  it("never on the card detail page", () => {
    for (const path of ["components/card-detail.tsx", "app/(app)/cards/[id]/page.tsx"]) {
      let source = "";
      try {
        source = read(path);
      } catch {
        continue;
      }
      assert.doesNotMatch(source, /invite/i, path);
    }
  });
});
