import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { SocialContextValue } from "@/components/social-provider";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/maya" });
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("IS_REACT_ACT_ENVIRONMENT", true);

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("people a screen asks for, when the read fails", () => {
  after(() => win.close());

  it("says the read failed (not done, so never 'not found'), and asks again on retry", async () => {
    const asked: string[][] = [];
    const value = {
      requestProfiles: (keys: readonly string[]) => asked.push([...keys]),
      profilesReady: () => false,
      profilesFailed: () => true,
    } as unknown as SocialContextValue;
    const { SocialContext } = await import("@/components/social-provider");
    const { useProfiles } = await import("./use-profiles");
    const seen: { ready: boolean; failed: boolean; retry: () => void }[] = [];
    function Probe() {
      seen.push(useProfiles({ usernames: ["maya"] }));
      return null;
    }
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(SocialContext.Provider, { value }, createElement(Probe))));
    const last = seen[seen.length - 1];
    assert.equal(last.ready, false);
    assert.equal(last.failed, true);
    await act(async () => last.retry());
    assert.deepEqual(asked, [["user:maya"], ["user:maya"]]);
    act(() => root.unmount());
  });

  it("keeps a failed key unsettled in the provider, so a later ask reads again", () => {
    const provider = read("components/social-provider.tsx");
    const at = provider.indexOf("const [profileBatcher] = useState(");
    const batcher = provider.slice(at, provider.indexOf("\n  const requestProfiles", at));
    // The fail handler marks the keys failed and never settled.
    assert.match(batcher, /\(keys\) => startTransition\(\(\) => setProfileFailed\(/);
    assert.doesNotMatch(batcher.slice(batcher.indexOf("(keys) => startTransition(() => setProfileFailed(")), /setProfileSettled/);
  });

  it("offers a retry on every screen that waits on a person, never 'not found' from a failed read", () => {
    assert.match(read("components/profile-view.tsx"), /if \(!profile && profileRead\.failed\) return <ReadRetry/);
    assert.match(read("components/follow-list.tsx"), /if \(!profile && profileRead\.failed\) \{/);
    assert.match(read("components/message-thread.tsx"), /if \(!partner && partnerRead\.failed\) \{/);
    assert.match(read("components/public-card-view.tsx"), /if \(!early \|\| !initialOwner\) \{\n\s+return !profile && ownerRead\.failed \? \(/);
  });
});
