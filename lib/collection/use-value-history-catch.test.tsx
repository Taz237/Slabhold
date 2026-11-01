import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();

// An invalid URL counts as configured, but creating the client throws, so
// loadSupabaseBrowser() rejects: the same as supabase-js failing to load.
process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-key";

/** Unhandled rejections during a run fail the test. */
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

async function mount(Probe: () => null) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(Probe)));
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

describe("value history when supabase-js fails to load", () => {
  it("the lazy load rejects in this setup", async () => {
    const { loadSupabaseBrowser } = await import("@/lib/supabase/browser-lazy");
    await assert.rejects(loadSupabaseBrowser());
  });

  it("collection snapshots settle to no rows, not loading", async () => {
    const { useCollectionSnapshots } = await import("./use-value-history");
    const seen: unknown[] = [];
    await withoutUnhandled(async () => {
      const unmount = await mount(() => {
        seen.push(useCollectionSnapshots());
        return null;
      });
      unmount();
    });
    assert.deepEqual(seen[0], { rows: [], loading: true });
    assert.deepEqual(seen.at(-1), { rows: [], loading: false });
  });

  it("card value history stays an empty map", async () => {
    const { useCardValueHistory } = await import("./use-value-history");
    let last: Map<string, unknown> | null = null;
    await withoutUnhandled(async () => {
      const unmount = await mount(() => {
        last = useCardValueHistory(true);
        return null;
      });
      unmount();
    });
    assert.equal((last as Map<string, unknown> | null)?.size, 0);
  });
});
