import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";
import { quickCompIdentityKey, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import { quickCompRecentKey, type RecentComp } from "@/lib/quick-comp/recent";

const { win } = installDom();

const identity: QuickCompIdentity = {
  playerName: "Fixture Player",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Base",
  grade: "PSA 10",
};

const saved: RecentComp = {
  key: quickCompIdentityKey(identity),
  identity,
  catalog: null,
  payload: {
    median: 40,
    p25: 36,
    p75: 44,
    count: 1,
    source: "sample",
    fetchedAt: null,
    lowConfidence: true,
    sample: true,
    comps: [
      {
        id: "c1",
        itemId: "i1",
        title: "Fixture sale",
        soldPrice: 40,
        soldDate: "2026-10-30",
        platform: "eBay",
        condition: "PSA 10",
        shipping: null,
        url: "",
      },
    ],
  },
  savedAt: new Date().toISOString(),
};

const realFetch = globalThis.fetch;
const calls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  calls.push(String(input));
  return Response.json({ ...saved.payload, history: [], query: "q", cached: false });
}) as typeof fetch;
after(() => {
  globalThis.fetch = realFetch;
});

describe("Quick Comp grade lookups", () => {
  it("looks up only the grade still selected after 400ms", async () => {
    win.localStorage.setItem(quickCompRecentKey("fixture-user"), JSON.stringify([saved]));
    const { QuickCompView, GRADE_SETTLE_MS } = await import("./quick-comp-view");
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(QuickCompView, { userId: "fixture-user" }));
    });

    // Open the saved comp: it shows at once, with no lookup.
    const recent = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Fixture Player"));
    assert.ok(recent);
    await act(async () => recent.click());
    assert.equal(calls.length, 0);

    // The view schedules on window.setTimeout: point the jsdom window at the mocked timers.
    mock.timers.enable({ apis: ["setTimeout"] });
    const windowTimers = { set: win.setTimeout, clear: win.clearTimeout };
    Object.defineProperty(win, "setTimeout", { configurable: true, writable: true, value: globalThis.setTimeout });
    Object.defineProperty(win, "clearTimeout", { configurable: true, writable: true, value: globalThis.clearTimeout });
    try {
      const radio = (name: string) =>
        [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((button) => button.textContent === name)!;
      // Three grades inside 400ms, as arrow keys would select them.
      for (const name of ["PSA 9", "BGS 9.5", "SGC 10"]) {
        await act(async () => radio(name).click());
        mock.timers.tick(150);
      }
      assert.equal(calls.length, 0);
      assert.equal(radio("SGC 10").getAttribute("aria-checked"), "true");
      await act(async () => {
        mock.timers.tick(GRADE_SETTLE_MS);
      });
      assert.equal(GRADE_SETTLE_MS, 400);
      assert.equal(calls.length, 1);
      assert.equal(new URL(calls[0], "http://localhost").searchParams.get("grade"), "SGC 10");
      // Nothing else fires later.
      await act(async () => {
        mock.timers.tick(5_000);
      });
      assert.equal(calls.length, 1);
    } finally {
      Object.defineProperty(win, "setTimeout", { configurable: true, writable: true, value: windowTimers.set });
      Object.defineProperty(win, "clearTimeout", { configurable: true, writable: true, value: windowTimers.clear });
      mock.timers.reset();
      act(() => root.unmount());
      host.remove();
    }
  });
});
