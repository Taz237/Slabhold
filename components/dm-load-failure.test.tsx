import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { after, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { SocialContextValue } from "@/components/social-provider";

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };

// The DM chunk fails to load, as when the network drops before it is fetched.
type Loader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
let dmLoads = 0;
loader._load = function load(request, parent, isMain) {
  if (/(^|[/\\])dm-actions(\.ts)?$/.test(request)) {
    dmLoads++;
    throw new Error("ChunkLoadError: Loading chunk dm-actions failed.");
  }
  return originalLoad.call(this, request, parent, isMain);
};
after(() => {
  loader._load = originalLoad;
});

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.ok(check());
}

describe("DM send when its chunk fails to load", () => {
  it("resolves to an error, like a failed send, instead of throwing", async () => {
    const { SocialProvider, useSocial } = await import("@/components/social-provider");
    let social: SocialContextValue | null = null;
    function Probe() {
      social = useSocial();
      return null;
    }
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AppRouterContext.Provider, { value: router }, createElement(SocialProvider, null, createElement(Probe))));
    });
    await waitFor(() => Boolean(social?.ready));

    const signedUp = await act(async () =>
      social!.signUp({ email: "ada@example.com", password: "correct horse battery", username: "ada_dm", displayName: "Ada" }),
    );
    assert.equal(signedUp.error, undefined);
    await waitFor(() => Boolean(social?.user));

    let result: Awaited<ReturnType<SocialContextValue["sendMessage"]>> | null = null;
    await act(async () => {
      result = await social!.sendMessage("someone-else", "Still have the Wemby?");
    });
    assert.ok(dmLoads > 0, "the DM chunk was asked for");
    assert.deepEqual(result, { error: "Could not send that message." });

    act(() => root.unmount());
    host.remove();
  });
});
