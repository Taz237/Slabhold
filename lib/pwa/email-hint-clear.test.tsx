import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

const HINT = "slabhold_email_hint=ada%40example.com; Max-Age=600; Path=/; SameSite=Lax";

function hint() {
  return win.document.cookie.includes("slabhold_email_hint=ada");
}

async function render(node: ReactNode) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppRouterContext.Provider, { value: router }, node));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function button(label: string) {
  const found = [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label);
  assert.ok(found, label);
  return found;
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 50; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.ok(check());
}

afterEach(() => {
  win.document.cookie = "slabhold_email_hint=; Max-Age=0; Path=/";
  win.document.body.innerHTML = "";
});

describe("the email hint cookie", () => {
  it("goes on Maybe later, and stays on I added it", async () => {
    const { InstallGuide } = await import("@/components/onboarding/install-step");
    const choices: string[] = [];

    win.document.cookie = HINT;
    let view = await render(
      createElement(InstallGuide, { platform: "ios-safari", variant: "menu", onDone: (c) => choices.push(c) }),
    );
    await act(async () => button("I added it").click());
    assert.ok(hint(), "added keeps the hint for the installed app's first login");
    view.unmount();

    view = await render(
      createElement(InstallGuide, { platform: "ios-safari", variant: "menu", onDone: (c) => choices.push(c) }),
    );
    await act(async () => button("Maybe later").click());
    assert.equal(hint(), false);
    view.unmount();

    assert.deepEqual(choices, ["added", "later"]);
  });

  it("goes when Escape closes the guide (that's Maybe later too)", async () => {
    const { InstallGuide } = await import("@/components/onboarding/install-step");
    win.document.cookie = HINT;
    const view = await render(createElement(InstallGuide, { platform: "ios-browser", variant: "menu", onDone: () => {} }));
    await act(async () => {
      win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
    });
    assert.equal(hint(), false);
    view.unmount();
  });

  it("goes on sign out, which every logout path uses", async () => {
    const { SocialProvider, useSocial } = await import("@/components/social-provider");
    function Probe() {
      const { ready, signOut } = useSocial();
      return ready ? createElement("button", { type: "button", onClick: () => void signOut() }, "Log out") : null;
    }
    win.document.cookie = HINT;
    const view = await render(createElement(SocialProvider, null, createElement(Probe)));
    await waitFor(() => win.document.querySelector("button") !== null);
    await act(async () => button("Log out").click());
    await waitFor(() => !hint());
    view.unmount();
  });
});
