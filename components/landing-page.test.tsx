import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { ALL_SCREEN_FILES, FIXTURE_POSTS, htmlText, mediaRoot, withLandingContexts } from "@/lib/test/landing-fixtures";

const { win } = installDom();

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const FLAG = process.env.NEXT_PUBLIC_QUICK_COMP;
afterEach(() => {
  if (FLAG === undefined) delete process.env.NEXT_PUBLIC_QUICK_COMP;
  else process.env.NEXT_PUBLIC_QUICK_COMP = FLAG;
});

async function landing(props: Record<string, unknown> = {}, search = "") {
  const { LandingPage } = await import("@/components/landing-page");
  return renderToStaticMarkup(withLandingContexts(createElement(LandingPage, { media: EMPTY_MEDIA, ...props }), search));
}

describe("landing page", () => {
  it("leads with Talk cards here, the timeline, then the five features and Join Slabhold, in order", async () => {
    const html = await landing({ posts: FIXTURE_POSTS });
    const sections = [...html.matchAll(/data-section="([a-z-]+)"/g)].map((match) => match[1]);
    assert.deepEqual(sections, ["hero", "timeline", "profile-cards", "scan", "collection", "catalog", "board", "join"]);
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map((match) => htmlText(match[1]).trim());
    assert.deepEqual(headings, [
      "Talk cards here.",
      "A timeline that's only cards.",
      "Your cards, front and center",
      "Scan a card. See what it sold for.",
      "Your cards, and what they're worth.",
      "Swipe the catalog.",
      "The weekly board.",
      "Join Slabhold",
    ]);
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
  });

  it("keeps Log in and Open Slabhold, carrying ?next=", async () => {
    const html = await landing({}, "next=/leaderboard");
    assert.equal((html.match(/href="\/login\?next=%2Fleaderboard"/g) ?? []).length, 1, "the nav's Log in");
    assert.equal((html.match(/href="\/signup\?next=%2Fleaderboard"/g) ?? []).length, 2, "Open Slabhold in the hero and the close");
    assert.equal((htmlText(html).match(/Open Slabhold/g) ?? []).length, 2);
    assert.match(htmlText(html), /Log in/);
  });

  it("keeps the footer links and the tagline", async () => {
    const html = await landing();
    for (const href of ["/privacy", "/terms", "/support"]) assert.match(html, new RegExp(`<a[^>]*href="${href}"`));
    assert.match(htmlText(html), /Privacy\s+Terms\s+Support\s+Built by collectors, for collectors\./);
    assert.match(read("app/welcome/page.tsx"), /alternates: \{ canonical: "\/" \}/);
  });

  it("states the app's schema.org facts, with no rating", async () => {
    const { APP_JSON_LD } = await import("@/components/landing-page");
    assert.deepEqual(
      { ...APP_JSON_LD, url: "" },
      {
        "@context": "https://schema.org",
        "@type": "MobileApplication",
        name: "Slabhold",
        operatingSystem: "iOS",
        applicationCategory: "LifestyleApplication",
        url: "",
        installUrl: "https://apps.apple.com/app/id6831357026",
      },
    );
    assert.match(await landing(), /<script type="application\/ld\+json">/);
    assert.match(read("app/layout.tsx"), /itunes: \{ appId: "6831357026" \}/, "the smart app banner stays");
  });

  it("has no Quick Comp, with the flag on or off", async () => {
    for (const flag of ["1", undefined] as const) {
      if (flag) process.env.NEXT_PUBLIC_QUICK_COMP = flag;
      else delete process.env.NEXT_PUBLIC_QUICK_COMP;
      const fixture = mediaRoot(ALL_SCREEN_FILES, { hero: true });
      try {
        const html = await landing({ posts: FIXTURE_POSTS, media: fixture.media() });
        assert.doesNotMatch(html, /Quick Comp|quick-comp|see its comps|comp it in the app|via Trawl|eBay/i);
        assert.doesNotMatch(htmlText(html), /\$\s?\d/, "no price is drawn");
      } finally {
        fixture.remove();
      }
    }
    for (const gone of [
      "components/landing/quick-comp-section.tsx",
      "components/landing/showcase/quick-comp-demo.tsx",
      "lib/landing/founder-comp.ts",
      "lib/landing/founder-comp-load.ts",
    ]) {
      assert.equal(existsSync(join(ROOT, gone)), false, gone);
    }
    for (const file of ["components/landing-page.tsx", "components/landing/sections.tsx", "components/landing/landing-links.tsx", "app/welcome/page.tsx", "app/(app)/page.tsx"]) {
      assert.doesNotMatch(read(file), /QUICK_COMP|QuickComp|LandingCompProvider|LandingCompContext/, file);
    }
  });

  it("is the rebuilt page: none of the Glass Slab parts are drawn or left in the tree", async () => {
    const fixture = mediaRoot(ALL_SCREEN_FILES, { hero: true });
    try {
      const html = await landing({ posts: FIXTURE_POSTS, media: fixture.media() });
      assert.doesNotMatch(html, /class="lg[" -]|lg-glass|lg-galaxy|lg-shard|lg-glow|lg-pause|lg-panel|data-glass-hero|feDisplacementMap/);
      assert.doesNotMatch(html, /<button/, "no pause or play control");
      assert.doesNotMatch(htmlText(html), /Scan it\. Know the exact version|you pick the exact version|Straightened on the spot|Every parallel|The weekly arena|Cards first\.|Coming soon|Get the app/);
      assert.doesNotMatch(html, /Painter|Lawrence/i);
    } finally {
      fixture.remove();
    }
    for (const gone of [
      "components/landing/landing-galaxy.tsx",
      "components/landing/glass-hero.tsx",
      "components/landing/glass-island.tsx",
      "components/landing/tilt.tsx",
      "components/landing/feature-clip.tsx",
      "components/landing/feature-clip-player.tsx",
      "components/landing/app-store-link.tsx",
      "lib/landing/founder-showcase.ts",
      "lib/landing/pulls.ts",
    ]) {
      assert.equal(existsSync(join(ROOT, gone)), false, gone);
    }
    assert.doesNotMatch(read("components/landing/sections.tsx"), /hitReveals|HIT_REVEALS|Coming soon/);
  });

  it("draws the page on the server: only the links, the badge and the clip are client code", () => {
    for (const file of ["components/landing-page.tsx", "components/landing/sections.tsx", "components/landing/landing-timeline.tsx"]) {
      assert.doesNotMatch(read(file), /^"use client";/m, file);
      assert.doesNotMatch(read(file), /useState|useEffect|supabase|social-provider|@\/components\/(home-feed|feed-view|post-view|composer)/, file);
    }
    for (const file of ["components/landing/landing-links.tsx", "components/landing/app-store-badge.tsx", "components/landing/screen-clip.tsx"]) {
      assert.match(read(file), /^"use client";/m, file);
      assert.doesNotMatch(read(file), /supabase|social-provider/, file);
    }
    const welcome = read("app/welcome/page.tsx");
    assert.match(welcome, /export const revalidate = 1800;/);
    assert.match(welcome, /const posts = await landingTimelinePosts\(\);/);
    assert.match(read("app/(app)/page.tsx"), /const landing = <LandingPage posts=\{posts\} \/>;/);
  });
});

describe("landing hero card", () => {
  it("shows the real card photo flat beside the copy when the file is there", async () => {
    const fixture = mediaRoot([], { hero: true });
    try {
      const html = await landing({ media: fixture.media() });
      const img = html.match(/<img[^>]*class="lp-hero-card"[^>]*>/)?.[0] ?? "";
      assert.match(decodeURIComponent(img), /landing\/hero-card\.jpg/);
      assert.match(img, /alt="A Jaxson Dart rookie card, orange and numbered 091\/199, in a one-touch case"/);
      assert.match(html, /data-hero-card="real"/);
    } finally {
      fixture.remove();
    }
    assert.ok(existsSync(join(ROOT, "public/landing/hero-card.jpg")), "the photo is committed");
    const css = read("app/landing.css");
    const rule = css.match(/\.lp-hero-card \{[^}]*\}/)?.[0] ?? "";
    assert.doesNotMatch(rule, /transform|filter|shadow|rotate|perspective/);
  });

  it("hides the photo when the file is missing: no broken src", async () => {
    const html = await landing();
    assert.match(html, /data-hero-card="none"/);
    assert.doesNotMatch(html, /lp-hero-card|hero-card\.jpg/);
  });
});

describe("landing App Store badge", () => {
  it("is Apple's official artwork, linked to the listing, as the main action in the nav, the hero and the close", async () => {
    const html = await landing();
    const badges = [...html.matchAll(/<div data-app-store-badge="(nav|primary)"[^>]*>([\s\S]*?)<\/div>/g)];
    assert.deepEqual(badges.map((match) => match[1]), ["nav", "primary", "primary"]);
    for (const [, , inner] of badges) {
      assert.match(inner, /<a href="https:\/\/apps\.apple\.com\/app\/id6831357026"/);
      assert.match(inner, /<img src="\/landing\/app-store-badge\.svg" alt="Download on the App Store"/);
      assert.equal(htmlText(inner).trim(), "", "the badge is the artwork, with no drawn label");
    }
    // In each pair of actions the badge comes first, ahead of Open Slabhold.
    for (const group of html.split('class="lp-ctas"').slice(1)) {
      assert.ok(group.indexOf("data-app-store-badge") < group.indexOf("Open Slabhold"));
    }
    const svg = read("public/landing/app-store-badge.svg");
    assert.match(svg, /<title>Download_on_the_App_Store_Badge_US-UK_RGB_blk_4SVG_092917<\/title>/, "Apple's own file, unchanged");
    const source = read("components/landing/app-store-badge.tsx");
    assert.doesNotMatch(source, /Get the app|<svg|<path/, "no hand-drawn Apple mark or custom label");
  });

  it("is hidden inside the iOS app, before the first paint and after", async () => {
    assert.match(read("app/landing.css"), /html\[data-native\] \[data-app-store-badge\] \{\s*display: none;\s*\}/);
    const { AppStoreBadge } = await import("@/components/landing/app-store-badge");
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    const native = win as unknown as { Capacitor?: unknown };
    native.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };
    try {
      await act(async () => {
        root.render(createElement(AppStoreBadge, { variant: "primary" }));
      });
      assert.equal(host.querySelectorAll("a").length, 0);
      assert.equal(host.querySelectorAll("img").length, 0);
      assert.equal(host.querySelectorAll("[data-app-store-badge]").length, 1, "the hidden wrapper stays, so nothing jumps");
    } finally {
      delete native.Capacitor;
      act(() => root.unmount());
      host.remove();
    }
  });
});

describe("landing screen slots", () => {
  it("draws no screen and no box while the files are missing", async () => {
    const html = await landing({ posts: FIXTURE_POSTS });
    assert.doesNotMatch(html, /data-landing-screen|lp-screens|landing\/screens|landing%2Fscreens|<video/);
    for (const id of ["profile-cards", "scan", "collection", "catalog", "board"]) {
      assert.match(html, new RegExp(`data-section="${id}" data-media="none"`), id);
    }
    const images = [...html.matchAll(/<img[^>]+src="([^"]*)"/g)].map((match) => match[1]);
    assert.ok(images.every((src) => src.length > 0));
  });

  it("draws each still once its file exists, lazily, at its own size, in the plain frame", async () => {
    for (const name of ALL_SCREEN_FILES) {
      const fixture = mediaRoot([name]);
      try {
        const html = await landing({ media: fixture.media() });
        const screens = [...html.matchAll(/<div class="lp-screen" data-landing-screen="still">(<img[^>]+>)<\/div>/g)].map((match) => match[1]);
        assert.equal(screens.length, 1, name);
        assert.ok(decodeURIComponent(screens[0]).includes(`/landing/screens/${name}`), name);
        assert.match(screens[0], /loading="lazy"/);
        assert.match(screens[0], /width="1170"/);
        assert.match(screens[0], /height="2532"/);
        assert.match(screens[0], /alt="[^"]{12,}"/);
        assert.doesNotMatch(screens[0], /fetchPriority="high"/i);
      } finally {
        fixture.remove();
      }
    }
  });

  it("shows reveal and sales when only those two scan screens are there, and the older sales name still works", async () => {
    const { scanShots } = await import("@/components/landing/sections");
    const two = mediaRoot(["scan-reveal.png", "card-sales.png"]);
    const old = mediaRoot(["scan-camera.png", "scan-sales.png"]);
    try {
      assert.deepEqual(scanShots(two.media()).map((shot) => shot.slot?.src), ["/landing/screens/scan-reveal.png", "/landing/screens/card-sales.png"]);
      assert.deepEqual(scanShots(old.media()).map((shot) => shot.slot?.src ?? null), ["/landing/screens/scan-camera.png", null, "/landing/screens/scan-sales.png"]);
    } finally {
      two.remove();
      old.remove();
    }
  });

  it("gives the profile cards screen the big spot, right after the timeline", async () => {
    const fixture = mediaRoot(["profile-cards.png", "profile-cards.mp4"]);
    try {
      const html = await landing({ media: fixture.media() });
      const section = html.slice(html.indexOf('data-section="profile-cards"'), html.indexOf('data-section="scan"'));
      assert.match(section, /data-media="real"/);
      assert.match(section, /class="lp-screens" data-screens="1" data-big=""/);
      assert.match(section, /data-landing-screen="clip"/);
      assert.match(htmlText(section), /Your cards, front and center\s+Your profile opens on your cards, in a row you can scroll\./);
    } finally {
      fixture.remove();
    }
  });
});
