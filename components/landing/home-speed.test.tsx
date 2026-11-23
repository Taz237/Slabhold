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
import { ALL_SCREEN_FILES, FIXTURE_POSTS, mediaRoot } from "@/lib/test/landing-fixtures";

/*
 * Signed-out Home speed pins: the calls to action warm their route on intent,
 * not on sight; the head preloads one photo, the hero card; the h1 is opaque
 * from the first paint; and no video or screenshot is in the head.
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
    assert.equal(opens.length, 2, "the hero and the close");
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
  it("preloads only the hero card's photo, at high priority: no screenshot, post photo or badge", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const fixture = mediaRoot(ALL_SCREEN_FILES, { hero: true });
    try {
      const html = await documentHtml(createElement(LandingPage, { posts: FIXTURE_POSTS, media: fixture.media() }));
      const head = html.slice(0, html.indexOf("</head>"));
      const imagePreloads = [...head.matchAll(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g)].map((match) => match[0]);
      assert.equal(imagePreloads.length, 1, imagePreloads.join("\n"));
      assert.match(imagePreloads[0], /fetchPriority="high"/);
      assert.match(decodeURIComponent(imagePreloads[0]), /landing\/hero-card\.jpg/);

      const body = html.slice(html.indexOf("<body"));
      const high = [...body.matchAll(/<img[^>]+>/g)].map((m) => m[0]).filter((img) => /fetchPriority="high"/i.test(img));
      assert.equal(high.length, 1, "one high-priority image on the page");
      assert.match(high[0], /class="lp-hero-card"/);
      assert.doesNotMatch(high[0], /loading="lazy"/);
      // Every screenshot, post photo and avatar waits until it is near the screen.
      const rest = [...body.matchAll(/<img[^>]+>/g)].map((m) => m[0]).filter((img) => /landing%2Fscreens|post-images|card-photos|avatars/.test(img));
      assert.ok(rest.length >= ALL_SCREEN_FILES.length - 1 + FIXTURE_POSTS.length, String(rest.length));
      for (const img of rest) {
        assert.match(img, /loading="lazy"/, img);
        assert.doesNotMatch(img, /fetchPriority="high"/i, img);
      }
    } finally {
      fixture.remove();
    }
  });

  it("keeps the h1 opaque and visible from the first paint, ahead of the card in the HTML", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const fixture = mediaRoot([], { hero: true });
    try {
      const html = await documentHtml(createElement(LandingPage, { media: fixture.media() }));
      const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? "";
      assert.equal(h1, '<h1 class="lp-h1">Talk cards here.</h1>');
      assert.doesNotMatch(h1, /opacity-0|invisible|\bhidden\b|visibility|display:\s*none/);
      const css = read("app/landing.css");
      for (const rule of css.matchAll(/\.lp-h1[^{]*\{[^}]*\}/g)) assert.doesNotMatch(rule[0], /opacity|visibility|filter|animation|transform/);
      assert.doesNotMatch(css, /@keyframes|animation:/, "nothing on the page animates in");
      assert.ok(html.indexOf("<h1") < html.indexOf("lp-hero-card"), "the heading comes before the card in the HTML");
    } finally {
      fixture.remove();
    }
  });
});

describe("signed-out Home: clips never block the page", () => {
  it("puts no video in the head or the server HTML: a clip is only its lazy still until it is on screen", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const clips = ["home-for-you", "scan-reveal", "card-sales", "catalog-feed", "profile-cards", "collection-value"];
    const fixture = mediaRoot([...ALL_SCREEN_FILES, ...clips.map((name) => `${name}.mp4`)], { hero: true });
    try {
      const html = await documentHtml(createElement(LandingPage, { posts: FIXTURE_POSTS, media: fixture.media() }));
      const head = html.slice(0, html.indexOf("</head>"));
      assert.doesNotMatch(head, /<video|\.mp4|as="video"|as="fetch"/);
      assert.doesNotMatch(head, /landing\/screens|landing%2Fscreens/, "no screen is preloaded");
      assert.doesNotMatch(html, /<video/, "the video is added by the browser, in view");
      assert.equal((html.match(/data-landing-screen="clip"/g) ?? []).length, clips.length);
    } finally {
      fixture.remove();
    }
  });
});

describe("signed-out Home: no client icon code", () => {
  it("draws the landing page without lucide-react's client Icon", () => {
    // lucide-react's Icon is "use client": one import from a server component
    // ships it in the first-load JS and hydrates it.
    for (const path of [
      "components/landing-page.tsx",
      "components/landing/sections.tsx",
      "components/landing/landing-timeline.tsx",
      "components/landing/screen-clip.tsx",
      "components/landing/app-store-badge.tsx",
    ]) {
      assert.doesNotMatch(read(path), /from "lucide-react"/, path);
    }
  });
});
