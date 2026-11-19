import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type Context, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import type { PublicCard } from "@/lib/social/types";
import type { CardValueResult } from "@/lib/value/types";

const require = createRequire(import.meta.url);
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: Context<AppRouterInstance | null>;
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const win = dom.window;
let reducedMotion = false;

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
expose("SVGElement", win.SVGElement);
expose("MouseEvent", win.MouseEvent);
expose("KeyboardEvent", win.KeyboardEvent);
expose("getComputedStyle", win.getComputedStyle.bind(win));
expose("requestAnimationFrame", (callback: FrameRequestCallback) => win.setTimeout(() => callback(Date.now()), 0));
expose("cancelAnimationFrame", (id: number) => win.clearTimeout(id));
expose("IS_REACT_ACT_ENVIRONMENT", true);
win.matchMedia = ((query: string) => ({
  matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof win.matchMedia;

// Loaded after the DOM globals above are in place.
const loaded = import("@/components/profile/spotlight-carousel");
let ProfileSpotlight: Awaited<typeof loaded>["ProfileSpotlight"];
let forgetSpotlightMemory: Awaited<typeof loaded>["forgetSpotlightMemory"];
before(async () => {
  ({ ProfileSpotlight, forgetSpotlightMemory } = await loaded);
});

const pushes: string[] = [];
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push(href: string) {
    pushes.push(href);
  },
  replace() {},
  prefetch() {},
  bfcacheId: "_b_0_",
} as AppRouterInstance;

const PHOTO = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/u1/a.jpg";

function card(id: string, partial: Partial<PublicCard> = {}): PublicCard {
  return {
    id,
    playerName: `Player ${id}`,
    year: 2018,
    setBrand: "Prizm",
    cardNumber: "280",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function ok(median: number): CardValueResult {
  return { status: "ok", median, low: median, high: median, nSales: 5, matchedAt: null };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(element: ReactElement): HTMLElement {
  host = win.document.createElement("div");
  win.document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, ...nextConfig.images } }, element),
      ),
    );
  });
  return host;
}

function spotlight(
  cards: PublicCard[],
  extra: { own?: boolean; loading?: boolean; values?: Map<string, CardValueResult> } = {},
): HTMLElement {
  return mount(
    createElement(ProfileSpotlight, {
      cards,
      loading: extra.loading ?? false,
      own: extra.own ?? false,
      username: "x",
      displayName: "Maya",
      values: extra.values ?? new Map(),
    }),
  );
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  reducedMotion = false;
  pushes.length = 0;
  forgetSpotlightMemory();
});

after(() => win.close());

const many = (count: number) => Array.from({ length: count }, (_, index) => card(`c${index}`));

describe("ProfileSpotlight: what shows for how many cards", () => {
  it("holds its place with a skeleton while the cards load", () => {
    const el = spotlight([], { loading: true });
    assert.ok(el.querySelector("[data-spotlight-skeleton]"));
    assert.equal(el.querySelector("[data-spotlight]"), null);
  });

  it("shows nothing on someone else's profile with no public cards", () => {
    const el = spotlight([]);
    assert.equal(el.innerHTML, "");
  });

  it("shows a slim prompt on your own profile with no public cards", () => {
    const el = spotlight([], { own: true });
    const prompt = el.querySelector("[data-spotlight-prompt]");
    assert.ok(prompt);
    assert.equal(el.querySelector("[data-spotlight]"), null);
    assert.equal(prompt!.textContent, "Mark a card public and it shows up hereAdd a card");
    assert.deepEqual(
      [...prompt!.querySelectorAll("a")].map((link) => link.getAttribute("href")),
      ["/collection", "/cards/new"],
    );
    // Purple outline, 44px targets.
    assert.match(prompt!.className, /border-violet-500/);
    for (const link of prompt!.querySelectorAll("a")) assert.match(link.className, /min-h-11/);
  });

  it("centers one card with no See all", () => {
    const el = spotlight([card("only")]);
    assert.equal(el.querySelectorAll(".spot-slide").length, 1);
    assert.equal(el.querySelector("[data-see-all]"), null);
    assert.ok(el.querySelector('[data-slide="0"][data-center]'));
    // The glow is still there behind it.
    assert.ok(el.querySelector(".spot-glow"));
  });

  it("makes two cards both slides, with See all at the end", () => {
    const el = spotlight([card("a"), card("b")]);
    assert.equal(el.querySelectorAll(".spot-slide").length, 3);
    const seeAll = el.querySelector("[data-see-all] a");
    assert.equal(seeAll?.getAttribute("href"), "/u/x/cards");
    assert.equal(seeAll?.getAttribute("aria-label"), "See all 2 cards");
    assert.equal(seeAll?.textContent, "See all 2");
    // The very last slide: only the row's end spacer comes after it.
    const slides = [...el.querySelectorAll(".spot-slide")];
    assert.equal(slides[slides.length - 1].hasAttribute("data-see-all"), true);
  });

  it("holds every card in the row but mounts real art only near the center", () => {
    const el = spotlight(many(200));
    assert.equal(el.querySelectorAll(".spot-slide").length, 201);
    assert.equal(el.querySelector("[data-see-all] a")?.getAttribute("aria-label"), "See all 200 cards");
    // Centered on the first card: it and the 3 after it are real. The rest are sized boxes.
    assert.equal(el.querySelectorAll("li[data-tile]").length, 4);
    assert.equal(el.querySelectorAll(".spot-far").length, 196);
    for (const far of el.querySelectorAll(".spot-far")) assert.equal(far.childElementCount, 0);
    // Its own layer only within two of center.
    assert.equal(el.querySelectorAll(".will-change-transform").length, 3);
  });
});

describe("SpotlightCarousel: taps and links", () => {
  it("links the centered card to its page and leaves side cards as buttons", () => {
    const el = spotlight([card("a/b"), card("c2"), card("c3")]);
    const centre = el.querySelector("[data-center]")!;
    const link = centre.querySelector("a")!;
    assert.equal(link.getAttribute("href"), "/u/x/cards/a%2Fb");
    // The tile marker is what shows the card page's skeleton at the tap (lib/ui/tap-feedback.ts).
    assert.equal(centre.getAttribute("data-tile"), "a/b");
    const side = el.querySelector('[data-slide="1"]')!;
    assert.equal(side.querySelector("a"), null, "a side card is not a link");
    const button = side.querySelector("button")!;
    assert.equal(button.getAttribute("aria-label"), "Show Player c2 2018 Prizm, Raw");
    const before = win.location.href;
    act(() => button.click());
    assert.equal(win.location.href, before);
    assert.deepEqual(pushes, [], "a side tap does not navigate");
  });

  it("gives every card the grid's accessible name", () => {
    const el = spotlight([card("a", { playerName: "Luka Dončić", grade: "PSA 10", conditionType: "graded" }), card("b")], {
      values: new Map([["a", ok(412)]]),
    });
    assert.equal(el.querySelector("[data-center] a")?.getAttribute("aria-label"), "Luka Dončić 2018 Prizm, PSA 10, Est. $412.00");
  });

  it("is a labelled carousel that keys can drive", () => {
    const el = spotlight([card("a"), card("b"), card("c")]);
    const section = el.querySelector("[data-spotlight]")!;
    assert.equal(section.getAttribute("aria-roledescription"), "carousel");
    assert.equal(section.getAttribute("aria-label"), "Maya's cards");
    const row = el.querySelector<HTMLElement>("[data-spot-row]")!;
    assert.equal(row.getAttribute("tabindex"), "0");
    assert.ok(el.querySelector("[aria-live='polite']"));
    act(() => {
      row.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    assert.deepEqual(pushes, ["/u/x/cards/a"], "Enter opens the centered card");
  });

  it("keeps the row positioned and out of pull to refresh", () => {
    const el = spotlight([card("a"), card("b")]);
    const row = el.querySelector("[data-spot-row]")!;
    assert.ok(row.hasAttribute("data-no-pull"));
    assert.match(row.className, /(^| )relative( |$)/);
    assert.match(row.className, /overflow-x-auto/);
  });
});

describe("SpotlightCarousel: the label", () => {
  it("shows the player and the set line, and a value only when it is real", () => {
    const el = spotlight(
      [card("a", { playerName: "Luka Dončić", parallel: "Silver", grade: "PSA 10", conditionType: "graded", photoDataUrl: PHOTO }), card("b")],
      { values: new Map([["a", ok(412)]]) },
    );
    const label = el.querySelector("[data-spot-label]")!;
    assert.ok(label.hasAttribute("data-on"));
    assert.equal(label.querySelector("p")?.textContent, "Luka Dončić");
    assert.match(label.textContent ?? "", /2018 · Prizm · Silver · PSA 10/);
    const price = label.querySelector("[data-spot-price]")!;
    assert.equal(price.textContent, "Est. $412.00");
    assert.match(price.className, /font-mono/);
    // Names are 600 at most, never bold.
    assert.match(label.querySelector("p")!.className, /font-semibold/);
    assert.doesNotMatch(label.innerHTML, /font-bold|font-extrabold/);
    // Only the centered card carries a label.
    assert.equal(el.querySelectorAll("[data-spot-label]").length, 1);
  });

  it("shows no value for a card without one, never $0", () => {
    const el = spotlight([card("a", { createdAt: "2020-01-01T00:00:00.000Z" }), card("b")]);
    const label = el.querySelector("[data-spot-label]")!;
    assert.equal(label.querySelector("[data-spot-price]"), null);
    assert.doesNotMatch(label.textContent ?? "", /\$|No value|No sales|updating/i);
  });

  it("marks a card that is open to offers", () => {
    const el = spotlight([card("a", { openToOffers: true }), card("b")]);
    assert.equal(el.querySelector("[data-spot-offers]")?.textContent, "Open to offers");
    act(() => root?.unmount());
    host?.remove();
    const plain = spotlight([card("a"), card("b")]);
    assert.equal(plain.querySelector("[data-spot-offers]"), null);
  });
});

describe("SpotlightCarousel: motion", () => {
  it("turns the spotlight effect on by default", () => {
    const el = spotlight([card("a"), card("b")]);
    const section = el.querySelector("[data-spotlight]")!;
    assert.match(section.className, /spot-fx/);
    assert.match(section.className, /spot-enter/);
    // The first visit to a profile hints once that the row scrolls.
    assert.match(section.className, /spot-nudge/);
  });

  it("is a plain snap row under reduced motion: no scale, blur, glow drift or entrance", () => {
    reducedMotion = true;
    const el = spotlight([card("a"), card("b")]);
    const section = el.querySelector("[data-spotlight]")!;
    assert.doesNotMatch(section.className, /spot-fx|spot-enter|spot-nudge/);
    // The label stays on the centered card.
    assert.ok(el.querySelector("[data-center] [data-spot-label][data-on]"));
  });

  it("does not hint with a single card", () => {
    const el = spotlight([card("only")]);
    assert.doesNotMatch(el.querySelector("[data-spotlight]")!.className, /spot-nudge/);
  });
});

describe("SpotlightCarousel: source rules", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const files = [
    "components/profile/spotlight-carousel.tsx",
    "components/profile/spotlight-styles.ts",
    "components/profile/profile-cards-view.tsx",
    "components/profile/profile-cards-skeleton.tsx",
    "components/profile/profile-share-button.tsx",
    "components/profile/profile-share-sheet-view.tsx",
    "components/profile/use-profile-cards.ts",
    "lib/profile/spotlight.ts",
  ];

  it("has no banned copy on the page", () => {
    const el = spotlight(many(6), { own: true });
    const text = `${el.textContent} ${[...el.querySelectorAll("[aria-label]")].map((node) => node.getAttribute("aria-label")).join(" ")}`;
    assert.doesNotMatch(text, /\b(best|AI|free|number one|flip|swipe|mail day)\b/i);
    // No section title over the row and no helper text.
    assert.equal(el.querySelector("h2, h3"), null);
  });

  it("uses brand purple only: no teal in the new files", () => {
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /#(?:34C1AE|2dd4bf|14b8a6|0d9488|5eead4|1f9e8c)\b/i, file);
      assert.doesNotMatch(source, /\b(?:teal|cyan|emerald)-\d{2,3}\b/, file);
    }
  });

  it("keeps the native scroll: mandatory snap, no forced stops, nothing that drives the scroll", () => {
    const css = read("components/profile/spotlight-styles.ts");
    assert.match(css, /scroll-snap-type: x mandatory/);
    assert.match(css, /scroll-snap-align: center/);
    assert.match(css, /scroll-snap-stop: normal/);
    assert.doesNotMatch(css, /scroll-snap-stop: always/);
    assert.match(css, /overscroll-behavior-x: contain/);
    assert.match(css, /touch-action: pan-x pan-y/);
    const view = read("components/profile/spotlight-carousel.tsx");
    // Passive listeners only, and never a preventDefault on a touch or wheel.
    assert.doesNotMatch(view, /touchmove|onTouchMove|onWheel=|passive: false/);
    assert.match(view, /row\.addEventListener\("scroll", onScroll, passive\)/);
    // Nothing per frame in React: the scroll handler sets state only on a change.
    assert.match(view, /if \(index !== s\.center\) \{/);
  });

  it("animates transforms and opacity, with the look on the scroll timeline", () => {
    const css = read("components/profile/spotlight-styles.ts");
    assert.match(css, /view-timeline: --spot inline/);
    assert.match(css, /@supports \(animation-timeline: view\(\)\)/);
    assert.match(css, /@supports not \(animation-timeline: view\(\)\)/);
    // Dim is a veil's opacity, never a brightness filter. No 3D and no rotation on cards.
    assert.doesNotMatch(css, /brightness\(|rotateX|rotateY|perspective/);
    // The glow layer carries no live blur filter, and no shadow ever animates.
    const glow = css.slice(css.indexOf(".spot-glow {"), css.indexOf("}", css.indexOf(".spot-glow {")));
    assert.doesNotMatch(glow, /filter/);
    for (const frames of css.matchAll(/@keyframes [\w-]+ \{[\s\S]*?\n\}/g)) assert.doesNotMatch(frames[0], /box-shadow/);
    // Reduced motion and reduced transparency are both honoured.
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  });

  it("lives outside profile-view.tsx, which stays free of sideways scrollers", () => {
    const profile = read("components/profile-view.tsx");
    assert.match(profile, /<ProfileSpotlight/);
    assert.doesNotMatch(profile, /overflow-x-auto|w-max|snap-x/);
    const view = read("components/profile/spotlight-carousel.tsx");
    assert.match(view, /data-no-pull\s+data-spot-row=""[\s\S]{0,200}className="spot-row relative flex overflow-x-auto/);
  });

  it("keeps the banner short so the centered card clears the tab bar, with a skeleton of the same height", () => {
    // scripts/profile-spotlight.e2e.mjs measures the card against the tab bar at 390x844.
    assert.match(read("components/profile-view.tsx"), /data-profile-banner="" className="relative h-28 /);
    assert.match(read("components/status.tsx"), /<div className="h-28 skeleton-shimmer" \/>/);
    assert.doesNotMatch(read("components/profile-view.tsx"), /relative h-40 /);
  });

  it("ticks with a selection haptic only from the reader's own swipe", () => {
    const view = read("components/profile/spotlight-carousel.tsx");
    assert.equal(view.match(/haptic\(/g)?.length, 1);
    assert.match(view, /if \(tick\.current\(index, performance\.now\(\), s\.user\)\) haptic\("select"\);/);
    assert.match(read("lib/ios/native.ts"), /if \(moment === "select"\) return playSelect\(\);/);
    assert.match(read("lib/ios/native.ts"), /await Haptics\.selectionStart\(\);\n\s*await Haptics\.selectionChanged\(\);\n\}/);
  });
});
