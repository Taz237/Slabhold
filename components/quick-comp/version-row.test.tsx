import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";
import { quickCompIdentityKey, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import { quickCompRecentKey, type RecentComp } from "@/lib/quick-comp/recent";

const { win } = installDom();

/** 2023 Topps Chrome Football: a set with no list of ours, so its family's list shows. */
const identity: QuickCompIdentity = {
  playerName: "Fixture Player",
  year: 2023,
  yearLabel: "2023",
  setBrand: "Topps Chrome",
  cardNumber: "306",
  parallel: "Base",
  grade: "PSA 10",
};

const saved: RecentComp = {
  key: quickCompIdentityKey(identity),
  identity,
  catalog: { id: "fixture", playerName: "Fixture Player", yearLabel: "2023", setBrand: "Topps Chrome", cardNumber: "306", sport: "Football", parallel: "Base" },
  payload: {
    median: 40,
    p25: 36,
    p75: 44,
    count: 1,
    source: "sample",
    fetchedAt: null,
    lowConfidence: true,
    sample: true,
    comps: [{ id: "c1", itemId: "i1", title: "Fixture sale", soldPrice: 40, soldDate: "2026-10-30", platform: "eBay", condition: "PSA 10", shipping: null, url: "" }],
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

describe("Quick Comp version row", () => {
  it("shows Version beside Grade, Base picked, and looks up the version tapped: once, with the grade still selected", async () => {
    win.localStorage.setItem(quickCompRecentKey("fixture-user"), JSON.stringify([saved]));
    const { QuickCompView, GRADE_SETTLE_MS } = await import("./quick-comp-view");
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(QuickCompView, { userId: "fixture-user" }));
    });
    const recent = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Fixture Player"));
    assert.ok(recent);
    await act(async () => recent.click());

    const group = () => host.querySelector('[data-quick-comp-versions] [role="radiogroup"]')!;
    const radio = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((button) => button.getAttribute("aria-label") === name || button.textContent === name)!;
    assert.ok(group());
    assert.equal(host.querySelector("[data-quick-comp-versions] p")?.textContent, "Version");
    const names = [...group().querySelectorAll('[role="radio"]')].map((button) => button.getAttribute("aria-label"));
    assert.deepEqual(names.slice(0, 3), ["Base", "Refractor", "X-Fractor"]);
    assert.equal(radio("Base").getAttribute("aria-checked"), "true");
    // Every chip is a 44px target with a name.
    for (const button of group().querySelectorAll('[role="radio"]')) assert.match(button.className, /min-h-11/);
    assert.equal(calls.length, 0);

    mock.timers.enable({ apis: ["setTimeout"] });
    const windowTimers = { set: win.setTimeout, clear: win.clearTimeout };
    Object.defineProperty(win, "setTimeout", { configurable: true, writable: true, value: globalThis.setTimeout });
    Object.defineProperty(win, "clearTimeout", { configurable: true, writable: true, value: globalThis.clearTimeout });
    try {
      // Refractor, then X-Fractor, then a grade, all inside the settle time: one lookup.
      await act(async () => radio("Refractor").click());
      mock.timers.tick(150);
      await act(async () => radio("X-Fractor").click());
      assert.equal(radio("X-Fractor").getAttribute("aria-checked"), "true");
      assert.equal(radio("Base").getAttribute("aria-checked"), "false");
      mock.timers.tick(150);
      await act(async () => radio("PSA 9").click());
      assert.equal(calls.length, 0);
      await act(async () => {
        mock.timers.tick(GRADE_SETTLE_MS);
      });
      assert.equal(calls.length, 1);
      const params = new URL(calls[0], "http://localhost").searchParams;
      assert.equal(params.get("parallel"), "X-Fractor");
      assert.equal(params.get("grade"), "PSA 9");
      assert.equal(params.get("number"), "306");
      // The card line and Add to collection follow the version.
      assert.match(host.textContent ?? "", /#306 X-Fractor · PSA 9/);
      const add = [...host.querySelectorAll("a")].find((link) => link.getAttribute("href")?.startsWith("/cards/new"));
      assert.equal(new URL(add!.getAttribute("href")!, "http://localhost").searchParams.get("parallel"), "X-Fractor");

      // Back to Base: its own lookup, with no parallel sent.
      await act(async () => radio("Base").click());
      await act(async () => {
        mock.timers.tick(GRADE_SETTLE_MS);
      });
      assert.equal(calls.length, 2);
      assert.equal(new URL(calls[1], "http://localhost").searchParams.has("parallel"), false);
      // Tapping the version already shown looks nothing up.
      await act(async () => radio("Base").click());
      await act(async () => {
        mock.timers.tick(5_000);
      });
      assert.equal(calls.length, 2);
    } finally {
      Object.defineProperty(win, "setTimeout", { configurable: true, writable: true, value: windowTimers.set });
      Object.defineProperty(win, "clearTimeout", { configurable: true, writable: true, value: windowTimers.clear });
      mock.timers.reset();
      act(() => root.unmount());
      host.remove();
    }
  });
});
