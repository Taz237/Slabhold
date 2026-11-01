import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { act, createElement, type ReactElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { getSupabaseConfig } from "@/lib/supabase/client";
import type { ValueBoardModel } from "@/lib/leaderboard/types";

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "fixture",
  displayName: "Fixture",
  createdAt: "2025-01-01T00:00:00.000Z",
};
const social = { ready: true, mode: "local", user, refreshSuggestions() {} };
const collection = { cards: [], ready: true };
const model: ValueBoardModel = {
  start: "2026-10-26",
  end: "2026-11-01",
  weekLabel: "This week",
  note: "Fixture note",
  closedMessage: null,
  emptyMessage: null,
  brackets: [],
  viewerUserId: user.id,
};
const minimums = { minCards: 5, minValue: 500, minAccountDays: 7 };

async function render(child: ReactElement) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          SocialContext.Provider,
          { value: social as never },
          createElement(CollectionContext.Provider, { value: collection as never }, child),
        ),
      ),
    );
  });
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("leaderboard opt-in without Supabase (local accounts)", () => {
  it("runs with no Supabase config here", () => {
    assert.equal(getSupabaseConfig().configured, false);
  });

  it("the switch draws nothing for a signed-in user", async () => {
    const { LeaderboardOptInSwitch } = await import("@/components/leaderboard-opt-in");
    const view = await render(createElement(LeaderboardOptInSwitch));
    assert.equal(view.host.innerHTML, "");
    view.unmount();
  });

  it("the value board's checklist settles as not opted in", async () => {
    const { ValueBoard } = await import("@/components/value-board");
    const view = await render(createElement(ValueBoard, { model, minimums, accountCreatedAt: user.createdAt }));
    const optIn = view.host.querySelector<HTMLElement>('li[data-met]:nth-child(2)');
    assert.match(optIn?.textContent ?? "", /Show me on leaderboards/);
    assert.equal(optIn?.dataset.met, "no");
    // Checks only show once every check is ready, the opt-in read included.
    assert.match(optIn?.textContent ?? "", /Not yet/);
    assert.equal(view.host.querySelector("details")?.open, true);
    view.unmount();
  });
});
