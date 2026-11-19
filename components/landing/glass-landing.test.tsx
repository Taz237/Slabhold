import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { EMPTY_MEDIA, type LandingMedia } from "@/lib/landing/media";
import {
  ALL_MEDIA_FILES,
  FIXTURE_COMP,
  FIXTURE_FOUNDER,
  FIXTURE_PULLS,
  htmlText,
  mediaRoot,
  renderLoaded,
  withLandingContexts,
} from "@/lib/test/landing-fixtures";

/*
 * The Glass Slab landing: real media or none, the reduced-motion still, the
 * pause controls, and the sections that only appear when their real thing
 * exists.
 */

const { win, state } = installDom();
// jsdom has no idle callback: the Quick Comp panel's code loads "once idle", so idle is now.
(win as unknown as { requestIdleCallback: (run: () => void) => number }).requestIdleCallback = (run) => win.setTimeout(run, 0);
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const CSS = read("app/landing.css");

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  state.reducedMotion = false;
  delete process.env.NEXT_PUBLIC_QUICK_COMP;
  delete process.env.NEXT_PUBLIC_LANDING_HIT_REVEALS;
});

async function mount(element: ReactElement) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

type PageProps = { founder?: typeof FIXTURE_FOUNDER | null; comp?: typeof FIXTURE_COMP | null; pulls?: typeof FIXTURE_PULLS | null; media?: LandingMedia };

/** The page once its lazy parts have loaded, the way the server sends it. */
async function page(props: PageProps = {}) {
  const { LandingPage } = await import("@/components/landing-page");
  const { LandingCompProvider } = await import("@/components/landing/landing-links");
  return renderLoaded(
    withLandingContexts(createElement(LandingCompProvider, { comp: props.comp ?? null }, createElement(LandingPage, { media: EMPTY_MEDIA, ...props }))),
  );
}

/** Image URLs as written, without the optimizer's escaping. */
function plain(html: string): string {
  return html.replace(/%2F/gi, "/").replace(/%3A/gi, ":");
}

function section(html: string, id: string): string {
  const start = html.indexOf(`data-section="${id}"`);
  if (start < 0) return "";
  const next = html.indexOf("data-section=", start + 20);
  return html.slice(start, next < 0 ? html.length : next);
}

function sectionIds(html: string): string[] {
  return [...html.matchAll(/data-section="([a-z-]+)"/g)].map((match) => match[1]);
}

/** The part of the stylesheet inside one at-rule, from its opening line to the next top-level rule. */
function block(css: string, opening: string): string {
  const start = css.lastIndexOf(opening);
  assert.ok(start >= 0, opening);
  let depth = 0;
  for (let at = css.indexOf("{", start); at < css.length; at += 1) {
    if (css[at] === "{") depth += 1;
    if (css[at] === "}" && (depth -= 1) === 0) return css.slice(start, at + 1);
  }
  return css.slice(start);
}

describe("landing media slots on the page", () => {
  it("draws no video and no slot image while every slot is empty", async () => {
    const html = await page();
    assert.doesNotMatch(html, /<video/);
    assert.doesNotMatch(html, /<img(?![^>]*src="\/logo\.svg")/, "only the logo");
    assert.doesNotMatch(html, /landing\/media\//);
    assert.match(html, /data-glass-hero="empty"/);
    assert.deepEqual(sectionIds(html), ["scan", "parallels", "collection", "arena", "join"]);
    for (const id of ["scan", "parallels", "collection", "arena"]) {
      assert.match(section(html, id).slice(0, 80), /data-media="none"/, id);
    }
  });

  it("draws each slot's media once its real file is there", async () => {
    const fixture = mediaRoot(ALL_MEDIA_FILES);
    try {
      const html = await page({ media: fixture.media() });
      assert.deepEqual(sectionIds(html), ["scan", "serial", "parallels", "collection", "arena", "join"]);
      for (const id of ["scan", "serial", "parallels", "collection", "arena"]) {
        const part = section(html, id);
        assert.match(part.slice(0, 80), /data-media="real"/, id);
        const video = part.match(/<video[^>]*>/)?.[0] ?? "";
        assert.match(video, new RegExp(`src="/landing/media/${id}\\.mp4"`), id);
        assert.match(video, new RegExp(`poster="/landing/media/${id}\\.webp"`), id);
        assert.match(video, /width="720" height="1560"/, "sized, so nothing shifts");
        assert.match(video, /aria-label="[^"]{12,}"/);
        assert.equal((part.match(/<video/g) ?? []).length, 1, id);
      }
      assert.match(plain(section(html, "serial")), /<img[^>]*serial-macro\.avif/);
      assert.match(plain(section(html, "arena")), /<img[^>]*share-rank\.webp/);
      assert.match(section(html, "serial"), /class="lg-loupe"/, "the loupe needs both the macro and the clip");
      const hero = html.slice(html.indexOf("data-glass-hero"), html.indexOf("data-section"));
      assert.match(hero, /data-glass-hero="card"/);
      assert.match(plain(hero), /<img[^>]*hero-card\.avif[^>]*data-hero-card/);
    } finally {
      fixture.remove();
    }
  });

  it("fills one slot at a time: a clip on its own changes only its section", async () => {
    const fixture = mediaRoot(["parallels.mp4", "parallels.webp"]);
    try {
      const html = await page({ media: fixture.media() });
      assert.equal((html.match(/<video/g) ?? []).length, 1);
      assert.match(section(html, "parallels"), /<video/);
      assert.doesNotMatch(section(html, "scan"), /<video|<img/);
      assert.doesNotMatch(section(html, "arena"), /<video|<img/);
    } finally {
      fixture.remove();
    }
  });

  it("hides the edge serial section until it has a recording or a macro, and shows either alone", async () => {
    assert.equal(section(await page(), "serial"), "");
    const macro = mediaRoot(["serial-macro.avif"]);
    const clip = mediaRoot(["serial.mp4", "serial.webp"]);
    try {
      const withMacro = section(await page({ media: macro.media() }), "serial");
      assert.match(htmlText(withMacro), /Reads the edge\. The serial along the border, read for you\./);
      assert.match(withMacro, /<img/);
      assert.doesNotMatch(withMacro, /<video|lg-loupe/);
      const withClip = section(await page({ media: clip.media() }), "serial");
      assert.match(withClip, /<video/);
      assert.doesNotMatch(withClip, /<img|lg-loupe/);
    } finally {
      macro.remove();
      clip.remove();
    }
  });

  it("shows the share-rank image only beside the arena recording", async () => {
    const fixture = mediaRoot(["share-rank.webp"]);
    try {
      assert.doesNotMatch(section(await page({ media: fixture.media() }), "arena"), /<img|<video/);
    } finally {
      fixture.remove();
    }
  });
});

describe("landing sections", () => {
  it("gives each section one heading and one line, in order", async () => {
    const fixture = mediaRoot(ALL_MEDIA_FILES);
    try {
      const html = await page({ media: fixture.media() });
      const copy = (id: string) => {
        const part = section(html, id);
        assert.equal((part.match(/<h2/g) ?? []).length, 1, id);
        assert.equal((part.match(/class="lg-lead"/g) ?? []).length, 1, id);
        return [htmlText(part.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "").trim(), htmlText(part.match(/class="lg-lead">([\s\S]*?)<\/p>/)?.[1] ?? "").trim()];
      };
      assert.deepEqual(copy("scan"), ["Straightened on the spot.", "Crop, straighten and one light sweep the moment you tap."]);
      assert.deepEqual(copy("serial"), ["Reads the edge.", "The serial along the border, read for you."]);
      assert.deepEqual(copy("parallels"), ["Every parallel. You pick.", "Can't read the serial? Choose from every version and see its comps."]);
      assert.deepEqual(copy("collection"), ["Cards first.", "Scrub your value. Swipe your movers."]);
      assert.deepEqual(copy("arena"), ["The weekly arena.", "Climb the boards every week."]);
      assert.doesNotMatch(html, /<ol|Step \d|>\d\.</, "no numbered steps");
      assert.doesNotMatch(html, /role="tab"|role="tablist"/, "no tabs to explain");
    } finally {
      fixture.remove();
    }
  });

  it("falls back to a cards-first grid of the real collection cards: photos only, no values", async () => {
    const html = await page({ founder: FIXTURE_FOUNDER });
    const collection = section(html, "collection");
    assert.match(collection.slice(0, 80), /data-media="real"/);
    const images = [...collection.matchAll(/<img[^>]+>/g)].map((match) => match[0]);
    assert.equal(images.length, 3);
    for (const img of images) {
      assert.match(plain(img), /card-photos\/owner\/[abc]\.jpg/);
      assert.match(img, /loading="lazy"/);
      assert.match(img, /width="250" height="350"/);
      assert.match(img, /alt="[^"]+ Card, 2023 Fixture Set, PSA 10"/);
    }
    assert.doesNotMatch(htmlText(collection), /\$|\d+ cards|value of|worth/i);
    assert.doesNotMatch(collection, /<svg|<canvas|chart/i, "no invented chart");
    // The recording, once it exists, takes the grid's place.
    const fixture = mediaRoot(["collection.mp4", "collection.webp"]);
    try {
      const filled = section(await page({ founder: FIXTURE_FOUNDER, media: fixture.media() }), "collection");
      assert.match(filled, /<video/);
      assert.doesNotMatch(filled, /data-card-grid/);
    } finally {
      fixture.remove();
    }
  });

  it("has no badge ladder, no badge row, no totals and no counts anywhere", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    const fixture = mediaRoot(ALL_MEDIA_FILES);
    try {
      const html = await page({ founder: FIXTURE_FOUNDER, comp: FIXTURE_COMP, pulls: FIXTURE_PULLS, media: fixture.media() });
      assert.match(html, /data-showcase-demo="quick-comp"/, "the Quick Comp panel was read too");
      assert.doesNotMatch(html, /data-badge|badge-legendary|badges\//i);
      assert.doesNotMatch(htmlText(html), /See the pop-up|Earn every tier|Bronze|Legendary/i);
      const words = htmlText(html);
      assert.doesNotMatch(words, /Based on \d+|\d+ (sample )?sales|\d+ cards|\d+ collectors|\d+ pulls|Collection value|Total/i);
      for (const file of ["components/landing-page.tsx", "components/landing/sections.tsx", "components/landing/glass-hero.tsx"]) {
        assert.doesNotMatch(read(file), /@\/components\/badges|lib\/badges/, file);
      }
    } finally {
      fixture.remove();
    }
  });

  it("renders the pulls wall only with approved pulls, as real photos and handles", async () => {
    assert.equal(section(await page(), "pulls"), "");
    assert.equal(section(await page({ pulls: [] }), "pulls"), "");
    const html = await page({ pulls: FIXTURE_PULLS });
    assert.deepEqual(sectionIds(html), ["scan", "parallels", "collection", "arena", "pulls", "join"]);
    const wall = section(html, "pulls");
    assert.match(wall, /aria-label="Pulls from collectors"/);
    assert.match(htmlText(wall), /@fixture_puller/);
    const lists = wall.split("<ul").slice(1);
    assert.equal(lists.length, 2, "the row and its looping copy");
    assert.doesNotMatch(lists[0].slice(0, 40), /aria-hidden/);
    assert.match(lists[1].slice(0, 40), /aria-hidden="true"/, "the copy is hidden from screen readers");
    for (const img of wall.matchAll(/<img[^>]+>/g)) {
      assert.match(plain(img[0]), /card-photos\/p[12]\//);
      assert.match(img[0], /loading="lazy"/);
    }
    assert.match(wall, /alt="Fixture Rookie, 2024 Fixture Set, pulled by @fixture_puller"/);
    assert.match(read("app/welcome/page.tsx"), /const pullsRead = landingPullsWall\(\);/);
    assert.match(read("app/(app)/page.tsx"), /const pullsRead = landingPullsWall\(\);/);
  });

  it("keeps the hit reveals card off unless its flag is exactly 1", async () => {
    const { hitRevealsEnabled } = await import("@/components/landing/sections");
    assert.equal(hitRevealsEnabled({}), false);
    assert.equal(hitRevealsEnabled({ NEXT_PUBLIC_LANDING_HIT_REVEALS: "true" }), false);
    assert.equal(hitRevealsEnabled({ NEXT_PUBLIC_LANDING_HIT_REVEALS: "1" }), true);
    const off = await page();
    assert.equal(section(off, "hit-reveals"), "");
    assert.doesNotMatch(htmlText(off), /Coming soon|Crystal Shatter/i);

    process.env.NEXT_PUBLIC_LANDING_HIT_REVEALS = "1";
    const on = section(await page(), "hit-reveals");
    assert.match(on, /<p class="lg-tag">Coming soon<\/p>/);
    assert.match(htmlText(on), /Crystal Shatter · Storm Strike · Pixel Rebuild/);
    assert.doesNotMatch(on, /<img|<video|<svg/, "no footage, no art");
    assert.match(CSS, /\.lg-tag \{[^}]*font-family: var\(--font-geist-mono\)[^}]*font-size: 12px;[^}]*letter-spacing: 0\.08em;[^}]*text-transform: uppercase;/);
    // Nothing from the in-app hit reveal work is pulled into the landing.
    for (const file of ["components/landing/sections.tsx", "components/landing-page.tsx"]) {
      assert.doesNotMatch(read(file), /@\/components\/scan|@\/lib\/scan/, file);
    }
  });

  it("shows Quick Comp only with a real card and its flag: the panel, with no Replay and no sample", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    assert.equal(section(await page(), "quick-comp"), "", "no real card, no section");
    assert.equal(section(await page({ comp: { ...FIXTURE_COMP, real: false } }), "quick-comp"), "");
    const html = await page({ comp: FIXTURE_COMP });
    const comp = section(html, "quick-comp");
    assert.match(htmlText(comp), /Quick Comp Recent sold prices, the median and the range\./);
    assert.match(comp, /data-showcase-demo="quick-comp"/);
    assert.match(htmlText(comp), /via Trawl/);
    assert.doesNotMatch(htmlText(comp), /Replay|Sample|any card/i);
    assert.doesNotMatch(comp, /<button/);
    delete process.env.NEXT_PUBLIC_QUICK_COMP;
    assert.equal(section(await page({ comp: FIXTURE_COMP }), "quick-comp"), "", "off with its flag off");
  });

  it("drops the Quick Comp section when the real photo fails, instead of showing a sample", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    state.reducedMotion = true;
    const { QuickCompSection } = await import("@/components/landing/quick-comp-section");
    const { LandingCompProvider } = await import("@/components/landing/landing-links");
    const host = await mount(createElement(LandingCompProvider, { comp: FIXTURE_COMP }, createElement(QuickCompSection)));
    for (let tries = 0; tries < 40 && !host.querySelector('[data-showcase-demo="quick-comp"]'); tries += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    assert.ok(host.querySelector('[data-section="quick-comp"] img'));
    await act(async () => {
      host.querySelector("img")!.dispatchEvent(new win.Event("error"));
    });
    assert.equal(host.querySelector('[data-section="quick-comp"]'), null);
    assert.equal(host.textContent, "");
  });

  it("closes on the glass slab with both ways in, then the footer and its small tagline", async () => {
    const html = await page();
    const join = section(html, "join");
    assert.match(htmlText(join), /Join Slabhold/);
    assert.match(join, /class="lg-join lg-glass/);
    assert.match(join, /data-app-store-badge="primary"/);
    assert.match(join, />Open Slabhold</);
    assert.ok(join.indexOf("data-app-store-badge") < join.indexOf(">Open Slabhold<"));
    const footer = html.slice(html.indexOf("<footer"));
    for (const href of ["/privacy", "/terms", "/support"]) assert.match(footer, new RegExp(`href="${href}"`));
    assert.match(footer, /<p class="lg-tagline">Built by collectors, for collectors\.<\/p>/);
    assert.doesNotMatch(html, /<h2[^>]*>Built by collectors/, "a tagline now, not a section");
    // The galaxy is fixed, so anything unpositioned would paint under it.
    assert.match(CSS, /\.lg-footer \{[^}]*position: relative;/);
    assert.match(html, /<main class="relative">/);
  });
});

describe("Glass Slab hero", () => {
  it("leads with the headline as one opaque h1, the sub-line, and the two actions", async () => {
    const html = await page({ founder: FIXTURE_FOUNDER });
    const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? "";
    assert.equal(htmlText(h1).trim(), "Scan it. Know the exact version.");
    assert.match(h1, /<br\/><span class="lg-h1-accent">/, "the second line is the accent");
    assert.doesNotMatch(h1, /opacity-0|invisible|hidden/);
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.match(
      htmlText(html),
      /Slabhold crops and straightens your card, reads it down to the edge serial, then you pick the exact version and see what it sold for\./,
    );
    const hero = html.slice(html.indexOf("data-glass-hero"), html.indexOf("data-section"));
    assert.ok(hero.indexOf('data-app-store-badge="primary"') < hero.indexOf(">Open Slabhold<"), "the App Store comes first");
    assert.match(hero, /class="lg-btn lg-btn-glass lg-glass"[^>]*>Open Slabhold</, "Open Slabhold is the glass button");
    // Each word resolves 80ms after the one before it; the heading never fades.
    assert.deepEqual([...h1.matchAll(/--i:(\d)/g)].map((match) => match[1]), ["0", "1", "2", "3", "4", "5"]);
    assert.match(CSS, /\.lg-w \{[^}]*animation-delay: calc\(var\(--i, 0\) \* 80ms\);/);
    assert.match(CSS, /@keyframes lg-settle \{\s*from \{\s*filter: blur\(8px\);\s*transform: translateY\(6px\);\s*\}\s*\}/);
    // A filter or transform on a word would split it from the h1's text block and cost the h1 its LCP.
    assert.match(CSS, /@keyframes lg-word \{\s*from \{\s*text-shadow: 0 0 14px currentColor;\s*\}\s*\}/);
    const h1Rules = [...CSS.matchAll(/\.lg-(?:h1|w)[^{]*\{[^}]*\}/g)].map((match) => match[0]).join("\n");
    assert.doesNotMatch(h1Rules, /opacity|visibility/);
    assert.match(CSS, /\.lg-h1 \{[^}]*font-size: 44px;[^}]*font-weight: 800;[^}]*line-height: 1\.02;[^}]*letter-spacing: -0\.04em;/);
    assert.match(CSS, /\.lg-h1 \{\s*font-size: clamp\(60px, 6\.1vw, 88px\);\s*line-height: 0\.98;/);
  });

  it("puts the first real collection card in the slab, sharp and uncropped, with every glass layer", async () => {
    const html = await page({ founder: FIXTURE_FOUNDER });
    const hero = html.slice(html.indexOf("data-glass-hero"), html.indexOf("data-section"));
    assert.match(hero, /data-glass-hero="card"/);
    const img = hero.match(/<img[^>]*data-hero-card[^>]*>/)?.[0] ?? "";
    assert.match(plain(img), /card-photos\/owner\/a\.jpg/, "the top card");
    assert.match(img, /alt="Top Card, 2023 Fixture Set, PSA 10"/);
    for (const layer of ["lg-glow", "lg-slab lg-glass", "lg-rim", "lg-spec", "lg-sheen", "lg-card", "lg-sweep", "lg-ring"]) {
      assert.ok(hero.includes(`class="${layer}"`), layer);
    }
    assert.equal((hero.match(/class="lg-corner"/g) ?? []).length, 4, "four crop corners");
    assert.equal((hero.match(/class="lg-sweep"/g) ?? []).length, 1, "one light sweep");
    assert.match(CSS, /\.lg-card img \{[^}]*object-fit: contain;/);
    const cardRules = [...CSS.matchAll(/\.lg-card[^{]*\{[^}]*\}/g)].map((match) => match[0]).join("\n");
    assert.doesNotMatch(cardRules, /blur/, "the card is never blurred");
    // The supplied hero photo wins over the collection card once it exists.
    const fixture = mediaRoot(["hero-card.avif"], { "sizes.json": { "hero-card.avif": { alt: "A fixture numbered card" } } });
    try {
      const filled = await page({ founder: FIXTURE_FOUNDER, media: fixture.media() });
      const supplied = filled.match(/<img[^>]*data-hero-card[^>]*>/)?.[0] ?? "";
      assert.match(plain(supplied), /hero-card\.avif/);
      assert.match(supplied, /alt="A fixture numbered card"/);
    } finally {
      fixture.remove();
    }
  });

  it("shows an empty glass slab, with no stand-in card, when there is no real card", async () => {
    const html = await page();
    const hero = html.slice(html.indexOf("data-glass-hero"), html.indexOf("data-section"));
    assert.match(hero, /data-glass-hero="empty"/);
    assert.match(hero, /data-glass-slab/);
    assert.doesNotMatch(hero, /<img/);
    assert.doesNotMatch(htmlText(hero), /Sample|Your grail|Rookie auto/i);
  });

  it("lets a shard out of the slab only for a real fact: sold prices as a line, the serial in mono", async () => {
    const none = await page({ founder: FIXTURE_FOUNDER });
    assert.doesNotMatch(none, /data-shard/);
    const sold = await page({ founder: FIXTURE_FOUNDER, comp: FIXTURE_COMP });
    assert.equal((sold.match(/data-shard=/g) ?? []).length, 1);
    const shard = sold.slice(sold.indexOf('data-shard="sold"'), sold.indexOf("</svg>", sold.indexOf('data-shard="sold"')));
    assert.match(shard, /<svg role="img" aria-label="Recent sold prices" viewBox="0 0 96 40" width="96" height="40"/);
    // Oldest to newest, left to right: 285, 299.5, 310 rises.
    const ys = (shard.match(/points="([^"]+)"/)?.[1] ?? "").split(" ").map((point) => Number(point.split(",")[1]));
    assert.equal(ys.length, 3);
    assert.ok(ys[0] > ys[1] && ys[1] > ys[2]);
    assert.doesNotMatch(htmlText(shard), /\$|\d/, "a shape, never a number or a word");
    // A sample comp, or too few sales, is not a real fact.
    assert.doesNotMatch(await page({ comp: { ...FIXTURE_COMP, real: false } }), /data-shard/);
    assert.doesNotMatch(await page({ comp: { ...FIXTURE_COMP, sales: FIXTURE_COMP.sales.slice(0, 2) } }), /data-shard/);

    const fixture = mediaRoot(["hero-card.avif"], { "sizes.json": { "hero-card.avif": { serial: "06/10" } } });
    try {
      const html = await page({ media: fixture.media() });
      assert.match(html, /<div class="lg-shard lg-shard-serial lg-glass" data-shard="serial">06\/10<\/div>/);
      assert.match(CSS, /\.lg-shard-serial \{[^}]*font-family: var\(--font-geist-mono\)/);
    } finally {
      fixture.remove();
    }
    // The serial belongs to the supplied hero photo only: a collection card never borrows one.
    const borrowed = mediaRoot([], { "sizes.json": { "hero-card.avif": { serial: "06/10" } } });
    try {
      assert.doesNotMatch(await page({ founder: FIXTURE_FOUNDER, media: borrowed.media() }), /data-shard="serial"/);
    } finally {
      borrowed.remove();
    }
  });

  it("plays the load sequence in CSS keyframes only, in order, in about 1.6 seconds", () => {
    const start = (selector: string) => {
      const rule = CSS.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0] ?? "";
      const timing = rule.match(/animation:\s*(?:[\s\S]*?)(lg-[a-z-]+) (\d+)ms [^;,]*? (\d+)ms/);
      assert.ok(timing, selector);
      return { name: timing[1], begin: Number(timing[3]), end: Number(timing[2]) + Number(timing[3]) };
    };
    const bead = start(".lg-slab");
    const land = start(".lg-card");
    const corner = start(".lg-corner");
    const sweep = start(".lg-sweep");
    const ring = start(".lg-ring");
    assert.deepEqual([bead.name, land.name, corner.name, sweep.name, ring.name], ["lg-bead", "lg-land", "lg-corner", "lg-sweep", "lg-ring"]);
    assert.ok(bead.begin < land.begin && land.begin < corner.begin && corner.begin < sweep.begin && sweep.begin <= ring.begin);
    assert.ok(ring.end >= 1500 && ring.end <= 1800, `ends at ${ring.end}ms`);
    assert.match(CSS, /@keyframes lg-bead \{\s*from \{[^}]*transform: scale\(0\.08\);/);
    // Lands 4 degrees off, then straightens.
    const landFrames = CSS.slice(CSS.indexOf("@keyframes lg-land"), CSS.indexOf(".lg-corner {"));
    assert.equal((landFrames.match(/rotate\(4deg\)/g) ?? []).length, 3);
    assert.match(landFrames, /84%,\s*100% \{\s*transform: rotate\(0deg\);/);
    assert.match(CSS, /\.lg-galaxy-mesh i \{[^}]*animation: lg-drift 40s ease-in-out infinite alternate;/);
    for (const file of ["components/landing/glass-hero.tsx", "components/landing/landing-galaxy.tsx", "components/landing/sections.tsx"]) {
      assert.doesNotMatch(read(file), /^"use client";|\.animate\(|requestAnimationFrame|<canvas|getContext|setTimeout/m, file);
    }
  });

  it("is a server component with one small client island for the tilt and the pause control", () => {
    assert.doesNotMatch(read("components/landing/glass-hero.tsx"), /^"use client";/m);
    const island = read("components/landing/glass-island.tsx");
    assert.match(island, /^"use client";/);
    assert.deepEqual([...island.matchAll(/^export function (\w+)/gm)].map((match) => match[1]), ["SlabTilt", "MotionPause"]);
    assert.doesNotMatch(island, /useEffect|fetch\(|lucide-react/);
  });
});

describe("Glass Slab hero: tilt", () => {
  async function tilted() {
    const { SlabTilt } = await import("@/components/landing/glass-island");
    const frames: (() => void)[] = [];
    const raf = win.requestAnimationFrame;
    win.requestAnimationFrame = ((run: () => void) => frames.push(run)) as unknown as typeof win.requestAnimationFrame;
    const host = await mount(createElement(SlabTilt, null, createElement("p", null, "slab")));
    const node = host.querySelector<HTMLElement>("[data-slab-tilt]")!;
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 }) as DOMRect;
    const move = (pointerType: string) =>
      act(() => {
        const event = new win.MouseEvent("pointermove", { bubbles: true, clientX: 200, clientY: 0 });
        Object.defineProperty(event, "pointerType", { value: pointerType });
        node.dispatchEvent(event);
      });
    return { node, frames, move, restore: () => (win.requestAnimationFrame = raf) };
  }

  function desktop(matches: boolean) {
    const real = win.matchMedia;
    Object.defineProperty(win, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ ...real(query), matches: query.includes("min-width") ? matches : real(query).matches }),
    });
    return () => Object.defineProperty(win, "matchMedia", { configurable: true, value: real });
  }

  it("leans up to 8 degrees toward a mouse on desktop, slides the sheen, and settles when it leaves", async () => {
    const undo = desktop(true);
    const { node, frames, move, restore } = await tilted();
    try {
      move("mouse");
      frames.splice(0).forEach((run) => run());
      assert.equal(node.style.getPropertyValue("--tilt-x"), "8deg");
      assert.equal(node.style.getPropertyValue("--tilt-y"), "8deg");
      assert.equal(node.style.getPropertyValue("--sheen"), "1");
      assert.ok(node.hasAttribute("data-tilting"));
      act(() => void node.dispatchEvent(new win.MouseEvent("pointerout", { bubbles: true })));
      assert.equal(node.style.getPropertyValue("--tilt-y"), "");
      assert.equal(node.style.getPropertyValue("--sheen"), "");
      assert.ok(!node.hasAttribute("data-tilting"));
    } finally {
      restore();
      undo();
    }
    assert.match(CSS, /\.lg-tilt \{[^}]*transform: rotateX\(var\(--tilt-x, 0deg\)\) rotateY\(var\(--tilt-y, 0deg\)\);/);
    assert.match(CSS, /\.lg-sheen::before \{[^}]*transform: translateX\(calc\(var\(--sheen, 0\) \* 22%\)\);/);
  });

  it("stays still for touch, under 768px, and for reduced motion", async () => {
    let undo = desktop(true);
    let rig = await tilted();
    try {
      rig.move("touch");
      assert.equal(rig.frames.length, 0, "touch");
      state.reducedMotion = true;
      rig.move("mouse");
      assert.equal(rig.frames.length, 0, "reduced motion");
    } finally {
      rig.restore();
      undo();
      state.reducedMotion = false;
      cleanup?.();
      cleanup = null;
    }
    undo = desktop(false);
    rig = await tilted();
    try {
      rig.move("mouse");
      assert.equal(rig.frames.length, 0, "a small screen");
      assert.equal(rig.node.style.getPropertyValue("--tilt-x"), "");
    } finally {
      rig.restore();
      undo();
    }
  });

  it("bends the rim and leans on scroll on desktop only, in CSS, where the browser can", () => {
    const desktopRules = block(CSS, "@media (min-width: 768px) {");
    assert.match(desktopRules, /\.lg-rim \{\s*filter: url\(#lg-refract\);/);
    assert.equal(CSS.split("url(#lg-refract)").length - 1, 1, "nowhere else");
    const filter = read("components/landing/glass-hero.tsx").match(/<feDisplacementMap[^>]*scale="(\d+)"/)?.[1];
    assert.ok(Number(filter) >= 6 && Number(filter) <= 10, "displacement scale 6 to 10");
    assert.match(
      CSS,
      /@supports \(animation-timeline: scroll\(\)\) \{\s*@media \(min-width: 768px\) and \(prefers-reduced-motion: no-preference\) \{[^}]*\.lg-scroll-tilt \{[^}]*animation-timeline: scroll\(root\);/,
    );
    assert.match(CSS, /@keyframes lg-scroll-tilt \{\s*to \{\s*transform: rotateX\(8deg\) scale\(0\.9\)/);
    assert.equal(CSS.split(".lg-scroll-tilt {").length - 1, 1, "outside that block the slab just sits there");
  });
});

describe("landing: less motion and less transparency", () => {
  const reduced = block(CSS, "@media (prefers-reduced-motion: reduce) {");

  it("shows one composed still: nothing animates, the card is straight, the sweep is held at 60%", () => {
    assert.match(reduced, /\.lg \*,\s*\.lg \*::before \{\s*animation: none !important;\s*transition: none !important;/);
    // The sweep is 46% of the card wide: moved 80% of itself, its middle sits 60% across.
    assert.match(reduced, /\.lg-sweep \{\s*opacity: 1;\s*transform: translateX\(80%\) skewX\(-12deg\);/);
    assert.match(CSS, /\.lg-sweep \{[^}]*width: 46%;/);
    assert.equal(Math.round(0.8 * 46 + 46 / 2), 60);
    assert.match(reduced, /\.lg-tilt \{\s*transform: none;/);
    assert.match(reduced, /\.lg-pause \{\s*display: none;/, "nothing loops, so there is nothing to pause");
    // With the animations off every part rests on its end state: card straight and opaque, shards out.
    const rest = CSS.match(/\.lg-card \{[^}]*\}/)?.[0] ?? "";
    assert.doesNotMatch(rest, /opacity|rotate/);
    for (const frames of ["lg-land", "lg-bead", "lg-shard-out", "lg-word", "lg-settle", "lg-corner", "lg-fade", "lg-rise"]) {
      const body = CSS.slice(CSS.indexOf(`@keyframes ${frames} {`), CSS.indexOf("\n}\n", CSS.indexOf(`@keyframes ${frames} {`)));
      assert.doesNotMatch(body, /\n {2}to \{/, `${frames} only animates from a start, never to a hidden end`);
    }
    // Scroll effects exist only inside no-preference blocks.
    for (const name of ["lg-rise", "lg-loupe", "lg-scroll-tilt"]) {
      const at = CSS.indexOf(`animation: ${name} linear both;`);
      assert.ok(at > 0, name);
      assert.match(CSS.slice(CSS.lastIndexOf("@supports", at), at), /prefers-reduced-motion: no-preference/, name);
    }
  });

  it("stops the pulls row and lets it scroll by hand", () => {
    assert.match(reduced, /\.lg-wall \{\s*overflow-x: auto;/);
    assert.match(reduced, /\.lg-wall-track > ul\[aria-hidden\] \{\s*display: none;/);
  });

  it("swaps glass for a solid pane with a hairline when blur or transparency is off", () => {
    const solid = /\.lg-glass \{\s*background: var\(--glass-solid\);\s*border: 1px solid var\(--line\);/;
    assert.match(block(CSS, "@media (prefers-reduced-transparency: reduce) {"), solid);
    assert.match(block(CSS, "@media (prefers-reduced-transparency: reduce) {"), /backdrop-filter: none;/);
    assert.match(block(CSS, "@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {"), solid);
    assert.match(CSS, /\.lg-glass \{[^}]*backdrop-filter: blur\(var\(--glass-blur\)\) saturate\(var\(--glass-sat\)\);/);
  });

  it("defines the landing tokens once, on the landing root", () => {
    const root = CSS.match(/\.lg \{[^}]*\}/)?.[0].toLowerCase() ?? "";
    const tokens: Record<string, string> = {
      "--bg-0": "#07050d",
      "--bg-1": "#0e0a1a",
      "--bg-2": "#160f2b",
      "--purple": "#7c3aed",
      "--purple-deep": "#5b21b6",
      "--accent": "#a78bfa",
      "--ink": "#f4f4f5",
      "--ink-2": "rgba(244, 244, 245, 0.68)",
      "--ink-3": "rgba(244, 244, 245, 0.44)",
      "--glass-tint": "rgba(167, 139, 250, 0.07)",
      "--glass-solid": "#160f2b",
      "--glass-border": "rgba(255, 255, 255, 0.14)",
      "--line": "rgba(167, 139, 250, 0.22)",
      "--glass-blur": "24px",
      "--glass-sat": "160%",
      "--specular": "linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, transparent 38%)",
      "--shadow": "0 30px 80px rgba(20, 8, 48, 0.6)",
      "--cta": "#7c3aed",
      "--cta-hover": "#8b5cf6",
    };
    for (const [name, value] of Object.entries(tokens)) assert.ok(root.includes(`${name}: ${value};`), name);
    assert.match(CSS, /\.lg-btn-primary \{\s*background: var\(--cta\);/);
    assert.match(CSS, /\.lg-btn-primary:hover \{\s*background: var\(--cta-hover\);/);
    assert.match(CSS, /:focus-visible \{\s*outline: 2px solid var\(--accent\);/);
    assert.match(read("app/globals.css"), /^@import "\.\/landing\.css";$/m);
  });
});

describe("landing: pause controls", () => {
  it("holds every loop on the page from one 44px button, and lets it go again", async () => {
    const { MotionPause } = await import("@/components/landing/glass-island");
    const host = await mount(createElement("div", { className: "lg" }, createElement(MotionPause)));
    const root = host.querySelector(".lg")!;
    const button = host.querySelector("button")!;
    assert.equal(button.getAttribute("aria-label"), "Pause background motion");
    assert.equal(button.getAttribute("aria-pressed"), "false");
    await act(async () => button.click());
    assert.equal(root.getAttribute("data-motion"), "paused");
    assert.equal(button.getAttribute("aria-label"), "Play background motion");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    await act(async () => button.click());
    assert.equal(root.hasAttribute("data-motion"), false);
    assert.match(CSS, /\.lg\[data-motion="paused"\] \*,\s*\.lg\[data-motion="paused"\] \*::before \{\s*animation-play-state: paused !important;/);
    assert.match(CSS, /\.lg-pause \{[^}]*width: 44px;\s*height: 44px;/);
    assert.match(await page(), /<button type="button" class="lg-pause lg-glass" aria-label="Pause background motion"/);
  });

  /** A <video> whose play and pause are counted, and an observer the test drives. */
  async function clip(reducedMotion = false) {
    state.reducedMotion = reducedMotion;
    const proto = win.HTMLMediaElement.prototype;
    const real = { play: proto.play, pause: proto.pause };
    const calls: string[] = [];
    proto.play = function play() {
      calls.push("play");
      return Promise.resolve();
    };
    proto.pause = function pause() {
      calls.push("pause");
    };
    let fire: (visible: boolean) => Promise<void> = async () => {};
    let options: IntersectionObserverInit | undefined;
    const realObserver = globalThis.IntersectionObserver;
    class Observer {
      constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        options = init;
        fire = (visible) =>
          act(async () => callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as IntersectionObserverEntry], this as never));
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: Observer });
    const { default: FeatureClipPlayer } = await import("@/components/landing/feature-clip-player");
    const slot = { src: "/landing/media/scan.mp4", poster: "/landing/media/scan.webp", width: 720, height: 1560 };
    const host = await mount(createElement(FeatureClipPlayer, { slot, label: "A fixture clip" }));
    const undo = cleanup;
    cleanup = () => {
      undo?.();
      proto.play = real.play;
      proto.pause = real.pause;
      Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: realObserver });
    };
    return { host, calls, fire: (visible: boolean) => fire(visible), options: () => options, button: host.querySelector("button")!, video: host.querySelector("video")! };
  }

  it("downloads nothing until it is on screen, plays only in view and stops out of view", async () => {
    const { video, calls, fire, options, button } = await clip();
    assert.equal(video.getAttribute("preload"), "none");
    assert.equal(video.getAttribute("poster"), "/landing/media/scan.webp");
    assert.ok(video.muted && video.loop && video.hasAttribute("playsinline"));
    assert.equal(video.hasAttribute("autoplay"), false);
    assert.equal(video.hasAttribute("controls"), false);
    assert.equal(video.getAttribute("aria-label"), "A fixture clip");
    assert.deepEqual(calls, [], "nothing plays on mount");
    assert.equal(options()?.threshold, 0.5);
    await fire(true);
    assert.deepEqual(calls, ["play"]);
    assert.equal(button.getAttribute("aria-label"), "Pause: A fixture clip");
    await fire(false);
    assert.deepEqual(calls, ["play", "pause"]);
    assert.equal(button.getAttribute("aria-label"), "Play: A fixture clip");
  });

  it("pauses and plays from its 44px button, and a pause sticks when it scrolls back in", async () => {
    const { calls, fire, button } = await clip();
    await fire(true);
    await act(async () => button.click());
    assert.deepEqual(calls, ["play", "pause"]);
    assert.equal(button.getAttribute("aria-pressed"), "false");
    await fire(false);
    await fire(true);
    assert.deepEqual(calls, ["play", "pause", "pause"], "the reader paused it: it stays paused");
    await act(async () => button.click());
    assert.equal(calls.at(-1), "play");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.match(CSS, /\.lg-clip-toggle \{[^}]*width: 44px;\s*height: 44px;/);
  });

  it("shows the poster and a play button with reduced motion, and plays only when asked", async () => {
    const { calls, fire, button } = await clip(true);
    await fire(true);
    assert.deepEqual(calls, [], "never starts by itself");
    assert.equal(button.getAttribute("aria-label"), "Play: A fixture clip");
    await act(async () => button.click());
    assert.deepEqual(calls, ["play"]);
  });
});

describe("landing: the clip player loads on demand", () => {
  it("is its own chunk behind a sized empty phone, so a page with no clips never downloads it", async () => {
    const loader = read("components/landing/feature-clip.tsx");
    assert.match(loader, /const Player = lazy\(\(\) => import\("@\/components\/landing\/feature-clip-player"\)\);/);
    assert.doesNotMatch(loader, /useEffect|IntersectionObserver|<video/);
    // Until the player arrives the same glass phone holds the clip's space, at the clip's shape.
    assert.match(loader, /fallback=\{\s*<div aria-hidden className="lg-phone lg-glass">\s*<div className="lg-phone-screen" style=\{\{ aspectRatio: `\$\{slot\.width\} \/ \$\{slot\.height\}` \}\} \/>/);
  });
});

describe("landing: App Store call to action", () => {
  it("is the primary action on the web, in the nav, the hero and the closing slab", async () => {
    const { AppStoreBadge } = await import("@/components/landing/app-store-badge");
    const { APP_STORE_URL } = await import("@/components/landing/app-store-link");
    assert.equal(APP_STORE_URL, "https://apps.apple.com/app/id6831357026");
    const host = await mount(createElement(AppStoreBadge, { variant: "primary" }));
    const link = host.querySelector("a")!;
    assert.equal(link.getAttribute("href"), APP_STORE_URL);
    assert.equal(link.textContent, "Get the app");
    assert.equal(link.className, "lg-btn lg-btn-primary");
    assert.match(CSS, /\.lg-btn \{[^}]*height: 56px;/, "a 56px tap target");
    cleanup?.();
    cleanup = null;
    const nav = await mount(createElement(AppStoreBadge, { variant: "nav" }));
    assert.equal(nav.querySelector("a")?.textContent, "Get the app");
    assert.equal(nav.querySelector("a")?.className, "lg-nav-cta");
    assert.match(CSS, /\.lg-nav-cta \{[^}]*height: 44px;[^}]*background: var\(--cta\);/);
    const html = await page();
    assert.deepEqual(
      [...html.matchAll(/data-app-store-badge="(\w+)"/g)].map((match) => match[1]),
      ["nav", "primary", "primary"],
    );
    assert.doesNotMatch(htmlText(html), /download/i);
  });

  it("holds its space on the server, so nothing jumps when the link arrives", async () => {
    const { AppStoreBadge } = await import("@/components/landing/app-store-badge");
    const primary = renderToStaticMarkup(createElement(AppStoreBadge, { variant: "primary" }));
    assert.match(primary, /data-app-store-badge="primary" class="h-14"/);
    assert.doesNotMatch(primary, /<a\b/);
    const nav = renderToStaticMarkup(createElement(AppStoreBadge, { variant: "nav" }));
    assert.match(nav, /data-app-store-badge="nav" class="h-11 min-w-\[126px\]"/);
    assert.doesNotMatch(nav, /<a\b/);
  });

  it("is hidden inside the iOS app, where Open Slabhold is the only action", async () => {
    const { AppStoreBadge } = await import("@/components/landing/app-store-badge");
    const native = win as unknown as { Capacitor?: { isNativePlatform: () => boolean } };
    native.Capacitor = { isNativePlatform: () => true };
    try {
      for (const variant of ["primary", "nav"] as const) {
        const host = await mount(createElement(AppStoreBadge, { variant }));
        assert.equal(host.querySelector("a"), null, variant);
        cleanup?.();
        cleanup = null;
      }
      const { LandingPage } = await import("@/components/landing-page");
      const host = await mount(withLandingContexts(createElement(LandingPage, { media: EMPTY_MEDIA })));
      const actions = [...host.querySelectorAll("a")].map((a) => a.textContent);
      assert.ok(!actions.includes("Get the app"));
      assert.equal(actions.filter((label) => label === "Open Slabhold").length, 2, "hero and closing slab");
      assert.equal(host.querySelector(`a[href^="https://apps.apple.com"]`), null);
    } finally {
      delete native.Capacitor;
    }
    assert.match(read("components/landing/app-store-badge.tsx"), /useSyncExternalStore\(subscribe, \(\) => !isNativeApp\(\), \(\) => false\)/);
    assert.match(read("app/layout.tsx"), /itunes: \{ appId: "6831357026" \}/, "the apple-itunes-app banner stays");
  });

  it("keeps the nav slim and sticky: logo, Log in, Get the app, 72px tall", async () => {
    const html = await page();
    const nav = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    assert.match(nav, /class="lg-nav lg-glass"/);
    assert.match(nav, /src="\/logo\.svg"/);
    assert.match(nav, /href="\/login"[^>]*>Log in</);
    assert.match(nav, /data-app-store-badge="nav"/);
    assert.match(CSS, /\.lg-nav \{[^}]*position: sticky;\s*top: 0;/);
    assert.match(CSS, /\.lg-nav-row \{[^}]*height: 72px;/);
  });
});

describe("landing: search and share", () => {
  it("describes the app the same way in the title, description, Open Graph and Twitter on both routes", async () => {
    const { LANDING_TITLE, LANDING_DESCRIPTION } = await import("@/lib/landing/seo");
    assert.equal(LANDING_TITLE, "Slabhold: Sports card scanner and collection tracker");
    assert.equal(
      LANDING_DESCRIPTION,
      "Scan a card or slab, see what it sold for, and track your collection. Crops and straightens the card, reads the edge serial, and lets you pick the exact version.",
    );
    for (const route of ["app/welcome/page.tsx", "app/(app)/page.tsx"]) {
      const source = read(route);
      assert.match(source, /export const metadata: Metadata = \{\s*title: LANDING_TITLE,\s*description: LANDING_DESCRIPTION,/, route);
      assert.match(source, /openGraph: \{ title: LANDING_TITLE, description: LANDING_DESCRIPTION,/, route);
      assert.match(source, /twitter: \{ card: "summary_large_image", title: LANDING_TITLE, description: LANDING_DESCRIPTION \}/, route);
    }
    assert.match(read("app/welcome/page.tsx"), /alternates: \{ canonical: "\/" \}/);
  });

  it("adds MobileApplication JSON-LD with the App Store link and no rating", async () => {
    const html = await page();
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "";
    assert.deepEqual(JSON.parse(json), {
      "@context": "https://schema.org",
      "@type": "MobileApplication",
      name: "Slabhold",
      operatingSystem: "iOS",
      applicationCategory: "LifestyleApplication",
      url: "https://slabhold.app",
      installUrl: "https://apps.apple.com/app/id6831357026",
    });
    assert.doesNotMatch(json, /aggregateRating|ratingValue|review/i);
  });
});
