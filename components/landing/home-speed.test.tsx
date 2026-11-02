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

/*
 * Signed-out Home speed pins: the calls to action warm their route on intent,
 * not on sight; the head preloads one hero photo, the center one; the
 * founder's avatar is fetched at the size it is drawn.
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
  profile: {
    username: "fixturefounder",
    displayName: "Fixture Founder",
    avatarUrl: `${HOST}/storage/v1/object/public/avatars/fixture-user/avatar.jpg`,
  },
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
    for (const path of ["components/landing/landing-links.tsx", "components/landing-page.tsx"]) {
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
    const { LandingActions, LandingLogin, LandingLink } = await import("@/components/landing/landing-links");
    const { createRoot } = await import("react-dom/client");
    const warmed: string[] = [];
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        withContexts(
          createElement(
            "div",
            null,
            createElement(LandingLogin),
            createElement(LandingActions, { next: "/leaderboard" }),
            createElement(LandingLink, { href: "/u/fixturefounder", button: "founder_follow" }, "Follow"),
          ),
          (href) => warmed.push(href),
        ),
      );
    });
    cleanup = () => {
      act(() => root.unmount());
      host.remove();
    };
    assert.deepEqual(warmed, [], "nothing before intent");

    const link = (href: string) => {
      const found = [...host.querySelectorAll("a")].find((a) => a.getAttribute("href") === href);
      assert.ok(found, href);
      return found;
    };
    const signup = link("/signup?next=%2Fleaderboard");
    const logins = [...host.querySelectorAll("a")].filter((a) => a.getAttribute("href") === "/login?next=%2Fleaderboard");
    assert.equal(logins.length, 2, "header and hero Log in");

    await act(async () => {
      // React's onPointerEnter listens for pointerover.
      signup.dispatchEvent(new win.MouseEvent("pointerover", { bubbles: true, relatedTarget: win.document.body }));
    });
    assert.deepEqual(warmed, ["/signup?next=%2Fleaderboard"]);

    await act(async () => {
      logins[0].dispatchEvent(new win.Event("touchstart", { bubbles: true }));
    });
    await act(async () => {
      logins[1].dispatchEvent(new win.FocusEvent("focusin", { bubbles: true }));
    });
    await act(async () => {
      link("/u/fixturefounder").dispatchEvent(new win.FocusEvent("focusin", { bubbles: true }));
    });
    assert.deepEqual(warmed, [
      "/signup?next=%2Fleaderboard",
      "/login?next=%2Fleaderboard",
      "/login?next=%2Fleaderboard",
      "/u/fixturefounder",
    ]);
  });

  it("still counts each tap as a landing call to action", () => {
    const links = read("components/landing/landing-links.tsx");
    assert.match(links, /trackEvent\("landing_cta_clicked", \{ button \}\)/);
    assert.match(links, /trackEvent\("landing_cta_clicked", \{ button: "signup" \}\)/);
    assert.equal((links.match(/trackEvent\("landing_cta_clicked", \{ button: "login" \}\)/g) ?? []).length, 2);
  });
});

describe("signed-out Home: one hero photo in the head", () => {
  it("preloads only the center slab's photo, at high priority, before any other image", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const html = await documentHtml(createElement(LandingPage, { founder: FOUNDER }));
    const head = html.slice(0, html.indexOf("</head>"));
    const imagePreloads = [...head.matchAll(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g)].map((match) => match[0]);
    const hero = imagePreloads.filter((link) => link.includes("card-photos"));
    assert.equal(hero.length, 1, hero.join("\n"));
    assert.match(hero[0], /fetchPriority="high"/);
    assert.match(decodeURIComponent(hero[0]), /owner\/center\.jpg/);
    assert.equal(imagePreloads[0], hero[0], "the LCP photo is the first image preload");
    // The logo is the first thing in the body; the browser finds it without a preload.
    assert.deepEqual(imagePreloads, hero, imagePreloads.join("\n"));

    // The side photos still load eagerly from the body, never lazily.
    const body = html.slice(html.indexOf("<body"));
    const heroImgs = [...body.matchAll(/<img[^>]+>/g)].map((m) => m[0]).filter((img) => img.includes("card-photos"));
    assert.equal(heroImgs.length, 3);
    assert.ok(heroImgs.every((img) => !/loading="lazy"/.test(img) && !/fetchPriority="low"/i.test(img)));
  });
});

describe("signed-out Home: founder avatar", () => {
  it("fetches the avatar at twice its drawn size, still with no optimizer", async () => {
    const { FounderNote } = await import("@/components/landing/founder-note");
    const html = await documentHtml(createElement(FounderNote, { showcase: FOUNDER }));
    const img = html.match(/<img[^>]*ring-2[^>]*>/)?.[0] ?? "";
    assert.match(
      img,
      /src="https:\/\/knuwflptobyutrauxblj\.supabase\.co\/storage\/v1\/render\/image\/public\/avatars\/fixture-user\/avatar\.jpg\?width=96&amp;height=96&amp;resize=cover"/,
    );
    assert.match(img, /width="48"/);
    assert.match(img, /height="48"/);
    assert.match(img, /loading="lazy"/);
    assert.doesNotMatch(img, /_next\/image/);
  });

  it("leaves an avatar from anywhere else as it is", async () => {
    const { FounderNote } = await import("@/components/landing/founder-note");
    const html = await documentHtml(
      createElement(FounderNote, {
        showcase: { ...FOUNDER, profile: { ...FOUNDER.profile!, avatarUrl: "https://cdn.example/avatar.png" } },
      }),
    );
    assert.match(html, /<img[^>]*src="https:\/\/cdn\.example\/avatar\.png"/);
  });
});

describe("signed-out Home: no client icon code", () => {
  it("draws the landing page's server icons without lucide-react's client Icon", () => {
    // lucide-react's Icon is "use client": one import from a server component
    // ships it in the first-load JS and hydrates it.
    for (const path of ["components/landing/founder-note.tsx", "components/landing-page.tsx", "components/landing/hero-slabs.tsx"]) {
      assert.doesNotMatch(read(path), /from "lucide-react"/, path);
    }
  });
});
