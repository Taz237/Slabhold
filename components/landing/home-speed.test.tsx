import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { installDom } from "@/lib/test/dom";
import type { FounderShowcase } from "@/lib/landing/founder";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { ALL_MEDIA_FILES, mediaRoot, renderLoaded } from "@/lib/test/landing-fixtures";

/*
 * Signed-out Home speed pins: the calls to action warm their route on intent,
 * not on sight; the head preloads one photo, the hero card; the h1 is the first
 * big paint; and clips download nothing until they are on screen.
 */

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const HOST = "https://knuwflptobyutrauxblj.supabase.co";

function card(id: string, playerName: string) {
  return {
    id,
    photoUrl: `${HOST}/storage/v1/object/public/card-photos/owner/${id}.jpg`,
    playerName,
    year: 2020,
    yearLabel: "",
    setBrand: "Fixture Set",
    grade: "10",
    gradeQualifier: "",
    certNumber: "",
    accent: "violet",
    conditionType: "graded",
    grader: "PSA",
  } as FounderShowcase["cards"][number];
}

const FOUNDER: FounderShowcase = {
  cards: [card("center", "Top Card"), card("left", "Second Card"), card("right", "Third Card")],
};

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function withContexts(children: ReactNode, prefetch: (href: string) => void = () => {}) {
  const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch };
  return createElement(
    ImageConfigContext.Provider,
    { value: { ...imageConfigDefault, ...nextConfig.images } },
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(SearchParamsContext.Provider, { value: new URLSearchParams("next=/leaderboard") }, children),
    ),
  );
}

async function documentHtml(children: ReactNode) {
  const { prelude } = await prerenderToNodeStream(
    createElement("html", null, createElement("head"), createElement("body", null, withContexts(children))),
  );
  let html = "";
  for await (const chunk of prelude) html += chunk.toString();
  return html;
}

describe("signed-out Home: calls to action warm on intent", () => {
  it("turns off sight prefetch on every landing link", () => {
    for (const path of ["components/landing/landing-links.tsx", "components/landing/sections.tsx"]) {
      const links = read(path).match(/<Link\b[^>]*>/g) ?? [];
      assert.ok(links.length > 0, path);
      for (const link of links) assert.match(link, /prefetch=\{false\}/, `${path}: ${link}`);
    }
    // Every other landing link is an IntentLink, whose one <Link> is pinned above.
    const links = read("components/landing/landing-links.tsx");
    assert.equal((links.match(/<Link\b/g) ?? []).length, 1);
    assert.match(links, /onPointerEnter=\{warm\} onTouchStart=\{warm\} onFocus=\{warm\}/);
  });

  it("prefetches nothing on render, then the one link a reader points at, touches or focuses", async () => {
    const { LandingLogin, LandingOpen } = await import("@/components/landing/landing-links");
    const { createRoot } = await import("react-dom/client");
    const warmed: string[] = [];
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        withContexts(createElement("div", null, createElement(LandingLogin), createElement(LandingOpen), createElement(LandingOpen)), (href) =>
          warmed.push(href),
        ),
      );
    });
    cleanup = () => {
      act(() => root.unmount());
      host.remove();
    };
    assert.deepEqual(warmed, [], "nothing before intent");

    const links = (href: string) => [...host.querySelectorAll("a")].filter((a) => a.getAttribute("href") === href);
    const opens = links("/signup?next=%2Fleaderboard");
    assert.equal(opens.length, 2, "the hero and the closing slab");
    const logins = links("/login?next=%2Fleaderboard");
    assert.equal(logins.length, 1, "the nav's Log in");

    await act(async () => {
      // React's onPointerEnter listens for pointerover.
      opens[0].dispatchEvent(new win.MouseEvent("pointerover", { bubbles: true, relatedTarget: win.document.body }));
    });
    assert.deepEqual(warmed, ["/signup?next=%2Fleaderboard"]);

    // A touch is also the page's first interaction: /login is warmed once, /signup isn't asked for again.
    await act(async () => {
      logins[0].dispatchEvent(new win.Event("touchstart", { bubbles: true }));
    });
    await act(async () => {
      logins[0].dispatchEvent(new win.FocusEvent("focusin", { bubbles: true }));
      opens[1].dispatchEvent(new win.FocusEvent("focusin", { bubbles: true }));
      opens[0].dispatchEvent(new win.MouseEvent("pointerover", { bubbles: true, relatedTarget: win.document.body }));
    });
    assert.deepEqual(warmed, ["/signup?next=%2Fleaderboard", "/login?next=%2Fleaderboard"]);
  });

  it("warms /signup and /login on the first interaction anywhere on the page, once", async () => {
    const { LandingOpen, LandingLogin } = await import("@/components/landing/landing-links");
    const { createRoot } = await import("react-dom/client");
    const warmed: string[] = [];
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        withContexts(createElement("div", null, createElement(LandingLogin), createElement(LandingOpen), createElement(LandingOpen)), (href) =>
          warmed.push(href),
        ),
      );
    });
    let unmounted = false;
    cleanup = () => {
      if (!unmounted) act(() => root.unmount());
      host.remove();
    };
    assert.deepEqual(warmed, [], "nothing on render");
    await act(async () => {
      win.document.body.dispatchEvent(new win.Event("pointermove", { bubbles: true }));
    });
    assert.deepEqual(warmed, ["/signup?next=%2Fleaderboard", "/login?next=%2Fleaderboard"]);
    await act(async () => {
      for (const type of ["scroll", "pointerdown", "keydown", "touchstart", "pointermove"]) {
        win.document.dispatchEvent(new win.Event(type, { bubbles: true }));
      }
    });
    assert.equal(warmed.length, 2, "only the first interaction warms");

    // Unmounted before any interaction: nothing is left listening.
    act(() => root.unmount());
    unmounted = true;
    const again: string[] = [];
    const host2 = win.document.createElement("div");
    win.document.body.appendChild(host2);
    const root2 = createRoot(host2);
    await act(async () => {
      root2.render(withContexts(createElement(LandingLogin), (href) => again.push(href)));
    });
    act(() => root2.unmount());
    host2.remove();
    await act(async () => {
      win.document.body.dispatchEvent(new win.Event("pointerdown", { bubbles: true }));
    });
    assert.deepEqual(again, []);
  });

  it("keeps the idle fallback after load, never in the load window", () => {
    const links = read("components/landing/landing-links.tsx");
    assert.match(links, /warmOnFirstInteraction\(\(\) => \{\s*prefetchOnce\(router, landingSignupHref\(next\)\);\s*prefetchOnce\(router, landingLoginHref\(next\)\);/);
    assert.match(links, /const warm = \(\) => prefetchOnce\(router, href\);/);
    const warm = read("lib/landing/warm-routes.ts");
    assert.match(warm, /host\.addEventListener\("load", afterLoad/);
    assert.match(warm, /afterFirstIdle\(\(\) => \{\s*if \(!done\) timer = host\.setTimeout\(fire, WARM_FALLBACK_MS\);/);
  });

  it("still counts each tap as a landing call to action", () => {
    const links = read("components/landing/landing-links.tsx");
    assert.equal((links.match(/trackEvent\("landing_cta_clicked", \{ button: "open" \}\)/g) ?? []).length, 1);
    assert.equal((links.match(/trackEvent\("landing_cta_clicked", \{ button: "login" \}\)/g) ?? []).length, 1);
    assert.match(read("components/landing/app-store-badge.tsx"), /trackEvent\("landing_cta_clicked", \{ button: "app_store" \}\)/);
  });
});

describe("signed-out Home: one hero photo in the head", () => {
  it("preloads only the hero card's photo, at high priority, before any other image", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const html = await documentHtml(createElement(LandingPage, { founder: FOUNDER, media: EMPTY_MEDIA }));
    const head = html.slice(0, html.indexOf("</head>"));
    const imagePreloads = [...head.matchAll(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g)].map((match) => match[0]);
    const hero = imagePreloads.filter((link) => link.includes("card-photos"));
    assert.equal(hero.length, 1, hero.join("\n"));
    assert.match(hero[0], /fetchPriority="high"/);
    assert.match(decodeURIComponent(hero[0]), /owner\/center\.jpg/);
    assert.equal(imagePreloads[0], hero[0], "the hero photo is the first image preload");
    // The logo is the first thing in the body; the browser finds it without a preload.
    assert.deepEqual(imagePreloads, hero, imagePreloads.join("\n"));

    // Only the hero card is high priority. Every other card photo waits until it is near the screen.
    const body = html.slice(html.indexOf("<body"));
    const photos = [...body.matchAll(/<img[^>]+>/g)].map((m) => m[0]).filter((img) => img.includes("card-photos"));
    assert.equal(photos.length, 4, "the hero card and the three in the collection grid");
    assert.deepEqual(
      photos.map((img) => /fetchPriority="high"/i.test(img)),
      [true, false, false, false],
    );
    assert.match(photos[0], /data-hero-card/);
    assert.doesNotMatch(photos[0], /loading="lazy"/);
    assert.ok(photos.slice(1).every((img) => /loading="lazy"/.test(img)));
    assert.equal((body.match(/fetchPriority="high"/gi) ?? []).length, 1, "one high-priority image on the page");
  });

  it("keeps the h1 the first big paint: opaque, visible, and never waiting on an image", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const html = await documentHtml(createElement(LandingPage, { founder: FOUNDER, media: EMPTY_MEDIA }));
    const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? "";
    assert.ok(h1.length > 0);
    assert.doesNotMatch(h1, /opacity-0|invisible|\bhidden\b|visibility|display:\s*none/);
    assert.match(h1, /^<h1 class="lg-h1">/);
    // The words are inline, so the h1 stays one text block for the browser's largest-paint pick.
    const css = read("app/landing.css");
    const words = css.match(/\.lg-w \{[^}]*\}/)?.[0] ?? "";
    assert.doesNotMatch(words, /display|opacity|transform|filter/);
    const wordFrames = css.slice(css.indexOf("@keyframes lg-word {"), css.indexOf("\n}\n", css.indexOf("@keyframes lg-word {")));
    assert.ok(wordFrames.length > 20);
    assert.doesNotMatch(wordFrames, /filter|transform|opacity/);
    for (const rule of css.matchAll(/\.lg-h1[^{]*\{[^}]*\}/g)) assert.doesNotMatch(rule[0], /opacity|visibility/);
    assert.ok(html.indexOf("<h1") < html.indexOf("data-hero-card"), "the heading comes before the card in the HTML");
  });
});

describe("signed-out Home: clips never block the page", () => {
  it("puts no video in the head and gives every clip preload=\"none\"", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const fixture = mediaRoot(ALL_MEDIA_FILES);
    try {
      // Load the clip player first, so the document below has the clips in place.
      await renderLoaded(withContexts(createElement(LandingPage, { founder: FOUNDER, media: fixture.media() })));
      const html = await documentHtml(createElement(LandingPage, { founder: FOUNDER, media: fixture.media() }));
      const head = html.slice(0, html.indexOf("</head>"));
      assert.doesNotMatch(head, /<video|\.mp4|as="video"|as="fetch"/);
      assert.doesNotMatch(head, /landing\/media\/(?!hero-card)/, "only the hero card may be preloaded");
      const videos = [...html.matchAll(/<video[^>]*>/g)].map((match) => match[0]);
      assert.equal(videos.length, 5);
      for (const video of videos) {
        assert.match(video, /preload="none"/);
        assert.match(video, /poster="\/landing\/media\/[a-z]+\.webp"/);
        assert.match(video, /\bmuted\b/);
        assert.match(video, /playsInline|playsinline/);
        assert.match(video, /\bloop\b/);
        assert.doesNotMatch(video, /autoplay/i);
      }
      // Stills other than the hero card load lazily.
      const stills = [...html.matchAll(/<img[^>]+>/g)].map((m) => m[0]).filter((img) => /serial-macro|share-rank/.test(img));
      assert.equal(stills.length, 2);
      assert.ok(stills.every((img) => /loading="lazy"/.test(img) && !/fetchPriority="high"/i.test(img)));
      assert.equal((html.match(/fetchPriority="high"/gi) ?? []).length, 2, "the hero card and its one preload");
    } finally {
      fixture.remove();
    }
  });
});

describe("signed-out Home: no client icon code", () => {
  it("draws the landing page's server icons without lucide-react's client Icon", () => {
    // lucide-react's Icon is "use client": one import from a server component
    // ships it in the first-load JS and hydrates it.
    for (const path of [
      "components/landing-page.tsx",
      "components/landing/glass-hero.tsx",
      "components/landing/glass-island.tsx",
      "components/landing/sections.tsx",
      "components/landing/feature-clip.tsx",
      "components/landing/feature-clip-player.tsx",
      "components/landing/landing-galaxy.tsx",
      "components/landing/app-store-badge.tsx",
    ]) {
      assert.doesNotMatch(read(path), /from "lucide-react"/, path);
    }
  });
});
