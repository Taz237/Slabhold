import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { firstRunSteps } from "@/lib/social/first-run";
import type { ChecklistState } from "@/lib/social/get-started";

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };

const VIEWER = "fixture-viewer";
const person = (id: string, username: string, displayName: string) => ({
  id,
  email: "",
  username,
  displayName,
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7C3AED",
  createdAt: "",
  suggestionReason: "Collects rookies",
});
const PEOPLE = [person("f1", "rookiepc", "Rookie PC"), person("f2", "slabsunday", "Slab Sunday"), person("f3", "vintagewax", "Vintage Wax")];

function state(card: boolean, follows: number, profile: boolean): ChecklistState {
  const steps = firstRunSteps({ cardCount: card ? 1 : 0, effectiveFollows: follows, profileDone: profile });
  return { visible: true, complete: steps.every((step) => step.done), steps };
}

function social(followed: Set<string>, followAll: string[][]) {
  return {
    user: { id: VIEWER },
    blockedIds: [],
    isFollowing: (id: string) => followed.has(id),
    followMany: async (ids: readonly string[]) => {
      followAll.push([...ids]);
      return {};
    },
    toggleFollow: async () => ({}),
  };
}

async function tree(props: Record<string, unknown>, followed = new Set<string>(), followAll: string[][] = []) {
  const { SocialContext } = await import("@/components/social-provider");
  const { GetStartedCard } = await import("@/components/get-started");
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      SocialContext.Provider,
      { value: social(followed, followAll) as never },
      createElement(GetStartedCard, {
        state: state(false, 0, false),
        followingCount: 0,
        onDismiss: () => {},
        onFollow: () => {},
        userId: VIEWER,
        people: PEOPLE,
        ...props,
      }),
    ),
  );
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  win.localStorage.clear();
});

describe("Get started card (first run)", () => {
  it("server-draws a context title, the progress, and a skeleton the same size as the people list", async () => {
    const html = renderToString(await tree({ live: false }));
    assert.match(html, />Set up your collection</);
    assert.match(html, /0<!-- --> of <!-- -->3/);
    assert.match(html, /scaleX\(0\)/);
    assert.match(html, /aria-label="Dismiss Get started"/);
    const text = html.replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, /Welcome|!/);
    assert.doesNotMatch(html, /font-bold|font-extrabold|transition-all|uppercase|tracking-wider/);
    // The lazy list is not in the server HTML; its skeleton is, with the list's 44px header and 56px rows.
    assert.doesNotMatch(html, /rookiepc/);
    assert.equal(html.match(/class="flex h-14 items-center gap-3"/g)?.length, 3);
    assert.match(html, /class="flex h-11 items-center"/);
  });

  it("hydrates the server HTML with no mismatch, then draws three collectors and Follow all", async () => {
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    host.innerHTML = renderToString(await tree({ live: false }));
    const errors: unknown[] = [];
    const { hydrateRoot } = await import("react-dom/client");
    const followAll: string[][] = [];
    let root: ReturnType<typeof hydrateRoot> | null = null;
    const element = await tree({ live: false }, new Set(), followAll);
    await act(async () => {
      root = hydrateRoot(host, element, { onRecoverableError: (error) => errors.push(error) });
    });
    // The lazy chunk lands after hydration.
    for (let i = 0; i < 20 && !host.textContent?.includes("rookiepc"); i += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    cleanup = () => {
      act(() => root?.unmount());
      host.remove();
    };
    assert.deepEqual(errors, []);
    assert.match(host.textContent ?? "", /@rookiepc/);
    const followAllButton = [...host.querySelectorAll("button")].find((b) => b.textContent === "Follow all 3");
    assert.ok(followAllButton);
    await act(async () => followAllButton.click());
    assert.deepEqual(followAll, [["f1", "f2", "f3"]]);
  });

  it("counts only the people not yet followed in Follow all", async () => {
    const { SocialContext } = await import("@/components/social-provider");
    const { FirstRunPeople } = await import("@/components/first-run/first-run-steps");
    const html = renderToString(
      createElement(
        SocialContext.Provider,
        { value: social(new Set(["f1"]), []) as never },
        createElement(FirstRunPeople, { people: PEOPLE, current: true }),
      ),
    );
    assert.match(html, />Follow all 2</);
  });

  it("falls back to the rail with fewer than 3 people", async () => {
    const html = renderToString(await tree({ people: PEOPLE.slice(0, 2) }));
    assert.doesNotMatch(html, /h-14 items-center gap-3"/);
    assert.match(html, /Follow 3 collectors \(0 of 3\)/);
  });

  it("marks the current step as the only purple action", async () => {
    const html = renderToString(await tree({ state: state(true, 3, false), people: [] }));
    assert.equal(html.match(/bg-violet-600 px-3/g)?.length, 1);
    assert.match(html, />Edit</);
    assert.match(html, />Optional</);
    assert.match(html, /scaleX\(0\.6666/);
  });

  it("says You're set when done, then puts itself away without a dismiss event", async () => {
    const { SocialContext } = await import("@/components/social-provider");
    const { GetStartedCard } = await import("@/components/get-started");
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    let dismissed = 0;
    const draw = (s: ChecklistState) =>
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          SocialContext.Provider,
          { value: social(new Set(), []) as never },
          createElement(GetStartedCard, {
            state: s,
            followingCount: 3,
            onDismiss: () => void (dismissed += 1),
            onFollow: () => {},
            userId: VIEWER,
          }),
        ),
      );
    await act(async () => root.render(draw(state(true, 3, false))));
    assert.equal(win.localStorage.getItem(`slabhold.first-run.first_run_shown.${VIEWER}`), "1");
    await act(async () => root.render(draw(state(true, 3, true))));
    assert.match(host.textContent ?? "", /You're set/);
    assert.equal(win.localStorage.getItem(`slabhold.first-run.first_run_profile_done.${VIEWER}`), "1");
    assert.equal(win.localStorage.getItem(`slabhold.first-run.first_run_completed.${VIEWER}`), "1");
    // Card and follow were done on load: no events for them.
    assert.equal(win.localStorage.getItem(`slabhold.first-run.first_run_card_done.${VIEWER}`), null);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2900)));
    assert.equal(dismissed, 1);
    assert.equal(win.localStorage.getItem(`slabhold.first-run.first_run_dismissed.${VIEWER}`), null);
    cleanup = () => {
      act(() => root.unmount());
      host.remove();
    };
  });

  it("the X fires first_run_dismissed once and dismisses", async () => {
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    let dismissed = 0;
    await act(async () => root.render(await tree({ onDismiss: () => void (dismissed += 1), people: [] })));
    const x = host.querySelector('button[aria-label="Dismiss Get started"]') as HTMLButtonElement;
    await act(async () => x.click());
    assert.equal(dismissed, 1);
    assert.equal(win.localStorage.getItem(`slabhold.first-run.first_run_dismissed.${VIEWER}`), "1");
    cleanup = () => {
      act(() => root.unmount());
      host.remove();
    };
  });
});
