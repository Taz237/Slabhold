import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  state.reducedMotion = false;
});

async function landingHtml() {
  const { LandingPage } = await import("@/components/landing-page");
  return renderToStaticMarkup(
    createElement(SearchParamsContext.Provider, { value: new URLSearchParams("next=/leaderboard") }, createElement(LandingPage)),
  );
}

async function mountPanels() {
  const { FeaturePanels } = await import("@/components/landing/feature-panels");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(FeaturePanels));
  });
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

describe("landing page", () => {
  it("leads with the headline, Open Slabhold and Log in, carrying next, and closes on Create account", async () => {
    const html = await landingHtml();
    assert.match(text(html), /Track your cards\. Comp them\. Show them off\./);
    assert.match(html, /href="\/signup\?next=%2Fleaderboard"[^>]*>Open Slabhold</);
    assert.match(html, /href="\/signup\?next=%2Fleaderboard"[^>]*>Create account</);
    assert.match(html, /href="\/login\?next=%2Fleaderboard"/);
    assert.match(text(html), /Join Slabhold/);
    assert.equal((html.match(/>Open Slabhold</g) ?? []).length, 1, "the hero's one primary action");
    assert.equal((html.match(/>Create account</g) ?? []).length, 1, "the final call to action");
    assert.ok(html.indexOf(">Open Slabhold<") < html.indexOf(">Create account<"));
    assert.match(html, /data-hero-slabs/);
  });

  it("makes no made-up claims and doesn't sell", async () => {
    const all = [await landingHtml(), read("components/landing/feature-panels.tsx")].join("\n");
    assert.doesNotMatch(all, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i);
    assert.doesNotMatch(all, /join (thousands|\d)/i);
    assert.doesNotMatch(all, /marketplace|buy now|for sale|sell your/i);
    assert.doesNotMatch(all, /pok[eé]mon|tcg|mail day/i);
    assert.doesNotMatch(all, /eBay data|eBay logo/i);
  });

  it("loads the feature panels lazily, below the hero, with a skeleton", () => {
    const landing = read("components/landing-page.tsx");
    const links = read("components/landing/landing-links.tsx");
    // Drawn in the server HTML; the code loads and hydrates once the page is idle.
    assert.match(links, /lazy\(\(\) =>[\s\S]*afterFirstIdle\(resolve\)[\s\S]*import\("@\/components\/landing\/feature-panels"\)/);
    assert.match(links, /<Suspense fallback=\{<PanelsSkeleton \/>\}>\s*<LazyPanels \/>/);
    assert.doesNotMatch(links, /from "next\/dynamic"/);
    assert.match(landing, /<FeaturePanels \/>/);
    assert.doesNotMatch(landing, /next\/image|\.png/);
    for (const file of ["components/landing-page.tsx", "components/landing/feature-panels.tsx", "components/landing/hero-slabs.tsx"]) {
      assert.doesNotMatch(read(file), /from "(framer-motion|motion|gsap|lottie|swiper|embla)/);
    }
  });

  it("shows the sample-marked chapters: the scanner, the carousel (Comp with its flag on) and the tiers", async () => {
    const flag = process.env.NEXT_PUBLIC_QUICK_COMP;
    const realObserver = globalThis.IntersectionObserver;
    // Every chapter is near the viewport, so each demo chunk loads.
    class NearObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback([{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: NearObserver });
    try {
      const host = await mountPanels();
      for (let tries = 0; tries < 20 && !host.querySelector('[data-showcase-demo="quick-comp"]'); tries += 1) {
        await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
      }
      const chapters = [...host.querySelectorAll("[data-chapter]")];
      assert.deepEqual(
        chapters.map((chapter) => chapter.getAttribute("data-chapter")),
        ["scan", "scan-result", "quick-comp", "graphs", "timeline", "leaderboard", "achievements"],
      );
      assert.deepEqual(
        chapters.map((chapter) => chapter.querySelector("h2, h3")?.textContent),
        [
          "Scan a card, see what it sold for",
          "Scan to comp",
          "Quick Comp",
          "Your collection, over time",
          "Collectors talking cards",
          "Weekly leaderboards",
          "Earn every tier",
        ],
      );
      for (const chapter of chapters) assert.match(chapter.textContent ?? "", /Sample/);
      const quickComp = chapters[2];
      assert.match(quickComp.textContent ?? "", /via Trawl/);
      const signup = quickComp.querySelector<HTMLAnchorElement>('a[href="/signup?next=%2Fcomp"]');
      assert.equal(signup?.textContent?.trim(), "Sign up to comp any card");
      const achievements = chapters[6];
      const slides = achievements.querySelectorAll('[aria-roledescription="slide"]');
      assert.equal(slides.length, 6);
      assert.equal(achievements.querySelectorAll("[data-badge]").length, 6);
      assert.equal(achievements.querySelectorAll(".badge-legendary").length, 1, "only Legendary glows");
      const dots = host.querySelectorAll('[aria-label="Choose a panel"] button');
      assert.equal(dots.length, 6);
      assert.equal(dots[0].getAttribute("aria-current"), "true");
      for (const dot of dots) assert.ok(dot.getAttribute("aria-label")?.startsWith("Show "));
      cleanup?.();
      cleanup = null;

      delete process.env.NEXT_PUBLIC_QUICK_COMP;
      const off = await mountPanels();
      assert.deepEqual(
        [...off.querySelectorAll("[data-chapter]")].map((chapter) => chapter.getAttribute("data-chapter")),
        ["scan", "scan-result", "graphs", "timeline", "leaderboard", "achievements"],
      );
      assert.equal(off.querySelector('[data-chapter="quick-comp"]'), null);
    } finally {
      if (flag === undefined) delete process.env.NEXT_PUBLIC_QUICK_COMP;
      else process.env.NEXT_PUBLIC_QUICK_COMP = flag;
      Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: realObserver });
    }
  });

  it("jumps without smooth scrolling for reduced motion", async () => {
    const host = await mountPanels();
    const scroller = host.querySelector<HTMLElement>('[data-chapter="achievements"] .snap-x');
    assert.ok(scroller);
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as typeof scroller.scrollTo;
    const dots = host.querySelectorAll<HTMLButtonElement>('[aria-label="Choose a panel"] button');

    await act(async () => dots[2].click());
    assert.equal(calls.at(-1)?.behavior, "smooth");
    assert.equal(dots[2].getAttribute("aria-current"), "true");

    state.reducedMotion = true;
    await act(async () => dots[3].click());
    assert.equal(calls.at(-1)?.behavior, "auto");
  });

  it("uses brand purple, not teal, for the sample gain and an available username", () => {
    const panels = read("components/landing/feature-panels.tsx");
    const auth = read("components/auth-form.tsx");
    for (const source of [panels, auth]) assert.doesNotMatch(source, /#34C1AE|#1f9e8c/i);
    assert.match(panels, /text-\[#A78BFA\] tabular-nums">\+\$38 · 10\.2%/);
    assert.match(auth, /text-\[#7C3AED\] dark:text-\[#A78BFA\]">\s*@\{check\.value\} is available/);
  });

  it("tilts the hero slabs with a static transform and no float loop", () => {
    const css = read("app/globals.css");
    assert.doesNotMatch(css, /@keyframes landing-float/);
    assert.match(css, /\.landing-float \{\s*transform: rotate\(var\(--tilt, 0deg\)\);\s*\}/);
  });
});

const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";

function founderCard(id: string, playerName: string) {
  return {
    id,
    photoUrl: `${PHOTOS}/owner/${id}.jpg`,
    playerName,
    year: 2023,
    yearLabel: "2023",
    setBrand: "Prizm",
    grade: "PSA 10",
    gradeQualifier: "",
    certNumber: "",
    accent: "#7c5cff",
    conditionType: "graded" as const,
    grader: "PSA",
  };
}

const FOUNDER = {
  cards: [founderCard("a", "Top Card"), founderCard("b", "Second Card"), founderCard("c", "Third Card")],
};

describe("landing founder touch", () => {
  it("holds the hero slabs hidden while the founder's cards load", async () => {
    const html = await landingHtml();
    assert.match(html, /data-hero-slabs="sample"/);
    assert.match(html, /opacity-0/);
    assert.match(html, /data-founder-note="plain"/);
  });

  it("draws the founder's slabs and the plain brand note on first paint when the server sends the showcase", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const html = renderToStaticMarkup(
      createElement(
        ImageConfigContext.Provider,
        { value: { ...imageConfigDefault, ...nextConfig.images } },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams() },
          createElement(LandingPage, { founder: FOUNDER }),
        ),
      ),
    );
    assert.match(html, /data-hero-slabs="founder"/);
    assert.match(html, /data-founder-note="plain"/);
    assert.doesNotMatch(html, /From the founder|Follow on Slabhold|donnietaz|Donnie/i);
    assert.match(text(html), /From a Slabhold collection/);
    assert.match(html, /data-hero-slabs="founder"><div[^>]*><\/div><div class="[^"]*transition-opacity[^"]*opacity-100"/);
  });

  it("keeps the sample slabs when the server showcase is empty, with no client fetch", async () => {
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
        root.render(
          createElement(
            SearchParamsContext.Provider,
            { value: new URLSearchParams() },
            createElement(LandingPage, { founder: { cards: [] } }),
          ),
        );
      });
      cleanup = () => {
        act(() => root.unmount());
        host.remove();
      };
      assert.equal(host.querySelector("[data-hero-slabs]")?.getAttribute("data-hero-slabs"), "sample");
      assert.equal(host.querySelector("[data-founder-note]")?.getAttribute("data-founder-note"), "plain");
      assert.deepEqual(calls.filter((url) => url.includes("/api/landing/founder")), []);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("loads the showcase on the server through the hour cache and preloads the hero photos", () => {
    const page = read("app/(app)/page.tsx");
    assert.match(read("lib/landing/founder-page.ts"), /cachedFounderShowcase\(\)/);
    assert.match(read("app/welcome/page.tsx"), /await welcomeFounderShowcase\(\)/);
    assert.match(page, /<HomeGate landing=\{<LandingPage founder=\{founder\} \/>\}/);
    const loader = read("lib/landing/founder-load.ts");
    assert.match(loader, /unstable_cache\(\s*loadFounderShowcase,\s*\["landing-founder"\],\s*\{\s*revalidate: 3600/);
    assert.match(read("app/api/landing/founder/route.ts"), /founderResponse\(cachedFounderShowcase\)/);
    assert.doesNotMatch(read("components/app-shell.tsx"), /<LandingPage/);
    assert.match(read("components/landing/hero-slabs.tsx"), /preload/);
  });

  it("puts the founder's 3 public card photos in the hero, best in the center", async () => {
    const { HeroSlabs } = await import("@/components/landing/hero-slabs");
    const html = renderToStaticMarkup(
      createElement(
        ImageConfigContext.Provider,
        { value: { ...imageConfigDefault, ...nextConfig.images } },
        createElement(HeroSlabs, { cards: FOUNDER.cards }),
      ),
    );
    assert.match(html, /data-hero-slabs="founder"/);
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => decodeURIComponent(match[1]));
    assert.equal(images.length, 3);
    assert.ok(images.every((src) => src.startsWith("/_next/image?url=") && src.includes("/card-photos/owner/")));
    const order = ["Second Card", "Top Card", "Third Card"].map((name) => html.indexOf(name));
    assert.ok(order.every((at) => at > 0) && order[0] < order[1] && order[1] < order[2], "left, center, right");
    assert.match(text(html), /From a Slabhold collection/);
    assert.doesNotMatch(text(html), /From @|donnietaz/);
    assert.doesNotMatch(html, /Your grail/);
  });

  it("asks for the center slab's photo first and loads none of the hero lazily", async () => {
    const { HeroSlabs } = await import("@/components/landing/hero-slabs");
    const html = renderToStaticMarkup(
      createElement(
        ImageConfigContext.Provider,
        { value: { ...imageConfigDefault, ...nextConfig.images } },
        createElement(HeroSlabs, { cards: FOUNDER.cards }),
      ),
    );
    const imgs = [...html.matchAll(/<img[^>]+>/g)].map((match) => match[0]);
    assert.equal(imgs.length, 3);
    // Left, center, right. The center slab is the widest: the Home LCP.
    assert.deepEqual(
      imgs.map((img) => /fetchPriority="high"/i.test(img)),
      [false, true, false],
    );
    assert.ok(imgs.every((img) => !/loading="lazy"/.test(img)), "no hero photo lazy-loads");
    assert.ok(imgs.every((img) => /sizes="\(min-width: 1024px\) 140px, 38vw"/.test(img)));
  });

  it("falls back to the sample slabs, marked as samples, with no founder cards", async () => {
    const { HeroSlabs, heroSlots } = await import("@/components/landing/hero-slabs");
    const html = renderToStaticMarkup(createElement(HeroSlabs, { cards: [] }));
    assert.match(html, /data-hero-slabs="sample"/);
    assert.match(text(html), /Your grail.*Rookie auto.*Short print/);
    assert.match(text(html), /Sample slabs/);
    assert.doesNotMatch(html, /<img/);
    const mixed = heroSlots(FOUNDER.cards.slice(0, 1));
    assert.deepEqual(mixed.map((slot) => Boolean(slot.photo)), [false, true, false]);
  });

  it("keeps the side slabs clear of the center slab's space", async () => {
    const { HERO_PLACES } = await import("@/components/landing/hero-slabs");
    const pct = (className: string, prop: string) => Number(className.match(new RegExp(`${prop}-\\[([\\d.]+)%\\]`))?.[1]);
    const centerStart = 50 - pct(HERO_PLACES[1].className, "w") / 2;
    assert.ok(pct(HERO_PLACES[0].className, "left") + pct(HERO_PLACES[0].className, "w") <= centerStart);
    assert.ok(pct(HERO_PLACES[2].className, "right") + pct(HERO_PLACES[2].className, "w") <= centerStart);
  });

  it("always shows the plain brand note, with no founder name, handle, avatar or follow link", async () => {
    const { FounderNote } = await import("@/components/landing/founder-note");
    const html = renderToStaticMarkup(createElement(FounderNote));
    assert.match(html, /data-founder-note="plain"/);
    assert.match(text(html), /Built by collectors, for collectors\./);
    assert.doesNotMatch(html, /<a |rounded-full|avatar|From the founder|Follow on Slabhold/);
    const source = read("components/landing/founder-note.tsx");
    assert.doesNotMatch(source, /showcase|profile|avatar|founder_follow/);
  });

  it("drops off-site photos and any profile from the payload", async () => {
    const { readFounderShowcase } = await import("@/lib/landing/founder-showcase");
    const read = readFounderShowcase({
      profile: { username: "donnietaz", displayName: "", avatarUrl: "http://x/a.png" },
      cards: [{ ...founderCard("a", "Ok") }, { ...founderCard("b", "Off"), photoUrl: "https://evil.example/b.jpg" }, null],
    });
    assert.deepEqual(Object.keys(read), ["cards"]);
    assert.doesNotMatch(JSON.stringify(read), /donnietaz|avatar/);
    assert.deepEqual(read.cards.map((card) => card.id), ["a"]);
    assert.deepEqual(readFounderShowcase("nope"), { cards: [] });
  });
});

describe("panel index", () => {
  it("rounds to the nearest panel and stays in range", async () => {
    const { panelIndexAt } = await import("@/components/landing/feature-panels");
    assert.equal(panelIndexAt(0, 358, 5), 0);
    assert.equal(panelIndexAt(200, 358, 5), 1);
    assert.equal(panelIndexAt(5000, 358, 5), 4);
    assert.equal(panelIndexAt(100, 0, 5), 0);
  });
});
