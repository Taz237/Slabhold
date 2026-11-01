import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { act, createElement, type ReactElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import { SocialContext } from "@/components/social-provider";

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
const social = { ready: true, mode: "supabase", user, refreshSuggestions() {} };

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
        createElement(SocialContext.Provider, { value: social as never }, child),
      ),
    );
  });
  // Let the lazy load settle (it resolves or rejects on a later tick).
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

function settingSwitch(host: HTMLElement) {
  const input = host.querySelector<HTMLInputElement>('input[role="switch"]');
  assert.ok(input, "switch");
  return input;
}

const MISSING = /not available in this browser yet/;

/** Unhandled rejections during a render fail the test. */
async function withoutUnhandled(run: () => Promise<void>) {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown) => void seen.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    await run();
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(seen, []);
}

describe("screens when supabase-js gives no client", () => {
  // No NEXT_PUBLIC_SUPABASE_* here, so loadSupabaseBrowser() resolves null.
  it("collect settings shows the not-available view, not Loading", async () => {
    const { CollectSettings } = await import("@/components/collect-settings");
    const view = await render(createElement(CollectSettings));
    assert.match(view.host.textContent ?? "", MISSING);
    assert.doesNotMatch(view.host.textContent ?? "", /Loading/);
    view.unmount();
  });

  it("the leaderboard switch draws nothing", async () => {
    const { LeaderboardOptInSwitch } = await import("@/components/leaderboard-opt-in");
    const view = await render(createElement(LeaderboardOptInSwitch));
    assert.equal(view.host.innerHTML, "");
    view.unmount();
  });
});

describe("screens when supabase-js fails to load", () => {
  it("rejects the lazy load in this setup", async () => {
    // An invalid URL makes creating the client throw, so the lazy load rejects.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-key";
    const { loadSupabaseBrowser } = await import("@/lib/supabase/browser-lazy");
    await assert.rejects(loadSupabaseBrowser());
  });

  it("collect settings shows the not-available view, not Loading", async () => {
    await withoutUnhandled(async () => {
      const { CollectSettings } = await import("@/components/collect-settings");
      const view = await render(createElement(CollectSettings));
      assert.match(view.host.textContent ?? "", MISSING);
      view.unmount();
    });
  });

  it("the leaderboard switch is ready with the load error", async () => {
    await withoutUnhandled(async () => {
      const { LeaderboardOptInSwitch } = await import("@/components/leaderboard-opt-in");
      const view = await render(createElement(LeaderboardOptInSwitch));
      const input = settingSwitch(view.host);
      assert.equal(input.disabled, false);
      assert.equal(input.checked, false);
      const error = view.host.querySelector("p.text-sm.text-rose-600");
      assert.equal(error?.textContent, "Couldn't load that setting.");
      view.unmount();
    });
  });

  it("the hunter switch is ready with the load error", async () => {
    await withoutUnhandled(async () => {
      const { HunterSettingSwitch } = await import("@/components/hunter-setting");
      const view = await render(createElement(HunterSettingSwitch));
      assert.equal(settingSwitch(view.host).disabled, false);
      const error = view.host.querySelector("p.text-sm.text-rose-600");
      assert.equal(error?.textContent, "Couldn't load that setting.");
      view.unmount();
    });
  });

  it("the prompts stay hidden", async () => {
    await withoutUnhandled(async () => {
      const { HunterPrompt } = await import("@/components/hunter-setting");
      const { LeaderboardPrompt } = await import("@/components/leaderboard-opt-in");
      const hunter = await render(createElement(HunterPrompt));
      assert.equal(hunter.host.textContent, "");
      hunter.unmount();
      const board = await render(
        createElement(LeaderboardPrompt, { valuedCards: 99, value: 99999, publicCollection: true, ready: true }),
      );
      assert.equal(board.host.textContent, "");
      board.unmount();
    });
  });
});
