import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { addDays } from "@/lib/chart/range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { middleFifty } from "@/lib/comps/stats";
import { money } from "@/lib/format";
import { QUICK_COMP_API } from "@/lib/quick-comp/client";
import { loadedSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { quickCompRecentKey } from "@/lib/quick-comp/recent";
import type { CompListing } from "@/lib/types";

const { win, state } = installDom();
// The headline counts up otherwise: read the settled value.
state.reducedMotion = true;

// A fixture project, so search_cards goes through supabase-js and the mocked fetch below.
const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
// supabase-js opens a BroadcastChannel for auth in a browser, which would keep this file running.
const realBroadcastChannel = globalThis.BroadcastChannel;
Reflect.deleteProperty(globalThis, "BroadcastChannel");

type Row = { id: string; player: string; year_label: string; set_name: string; card_number: string; parallel: string; sport: string };

const LEBRON: Row[] = [
  { id: "r1", player: "LeBron James", year_label: "2003-04", set_name: "Topps Chrome", card_number: "111", parallel: "Base", sport: "Basketball" },
  { id: "r2", player: "LeBron James", year_label: "2003-04", set_name: "Topps", card_number: "221", parallel: "Base", sport: "Basketball" },
  { id: "r3", player: "LeBron James", year_label: "2003-04", set_name: "Upper Deck", card_number: "301", parallel: "Base", sport: "Basketball" },
];

const today = snapshotDateInNewYork();

/** 44 sales newest first on a rising card: the newest 30 near $12–15k, the older 14 near $7–9k. */
function lebronComps(): CompListing[] {
  return Array.from({ length: 44 }, (_, n) => ({
    id: `c${n}`,
    itemId: `i${n}`,
    title: `2003-04 Topps Chrome LeBron James #111 PSA 10 (${n})`,
    soldPrice: n < 30 ? 15_000 - n * 190 + 0.5 : 7_000 + ((n * 311) % 2_000) + 0.25,
    soldDate: addDays(today, -(n * 2 + 1)),
    platform: "eBay",
    condition: "PSA 10",
    shipping: null,
    url: `https://example.test/item/${n}`,
  }));
}

function serverBody(comps: CompListing[]) {
  const stats = middleFifty(comps.map((comp) => comp.soldPrice));
  return {
    comps,
    history: [],
    median: stats.median,
    p25: stats.p25,
    p75: stats.p75,
    count: comps.length,
    source: "trawl",
    cached: false,
    fetchedAt: null,
    query: "q",
    lowConfidence: false,
    sample: false,
    photo: null,
  };
}

const lookups: URL[] = [];
const searches: string[] = [];
/** Search responses wait here until a test lets them go, so an Enter can land first. */
let held: (() => void)[] = [];
let holdSearch = false;
let compsBody = serverBody(lebronComps().slice(0, 7));

const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/rpc/search_cards")) {
      const raw = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
      const q = String((JSON.parse(raw) as { q?: string }).q ?? "");
      searches.push(q);
      const rows = /lebron/i.test(q) ? LEBRON : [];
      const respond = () => Response.json(rows);
      if (!holdSearch) return respond();
      return new Promise<Response>((resolve) => held.push(() => resolve(respond())));
    }
    if (url.startsWith(QUICK_COMP_API)) {
      lookups.push(new URL(url, "http://localhost"));
      return Response.json(compsBody);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(async () => {
  // supabase-js keeps a token refresh timer: stop it so the file can exit.
  await loadedSupabaseBrowser()?.auth.stopAutoRefresh();
  globalThis.fetch = realFetch;
  globalThis.BroadcastChannel = realBroadcastChannel;
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.key;
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, label: string) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => {
      await wait(20);
    });
  }
  assert.fail(`timed out waiting for ${label}`);
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(userId = "fixture-user") {
  const { QuickCompView } = await import("./quick-comp-view");
  const { createRoot } = await import("react-dom/client");
  host = win.document.createElement("div");
  win.document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(QuickCompView, { userId }));
  });
  return host;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  lookups.length = 0;
  searches.length = 0;
  held = [];
  holdSearch = false;
  compsBody = serverBody(lebronComps().slice(0, 7));
  win.localStorage.clear();
});

const input = () => host!.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => [...host!.querySelectorAll<HTMLElement>('[role="option"]')];
const radio = (name: string) =>
  [...host!.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((button) => button.textContent === name);
const manualForm = () => host!.querySelector('[data-quick-comp-state="manual"]');
const ready = () => options().some((option) => option.textContent?.includes("LeBron James"));

async function type(text: string) {
  const field = input();
  await act(async () => {
    field.focus();
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
    setter.call(field, text);
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

async function key(name: string) {
  await act(async () => {
    input().dispatchEvent(new win.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });
}

async function tapRow(index: number) {
  await act(async () => {
    options()[index].querySelector("button")!.click();
  });
}

async function lookedUp(count: number) {
  await until(() => lookups.length >= count, `${count} lookup(s)`);
  await until(() => !!host!.querySelector('[data-quick-comp-state="result"]'), "result");
  // A pick blurs the search, which closes the list 120ms later: let that pass before typing again.
  await act(async () => {
    await wait(150);
  });
}

describe("Quick Comp: a grade typed in the search", () => {
  it("looks up PSA 9 once and checks its chip", async () => {
    await mount();
    await type("lebron 2003 chrome psa 9");
    await until(ready, "suggestions");
    assert.equal(lookups.length, 0, "typing never looks up");
    await tapRow(0);
    await lookedUp(1);
    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].searchParams.get("grade"), "PSA 9");
    assert.equal(lookups[0].searchParams.get("set"), "Topps Chrome");
    assert.equal(radio("PSA 9")?.getAttribute("aria-checked"), "true");
    assert.equal(radio("PSA 10")?.getAttribute("aria-checked"), "false");
    // The catalog read the text as typed: search_cards skips grade words itself.
    assert.match(searches.at(-1) ?? "", /psa 9/i);
  });

  for (const [text, grade] of [
    ["lebron bgs 9.5", "BGS 9.5"],
    ["lebron raw", "Raw"],
  ] as const) {
    it(`${text} → ${grade} checked`, async () => {
      await mount();
      await type(text);
      await until(ready, "suggestions");
      await tapRow(0);
      await lookedUp(1);
      assert.equal(lookups.length, 1);
      assert.equal(lookups[0].searchParams.get("grade"), grade);
      assert.equal(radio(grade)?.getAttribute("aria-checked"), "true");
    });
  }

  it("cgc 8.5 opens Other with CGC and 8.5", async () => {
    await mount();
    await type("lebron cgc 8.5");
    await until(ready, "suggestions");
    await tapRow(0);
    await lookedUp(1);
    assert.equal(lookups[0].searchParams.get("grade"), "CGC 8.5");
    const selects = [...host!.querySelectorAll<HTMLSelectElement>("select")];
    assert.ok(selects.length >= 2, "Other's selects are open");
    assert.deepEqual(
      selects.map((select) => select.value),
      ["CGC", "8.5"],
    );
  });
});

describe("Quick Comp: Enter searches", () => {
  it("a fast Enter waits for the suggestions, then looks up row 0 once", async () => {
    holdSearch = true;
    await mount();
    await type("lebron 2003 chrome");
    await key("Enter");
    assert.equal(lookups.length, 0);
    assert.equal(manualForm(), null);
    await until(() => held.length > 0, "search request");
    await act(async () => {
      held.splice(0).forEach((go) => go());
    });
    await lookedUp(1);
    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].searchParams.get("set"), "Topps Chrome");
    assert.equal(lookups[0].searchParams.get("grade"), "PSA 10");
    assert.equal(manualForm(), null);

    // A stale Enter never fires later.
    await type("lebron 2003 topps");
    await key("Enter");
    await type("lebron 2003 upper");
    await until(() => searches.some((q) => /upper/.test(q)), "the newest search");
    await act(async () => {
      held.splice(0).forEach((go) => go());
    });
    await until(ready, "new suggestions");
    await act(async () => {
      await wait(100);
    });
    assert.equal(lookups.length, 1);
  });

  it("with suggestions ready, Enter looks up row 0; ArrowDown then Enter looks up row 1", async () => {
    await mount();
    await type("lebron 2003");
    await until(ready, "suggestions");
    assert.equal(input().getAttribute("aria-activedescendant"), options()[0].id);
    const first = options()[0].textContent ?? "";
    await key("Enter");
    await lookedUp(1);
    assert.equal(lookups.length, 1);
    assert.ok(first.includes(`#${lookups[0].searchParams.get("number")}`), first);

    await type("lebron 2003");
    await until(ready, "suggestions again");
    await key("ArrowDown");
    assert.equal(input().getAttribute("aria-activedescendant"), options()[1].id);
    assert.equal(options()[1].getAttribute("aria-selected"), "true");
    assert.equal(options()[0].getAttribute("aria-selected"), "false");
    const second = options()[1].textContent ?? "";
    await key("Enter");
    await lookedUp(2);
    assert.equal(lookups.length, 2);
    assert.ok(second.includes(`#${lookups[1].searchParams.get("number")}`), second);
    assert.notEqual(lookups[0].searchParams.get("number"), lookups[1].searchParams.get("number"));
  });

  it("on a miss, Enter keeps the list; only the manual option opens the form, without the grade", async () => {
    await mount();
    await type("zzfixture psa 9");
    await until(() => !!host!.querySelector('[data-quick-comp-state="no-match"]'), "no match");
    // Nothing is selected until the user arrows.
    assert.ok(options().every((option) => option.getAttribute("aria-selected") === "false"));
    assert.equal(input().getAttribute("aria-activedescendant"), null);
    await key("Enter");
    assert.ok(host!.querySelector('[data-quick-comp-state="no-match"]'));
    assert.equal(manualForm(), null);
    assert.equal(lookups.length, 0);

    await key("ArrowDown");
    const manual = options().at(-1)!;
    assert.equal(manual.getAttribute("aria-selected"), "true");
    assert.equal(input().getAttribute("aria-activedescendant"), manual.id);
    await key("Enter");
    assert.ok(manualForm());
    const player = manualForm()!.querySelector<HTMLInputElement>("input")!;
    assert.equal(player.value, "zzfixture");
    assert.equal(lookups.length, 0);
  });

  it("the standalone manual link still opens the form", async () => {
    await mount();
    const link = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Can't find it? Enter player and year");
    assert.ok(link);
    await act(async () => link.click());
    assert.ok(manualForm());
  });

  it("under 2 characters, Enter does nothing", async () => {
    await mount();
    await type("l");
    await key("Enter");
    assert.equal(manualForm(), null);
    assert.equal(searches.length, 0);
    assert.equal(lookups.length, 0);
  });
});

describe("Quick Comp: the headline matches the list", () => {
  it("44 sales: the headline, caption and rows are the newest 30, live and from Recent", async () => {
    compsBody = serverBody(lebronComps());
    const listed = lebronComps().slice(0, 30);
    const expected = money(middleFifty(listed.map((comp) => comp.soldPrice)).median!);
    assert.notEqual(expected, money(compsBody.median!));

    await mount();
    await type("lebron 2003 chrome");
    await until(ready, "suggestions");
    await key("Enter");
    await lookedUp(1);
    const value = () => host!.querySelector("[data-comp-value]")?.textContent ?? "";
    await until(() => value() !== "", "headline");
    assert.equal(value(), expected);
    assert.match(host!.textContent ?? "", /Median sold price/);
    assert.match(host!.textContent ?? "", /Based on 30 sales/);
    assert.match(host!.querySelector('[aria-live="polite"]')?.textContent ?? "", new RegExp(`PSA 10: \\${expected} from 30 sales`));

    const list = host!.querySelector('[aria-labelledby="quick-comp-sales"]')!;
    await until(() => list.querySelectorAll("li").length > 0, "sales list");
    for (let i = 0; i < 10; i++) {
      const more = [...list.querySelectorAll("button")].find((button) => button.textContent === "Show more");
      if (!more) break;
      await act(async () => more.click());
    }
    assert.equal(list.querySelectorAll("li").length, 30);

    // Saved on this device with the same numbers.
    const saved = JSON.parse(win.localStorage.getItem(quickCompRecentKey("fixture-user")) ?? "[]");
    assert.equal(saved[0].payload.count, 30);
    act(() => root!.unmount());
    host!.remove();

    // Opening it again from Recent shows the same value, with no lookup.
    await mount();
    const recent = [...host!.querySelectorAll("button")].find((button) => button.textContent?.includes("LeBron James"));
    assert.ok(recent);
    assert.match(recent.textContent ?? "", new RegExp(`\\${expected}`));
    await act(async () => recent.click());
    await until(() => value() !== "", "saved headline");
    assert.equal(value(), expected);
    assert.equal(lookups.length, 1);
  });
});
