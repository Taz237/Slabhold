import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { QUICK_COMP_API } from "@/lib/quick-comp/client";
import { PLAYER_FEED_API, PLAYER_SUGGEST_API, type PlayerSale } from "@/lib/quick-comp/player-feed";
import { loadedSupabaseBrowser } from "@/lib/supabase/browser-lazy";

const { win, state } = installDom();
state.reducedMotion = true;

const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
const realBroadcastChannel = globalThis.BroadcastChannel;
Reflect.deleteProperty(globalThis, "BroadcastChannel");

const PLAYER = "Fixture Acuff Jr.";

function sale(id: string, extra: Partial<PlayerSale>): PlayerSale {
  return { id, title: id, price: 10, soldAt: "2026-11-10T00:00:00Z", photo: null, grade: "Raw", company: "raw", year: null, set: null, number: null, auto: false, run: null, parallel: null, ...extra };
}

const SALES: PlayerSale[] = [
  sale("2025 Bowman Chrome Fixture Acuff Jr. Auto Gold Refractor /50 PSA 10", {
    price: 900,
    soldAt: "2026-11-12T00:00:00Z",
    grade: "PSA 10",
    company: "PSA",
    year: "2025",
    set: "Bowman Chrome",
    number: "BCP-12",
    auto: true,
    run: 50,
    parallel: "Gold Refractor",
    photo: "https://i.ebayimg.com/images/g/a/s-l1600.jpg",
  }),
  sale("Fixture Acuff Jr. Prizm rookie", { price: 40, soldAt: "2026-11-11T00:00:00Z", set: "Prizm" }),
  sale("2025-26 Prizm Fixture Acuff Jr. Silver", { price: 75, soldAt: "2026-11-01T00:00:00Z", year: "2025-26", set: "Prizm", parallel: "Silver" }),
];

const lookups: URL[] = [];
const feeds: URL[] = [];
let holdLookup = false;
let releaseLookup: (() => void) | null = null;
/** Suggestion and feed answers wait here when a test holds them. */
let holdSuggest = false;
let heldSuggest: (() => void)[] = [];
let holdFeed = false;
let heldFeed: (() => void)[] = [];
let feedLimited = false;

function compsBody() {
  return { comps: [], history: [], median: null, p25: null, p75: null, count: 0, source: "trawl", cached: false, fetchedAt: null, query: "q", lowConfidence: false, sample: false, photo: null };
}

const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/rpc/search_cards")) return Response.json([]);
    if (url.startsWith(PLAYER_SUGGEST_API)) {
      const q = new URL(url, "http://localhost").searchParams.get("q") ?? "";
      const respond = () =>
        /acuff/i.test(q)
          ? Response.json({
              suggestions: [
                { label: PLAYER, player: PLAYER },
                { label: "Acuff auto", player: PLAYER, filter: { auto: true } },
                { label: "Acuff Prizm", player: PLAYER, filter: { set: "Prizm" } },
              ],
            })
          : /cooper/i.test(q)
            ? Response.json({ suggestions: [{ label: "Fixture Cooper", player: "Fixture Cooper" }] })
            : Response.json({ suggestions: [] });
      if (!holdSuggest) return respond();
      return new Promise<Response>((resolve) => heldSuggest.push(() => resolve(respond())));
    }
    if (url.startsWith(PLAYER_FEED_API)) {
      feeds.push(new URL(url, "http://localhost"));
      const respond = () =>
        feedLimited
          ? Response.json({ error: "x", reason: "daily", resetAt: "2026-11-18T00:00:00Z" }, { status: 429 })
          : Response.json({ player: PLAYER, sales: SALES, fetchedAt: null });
      if (!holdFeed) return respond();
      return new Promise<Response>((resolve) => heldFeed.push(() => resolve(respond())));
    }
    // The comp lookup only: /api/quick-comp/suggest and /player are their own routes.
    if (url.startsWith(`${QUICK_COMP_API}?`)) {
      lookups.push(new URL(url, "http://localhost"));
      if (!holdLookup) return Response.json(compsBody());
      return new Promise<Response>((resolve) => (releaseLookup = () => resolve(Response.json(compsBody()))));
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(async () => {
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

async function mount() {
  const { QuickCompView } = await import("./quick-comp-view");
  const { createRoot } = await import("react-dom/client");
  host = win.document.createElement("div");
  win.document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(QuickCompView, { userId: "fixture-user" }));
  });
}

afterEach(async () => {
  // A pick blurs the search, which closes the list 120ms later: let it land while mounted.
  await act(async () => {
    await wait(150);
  });
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  lookups.length = 0;
  feeds.length = 0;
  holdLookup = false;
  releaseLookup = null;
  holdSuggest = false;
  heldSuggest = [];
  holdFeed = false;
  heldFeed = [];
  feedLimited = false;
  win.localStorage.clear();
});

const setter = () => Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
async function fill(field: HTMLInputElement, text: string) {
  await act(async () => {
    field.focus();
    setter().call(field, text);
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}
const search = () => host!.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => [...host!.querySelectorAll<HTMLElement>('[role="option"]')];
const form = () => host!.querySelector<HTMLFormElement>('[data-quick-comp-state="manual"]');
const button = (text: string, scope: ParentNode = host!) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text);
const field = (name: string) => {
  const label = [...form()!.querySelectorAll("label")].find((item) => item.textContent?.startsWith(name))!;
  return (label.querySelector("input") ?? win.document.getElementById(label.getAttribute("for")!)) as HTMLInputElement;
};

describe("Quick Comp manual form: the year bug", () => {
  it("a year typed in the search lands in Year, and one tap sends once with a spinner", async () => {
    await mount();
    await fill(search(), "Fixture Player 2023");
    await until(() => options().length > 0, "list");
    await act(async () => options().at(-1)!.querySelector("button")!.click());
    assert.ok(form());
    assert.equal(field("Player").value, "Fixture Player");
    assert.equal(field("Year").value, "2023");
    assert.notEqual(field("Year").getAttribute("inputmode"), "numeric", "the iPhone number pad has no dash");

    holdLookup = true;
    await act(async () => button("Check sold prices", form()!)!.click());
    await until(() => lookups.length === 1, "lookup");
    const busy = button("Checking sold prices", form()!);
    assert.ok(busy, "the button says it's working");
    assert.equal(busy.disabled, true);
    assert.ok(busy.querySelector("[data-manual-spinner]"), "with a spinner");
    await act(async () => form()!.requestSubmit());
    await act(async () => busy.click());
    assert.equal(lookups.length, 1, "no double submit");
    assert.equal(lookups[0].searchParams.get("year"), "2023");
    assert.equal(lookups[0].searchParams.get("player"), "Fixture Player");
    await act(async () => releaseLookup!());
    await until(() => form() === null, "form closes once the lookup lands");
  });

  it("2023 typed with a smart dash or full-width digits still sends", async () => {
    await mount();
    await act(async () => button("Can't find it? Enter player and year")!.click());
    await fill(field("Player"), "Fixture Player");
    await fill(field("Year"), "２０２３–24");
    await act(async () => button("Check sold prices", form()!)!.click());
    await until(() => lookups.length === 1, "lookup");
    assert.equal(lookups[0].searchParams.get("year"), "2023-24");
  });

  it("a wrong year says so under the field at once, and nothing sends", async () => {
    await mount();
    await act(async () => button("Can't find it? Enter player and year")!.click());
    await fill(field("Player"), "Fixture Player");
    await act(async () => button("Check sold prices", form()!)!.click());
    const year = field("Year");
    assert.equal(year.getAttribute("aria-invalid"), "true");
    const error = win.document.getElementById(year.getAttribute("aria-describedby")!)!;
    assert.equal(error.textContent, "Add the year");
    assert.equal(win.document.activeElement, year, "the tap lands you on the year");
    await fill(year, "20234");
    assert.equal(win.document.getElementById(year.getAttribute("aria-describedby")!)!.textContent, "Use a year like 2023 or 2023-24");
    assert.equal(lookups.length, 0);
  });
});

describe("Quick Comp player mode", () => {
  it("darius-style typing suggests the player and phrases; a phrase opens the feed with its chip on", async () => {
    await mount();
    await fill(search(), "acuff");
    await until(() => options().some((option) => option.textContent?.includes("Acuff auto")), "player suggestions");
    assert.match(options()[0].textContent ?? "", /Fixture Acuff Jr\./);
    assert.equal(feeds.length, 0, "typing never searches sales");
    await act(async () => options()[1].querySelector("button")!.click());
    await until(() => !!host!.querySelector("[data-player-feed] ul li"), "feed");
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].searchParams.get("q"), PLAYER);
    const auto = button("Auto", host!.querySelector('[aria-label="Filters"]')!)!;
    assert.equal(auto.getAttribute("aria-pressed"), "true");
    assert.equal(host!.querySelectorAll("[data-player-feed] ul li").length, 1);
    await act(async () => auto.click());
    assert.equal(host!.querySelectorAll("[data-player-feed] ul li").length, 3);
  });

  it("Enter on a name opens their sales; sort, grid and the sheet's Comp this card", async () => {
    await mount();
    await fill(search(), "acuff");
    await until(() => options().some((option) => option.hasAttribute("data-player-option")), "player suggestions");
    await act(async () => {
      search().dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await until(() => !!host!.querySelector("[data-player-feed] ul li"), "feed");
    const rows = () => [...host!.querySelectorAll("[data-player-feed] ul li button")].map((row) => row.getAttribute("aria-label") ?? "");
    assert.match(rows()[0], /Bowman Chrome/, "newest first");
    await act(async () => button("Lowest")!.click());
    assert.match(rows()[0], /\$40/);
    await act(async () => host!.querySelector<HTMLButtonElement>('[aria-label="Grid view"]')!.click());
    assert.equal(host!.querySelector('[aria-label="Grid view"]')!.getAttribute("aria-pressed"), "true");
    assert.ok(host!.querySelector("[data-player-feed] ul.grid"));

    await act(async () => button("Highest")!.click());
    await act(async () => host!.querySelector<HTMLButtonElement>("[data-player-feed] ul li button")!.click());
    const sheet = host!.querySelector('[role="dialog"]')!;
    assert.ok(sheet);
    assert.match(sheet.textContent ?? "", /Gold Refractor/);
    assert.ok(sheet.querySelector('img[src="https://i.ebayimg.com/images/g/a/s-l1600.jpg"]'));
    await act(async () => button("Comp this card", sheet)!.click());
    await until(() => lookups.length === 1, "comp");
    const params = lookups[0].searchParams;
    assert.equal(params.get("player"), PLAYER);
    assert.equal(params.get("year"), "2025");
    assert.equal(params.get("set"), "Bowman Chrome");
    assert.equal(params.get("number"), "BCP-12");
    assert.equal(params.get("parallel"), "Gold Refractor");
    assert.equal(params.get("run"), "50");
    assert.equal(params.get("grade"), "PSA 10");
    assert.equal(host!.querySelector('[role="dialog"]'), null);
    // Back to the sales without a new search.
    const back = button(`${PLAYER} sales`)!;
    await act(async () => back.click());
    await until(() => !!host!.querySelector("[data-player-feed] ul li"), "feed again");
    assert.equal(feeds.length, 1);
  });

  it("a sale with no year printed opens the form to ask, keeping its version and never claiming Base's", async () => {
    await mount();
    await fill(search(), "acuff");
    await until(() => options().some((option) => option.hasAttribute("data-player-option")), "player suggestions");
    await act(async () => options()[0].querySelector("button")!.click());
    await until(() => !!host!.querySelector("[data-player-feed] ul li"), "feed");
    const row = [...host!.querySelectorAll<HTMLButtonElement>("[data-player-feed] ul li button")].find((item) => item.getAttribute("aria-label")?.startsWith("Fixture Acuff Jr. Prizm rookie"))!;
    await act(async () => row.click());
    const sheet = host!.querySelector('[role="dialog"]')!;
    assert.doesNotMatch(sheet.textContent ?? "", /Base|Silver/);
    await act(async () => button("Comp this card", sheet)!.click());
    assert.ok(form());
    assert.equal(field("Player").value, PLAYER);
    assert.equal(field("Year").value, "");
    assert.equal(field("Set").value, "Prizm");
    assert.equal(lookups.length, 0);
  });
});

const playerOptions = () => options().filter((option) => option.hasAttribute("data-player-option"));
const enter = () =>
  act(async () => {
    search().dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });

describe("Quick Comp player mode: stale suggestions", () => {
  it("the old names go the moment the text changes; Enter or a tap can't open them", async () => {
    await mount();
    await fill(search(), "acuff");
    await until(() => playerOptions().length > 0, "acuff suggestions");
    holdSuggest = true;
    await fill(search(), "cooper");
    assert.equal(playerOptions().length, 0, "no Acuff left on screen for cooper");
    await enter();
    // Let the 250ms suggestion wait pass: the cooper answer is still held.
    await act(async () => {
      await wait(300);
    });
    assert.equal(playerOptions().length, 0);
    await enter();
    assert.equal(feeds.length, 0, "never opened a stale player");
    for (const release of heldSuggest) release();
    await until(() => playerOptions().some((option) => option.textContent?.includes("Fixture Cooper")), "cooper suggestions");
    assert.ok(!playerOptions().some((option) => option.textContent?.includes("Acuff")));
  });

  it("an answer for older text never shows, even if it lands late", async () => {
    await mount();
    holdSuggest = true;
    await fill(search(), "acuff");
    await act(async () => {
      await wait(300);
    });
    assert.equal(heldSuggest.length, 1);
    await fill(search(), "acuff 2025");
    for (const release of heldSuggest) release();
    await act(async () => {
      await wait(60);
    });
    assert.equal(playerOptions().length, 0, "a card search shows cards only");
    await enter();
    assert.equal(feeds.length, 0);
  });

  it("a different phrase for the same player goes through while it loads, with no second search", async () => {
    await mount();
    holdFeed = true;
    await fill(search(), "acuff");
    await until(() => playerOptions().length === 3, "suggestions");
    await act(async () => playerOptions()[1].querySelector("button")!.click()); // Acuff auto
    assert.equal(feeds.length, 1);
    await act(async () => {
      await wait(150);
    });
    await fill(search(), "acuff");
    await until(() => playerOptions().length === 3, "suggestions again");
    await act(async () => playerOptions()[2].querySelector("button")!.click()); // Acuff Prizm
    assert.equal(feeds.length, 1, "same player: no second search, no second cap");
    for (const release of heldFeed) release();
    await until(() => !!host!.querySelector('[data-player-feed] ul[aria-label] li'), "feed");
    const chips = host!.querySelector('[aria-label="Filters"]')!;
    assert.equal(button("Prizm", chips)!.getAttribute("aria-pressed"), "true");
    assert.equal(button("Auto", chips)!.getAttribute("aria-pressed"), "false");
    assert.equal(host!.querySelectorAll('[data-player-feed] ul[aria-label] li').length, 2);
  });
});

describe("Quick Comp player mode: its own cap", () => {
  it("used up: a friendly note that says Quick Comp still works", async () => {
    feedLimited = true;
    await mount();
    await fill(search(), "acuff");
    await until(() => playerOptions().length > 0, "suggestions");
    await act(async () => playerOptions()[0].querySelector("button")!.click());
    await until(() => !!host!.querySelector('[data-quick-comp-state="player-limit"]'), "cap note");
    const note = host!.querySelector('[data-quick-comp-state="player-limit"]')!.textContent ?? "";
    assert.match(note, /You've looked up 5 players today/);
    assert.match(note, /Quick Comp still works/);
    assert.doesNotMatch(note, /today's comps/);
  });
});
