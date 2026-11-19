import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { FIXTURE_FOUNDER, fixtureCard, htmlText as text, withLandingContexts } from "@/lib/test/landing-fixtures";

const { win, state } = installDom();

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  state.reducedMotion = false;
});

async function landingHtml(founder: unknown = null) {
  const { LandingPage } = await import("@/components/landing-page");
  return renderToStaticMarkup(
    withLandingContexts(createElement(LandingPage, { founder: founder as never, media: EMPTY_MEDIA }), "next=/leaderboard"),
  );
}

/** Every landing source a visitor's words can come from. */
const COPY_FILES = [
  "components/landing-page.tsx",
  "components/landing/glass-hero.tsx",
  "components/landing/sections.tsx",
  "components/landing/quick-comp-section.tsx",
  "components/landing/feature-clip.tsx",
  "components/landing/feature-clip-player.tsx",
  "components/landing/glass-island.tsx",
];

describe("landing page", () => {
  it("leads with the headline, Open Slabhold and Log in, carrying next, and closes on Join Slabhold", async () => {
    const html = await landingHtml();
    assert.match(text(html), /Scan it\. Know the exact version\./);
    assert.match(html, /href="\/signup\?next=%2Fleaderboard"[^>]*>Open Slabhold</);
    assert.match(html, /href="\/login\?next=%2Fleaderboard"[^>]*>Log in</);
    assert.match(text(html), /Join Slabhold/);
    assert.equal((html.match(/>Open Slabhold</g) ?? []).length, 2, "the hero and the closing slab");
    assert.equal((html.match(/href="\/signup\?next=%2Fleaderboard"/g) ?? []).length, 2);
    assert.ok(html.indexOf("<h1") < html.indexOf(">Open Slabhold<"));
    assert.ok(html.indexOf(">Open Slabhold<") < html.indexOf(">Join Slabhold<"));
    assert.match(html, /data-glass-hero=/);
  });

  it("makes no made-up claims and doesn't sell", async () => {
    const all = [await landingHtml(FIXTURE_FOUNDER), ...COPY_FILES.map(read)].join("\n");
    assert.doesNotMatch(all, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i);
    assert.doesNotMatch(all, /join (thousands|\d)/i);
    assert.doesNotMatch(all, /marketplace|buy now|for sale|sell your|asking price|\bask\b/i);
    assert.doesNotMatch(all, /pok[eé]mon|tcg|mail day/i);
    assert.doesNotMatch(all, /eBay data|eBay logo/i);
  });

  it("draws the sections on the server and loads only the Quick Comp panel's code later, once idle", () => {
    const landing = read("components/landing-page.tsx");
    assert.doesNotMatch(landing, /^"use client";/m);
    assert.doesNotMatch(landing, /\.png|\.jpe?g/);
    const sections = [...landing.matchAll(/^ {8}<([A-Z]\w+)/gm)].map((match) => match[1]);
    assert.deepEqual(sections, [
      "GlassHero",
      "ScanSection",
      "EdgeSerialSection",
      "ParallelsSection",
      "CollectionSection",
      "ArenaSection",
      "PullsWall",
      "HitRevealsSection",
      "QuickCompSection",
      "JoinSection",
    ]);
    const quickComp = read("components/landing/quick-comp-section.tsx");
    assert.match(quickComp, /lazy\(\(\) =>[\s\S]*afterFirstIdle\(resolve\)[\s\S]*import\("@\/components\/landing\/showcase\/quick-comp-demo"\)/);
    assert.match(quickComp, /<Suspense fallback=\{<div aria-hidden className="skeleton-shimmer /, "a skeleton, never a spinner");
    for (const file of [...COPY_FILES, "components/landing/landing-links.tsx"]) {
      assert.doesNotMatch(read(file), /from "next\/dynamic"/, file);
      assert.doesNotMatch(read(file), /from "(framer-motion|motion|gsap|lottie|swiper|embla)/, file);
    }
  });

  it("no longer has the old demos: no carousel, no chapters, no samples", async () => {
    const html = await landingHtml(FIXTURE_FOUNDER);
    assert.doesNotMatch(html, /data-chapter|data-carousel-panels|role="tablist"|aria-roledescription="slide"|Choose a panel/);
    assert.doesNotMatch(html, /data-phone-frame|data-hero-slabs|data-founder-note|data-scan-demo|data-sold-panel/);
    assert.doesNotMatch(text(html), /Sample|Replay|Everything in one app|See the pop-up/i);
    for (const gone of [
      "components/landing/feature-panels.tsx",
      "components/landing/founder-note.tsx",
      "components/landing/hero-phone.tsx",
      "components/landing/hero-slabs.tsx",
      "components/landing/showcase/scan-demo.tsx",
      "components/landing/showcase/scan-result-demo.tsx",
      "components/landing/showcase/sold-panel.tsx",
      "components/landing/showcase/timeline-demo.tsx",
      "components/landing/showcase/leaderboard-demo.tsx",
      "components/landing/showcase/graphs-demo.tsx",
      "components/landing/showcase/badge-popup.tsx",
      "public/landing/sample-raw-card.svg",
      "public/landing/2.png",
    ]) {
      assert.equal(existsSync(join(process.cwd(), gone)), false, gone);
    }
  });

  it("uses brand purple, not teal, for the accent and an available username", () => {
    const auth = read("components/auth-form.tsx");
    for (const source of [read("app/landing.css"), auth, ...COPY_FILES.map(read)]) assert.doesNotMatch(source, /#34C1AE|#1f9e8c/i);
    assert.match(read("app/landing.css"), /\.lg-h1-accent \{\s*color: var\(--accent\);/);
    assert.match(auth, /text-\[#7C3AED\] dark:text-\[#A78BFA\]">\s*@\{check\.value\} is available/);
  });

  it("leaves none of the old landing motion behind in the app's stylesheet", () => {
    const css = read("app/globals.css");
    assert.doesNotMatch(css, /landing-float|landing-reveal|landing-tilt|data-scan-demo|@keyframes scan-/);
    assert.equal(existsSync(join(process.cwd(), "components/landing/phone-frame.tsx")), false);
  });
});

describe("landing founder touch", () => {
  it("shows an empty glass slab, never a stand-in, while there are no real cards", async () => {
    const html = await landingHtml();
    assert.match(html, /data-glass-hero="empty"/);
    assert.doesNotMatch(html, /card-photos/);
    assert.doesNotMatch(text(html), /Sample slabs|Your grail/);
  });

  it("draws the real cards on first paint when the server sends the showcase, naming no one", async () => {
    const html = await landingHtml(FIXTURE_FOUNDER);
    assert.match(html, /data-glass-hero="card"/);
    assert.match(html, /data-card-grid/);
    assert.doesNotMatch(html, /From the founder|Follow on Slabhold|donnietaz|Donnie/i);
    // Hero card, then the three in the collection grid.
    const photos = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => decodeURIComponent(match[1])).filter((src) => src.includes("card-photos"));
    assert.equal(photos.length, 4);
    assert.ok(photos.every((src) => src.startsWith("/_next/image?url=") && src.includes("/card-photos/owner/")));
    assert.match(photos[0], /owner\/a\.jpg/, "the top card is the hero's");
  });

  it("keeps the empty slab when the server showcase is empty, with no client fetch", async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}");
    }) as typeof fetch;
    try {
      const { LandingPage } = await import("@/components/landing-page");
      const { createRoot } = await import("react-dom/client");
      const host = win.document.createElement("div");
      win.document.body.appendChild(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(withLandingContexts(createElement(LandingPage, { founder: { cards: [] }, media: EMPTY_MEDIA })));
      });
      cleanup = () => {
        act(() => root.unmount());
        host.remove();
      };
      assert.equal(host.querySelector("[data-glass-hero]")?.getAttribute("data-glass-hero"), "empty");
      assert.equal(host.querySelector("[data-card-grid]"), null);
      assert.deepEqual(calls, [], "the page fetches nothing");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("loads the showcase on the server through the hour cache and preloads the hero photo", () => {
    const page = read("app/(app)/page.tsx");
    assert.match(read("lib/landing/founder-page.ts"), /cachedFounderShowcase\(\)/);
    assert.match(read("app/welcome/page.tsx"), /await welcomeFounderShowcase\(\)/);
    assert.match(page, /const landing = <LandingPage founder=\{founder\} comp=\{comp\} pulls=\{pulls\} \/>;/);
    assert.match(page, /<HomeGate landing=\{landing\} \/>/);
    const loader = read("lib/landing/founder-load.ts");
    assert.match(loader, /unstable_cache\(\s*loadFounderShowcase,\s*\["landing-founder"\],\s*\{\s*revalidate: 3600/);
    assert.match(read("app/api/landing/founder/route.ts"), /founderResponse\(cachedFounderShowcase\)/);
    assert.doesNotMatch(read("components/app-shell.tsx"), /<LandingPage/);
    assert.match(read("components/landing/glass-hero.tsx"), /preload\(props\.src, \{ as: "image"/);
  });

  it("asks for the hero card's photo first and loads the grid's photos lazily", async () => {
    const html = await landingHtml(FIXTURE_FOUNDER);
    const imgs = [...html.matchAll(/<img[^>]+>/g)].map((match) => match[0]).filter((img) => img.includes("card-photos"));
    assert.deepEqual(
      imgs.map((img) => /fetchPriority="high"/i.test(img)),
      [true, false, false, false],
    );
    assert.doesNotMatch(imgs[0], /loading="lazy"/, "the hero photo never lazy-loads");
    assert.match(imgs[0], /sizes="\(min-width: 1024px\) 324px, \(min-width: 768px\) 284px, 58vw"/);
    assert.ok(imgs.slice(1).every((img) => /loading="lazy"/.test(img)));
  });

  it("uses a single card when that is all there is", async () => {
    const html = await landingHtml({ cards: [fixtureCard("only", "Only Card")] });
    assert.match(html, /data-glass-hero="card"/);
    assert.equal((html.match(/data-card-grid/g) ?? []).length, 1);
    assert.equal((html.match(/alt="Only Card, 2023 Fixture Set, PSA 10"/g) ?? []).length, 2, "hero and grid");
  });

  it("says Built by collectors as a small footer tagline, with no name, handle, avatar or follow link", async () => {
    const html = await landingHtml(FIXTURE_FOUNDER);
    const footer = html.slice(html.indexOf("<footer"));
    assert.match(text(footer), /Built by collectors, for collectors\./);
    assert.match(footer, /<p class="lg-tagline">/);
    assert.doesNotMatch(footer, /avatar|From the founder|Follow on Slabhold/);
    assert.doesNotMatch(read("components/landing/sections.tsx"), /profile|avatar|founder_follow/);
  });

  it("drops off-site photos and any profile from the payload", async () => {
    const { readFounderShowcase } = await import("@/lib/landing/founder-showcase");
    const read = readFounderShowcase({
      profile: { username: "donnietaz", displayName: "", avatarUrl: "http://x/a.png" },
      cards: [{ ...fixtureCard("a", "Ok") }, { ...fixtureCard("b", "Off"), photoUrl: "https://evil.example/b.jpg" }, null],
    });
    assert.deepEqual(Object.keys(read), ["cards"]);
    assert.doesNotMatch(JSON.stringify(read), /donnietaz|avatar/);
    assert.deepEqual(read.cards.map((card) => card.id), ["a"]);
    assert.deepEqual(readFounderShowcase("nope"), { cards: [] });
  });
});
