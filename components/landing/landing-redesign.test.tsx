import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => `${dir}/${name}`);
}

/** Every file the signed-out landing page is built from. */
const LANDING_FILES = ["components/landing-page.tsx", ...sources("components/landing"), ...sources("components/landing/showcase")];

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  state.reducedMotion = false;
  delete process.env.NEXT_PUBLIC_QUICK_COMP;
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

async function landingHtml() {
  const { LandingPage } = await import("@/components/landing-page");
  return renderToStaticMarkup(createElement(SearchParamsContext.Provider, { value: new URLSearchParams("") }, createElement(LandingPage)));
}

/** Every string a visitor can read: the page, the panels and each demo's last frame. */
async function everyWord(): Promise<string> {
  process.env.NEXT_PUBLIC_QUICK_COMP = "1";
  state.reducedMotion = true;
  const parts = [text(await landingHtml())];
  const { FeaturePanels, CHAPTERS, CAROUSEL_TABS } = await import("@/components/landing/feature-panels");
  parts.push(text(renderToStaticMarkup(createElement(FeaturePanels))));
  parts.push(...CHAPTERS.flatMap((chapter) => [chapter.title, chapter.line]), ...CAROUSEL_TABS.map((tab) => tab.tab));
  for (const file of ["scan-demo", "scan-result-demo", "quick-comp-demo", "timeline-demo", "graphs-demo", "leaderboard-demo"]) {
    const { default: Demo } = (await import(`@/components/landing/showcase/${file}`)) as { default: (props: { run: number }) => ReactNode };
    const host = await mount(createElement(Demo, { run: 0 }));
    parts.push(host.textContent ?? "", ...[...host.querySelectorAll("[aria-label]")].map((node) => node.getAttribute("aria-label") ?? ""));
    cleanup?.();
    cleanup = null;
  }
  return parts.join("\n");
}

describe("landing redesign: copy rules", () => {
  it('never says "best", "AI", "free" or "number one" anywhere a visitor can read', async () => {
    const words = await everyWord();
    assert.match(words, /Track your cards\. Comp them\. Show them off\./);
    assert.match(words, /Sample Rookie/, "the demos were read too");
    assert.doesNotMatch(words, /\bbest\b/i);
    assert.doesNotMatch(words, /\bAI\b/);
    assert.doesNotMatch(words, /\bfree\b/i);
    assert.doesNotMatch(words, /number one|\bno\. ?1\b|#1\b/i);
  });

  it("keeps the hobby rules: no marketplace, no TCG, no eBay data wording, no made-up counts", async () => {
    const words = await everyWord();
    assert.doesNotMatch(words, /marketplace|buy now|for sale|sell your/i);
    assert.doesNotMatch(words, /pok[eé]mon|tcg|mail day/i);
    // The Trawl credit's "not affiliated with eBay" disclaimer is the one allowed mention.
    assert.doesNotMatch(words, /eBay (data|logo|sold|sales|solds)/i);
    assert.equal(words.split(/ebay/i).length - 1, 1);
    assert.doesNotMatch(words, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i);
    assert.doesNotMatch(words, /testimonial|trusted by|loved by/i);
  });

  it("has no teal in any landing file, its styles or its new asset", () => {
    const teal = /teal|#(?:34C1AE|2dd4bf|14b8a6|0d9488|5eead4|1f9e8c|0f766e|99f6e4|ccfbf1)\b|cyan-|emerald-/i;
    for (const file of [...LANDING_FILES, "public/landing/sample-raw-card.svg"]) assert.doesNotMatch(read(file), teal, file);
    const css = read("app/globals.css");
    const mine = css.slice(css.indexOf("Landing redesign."), css.indexOf("The landing showcase and the onboarding intro are dark"));
    assert.ok(mine.length > 500);
    assert.doesNotMatch(mine, teal);
  });

  it("adds no motion or carousel library", () => {
    for (const file of LANDING_FILES) assert.doesNotMatch(read(file), /from "(framer-motion|motion|gsap|lottie|swiper|embla)/, file);
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies)) assert.doesNotMatch(name, /framer|gsap|lottie|swiper|embla|three/);
  });
});

describe("landing redesign: hero", () => {
  it("shows a phone with the sample collection value over the slabs, drawn on the server", async () => {
    const html = await landingHtml();
    const phone = html.slice(html.indexOf("data-phone-frame"), html.indexOf("data-hero-caption"));
    assert.match(text(phone), /Collection Sample Collection value \$412 \+\$38 · 10\.2% Last 90 days/);
    assert.match(phone, /role="img" aria-label="Sample collection value \$412, up \$38 in 90 days"/);
    assert.match(phone, /data-hero-slabs="sample"/);
    assert.match(html, /data-tilt=""/);
    for (const file of ["components/landing/hero-phone.tsx", "components/landing/phone-frame.tsx"]) {
      assert.doesNotMatch(read(file), /^"use client";/m, file);
      assert.doesNotMatch(read(file), /\.png|\.jpe?g|next\/image/, `${file}: no screenshot, no optimizer`);
    }
  });

  it("holds the App Store buttons' rows on the server and links them on the web only", async () => {
    const { AppStoreBadge } = await import("@/components/landing/app-store-badge");
    const { APP_STORE_URL } = await import("@/components/landing/app-store-link");
    for (const variant of ["button", "badge"] as const) {
      const server = renderToStaticMarkup(createElement(AppStoreBadge, { variant }));
      assert.match(server, new RegExp(`data-app-store-badge="${variant}"[^>]*class="[^"]*h-14`));
      assert.doesNotMatch(server, /<a\b/);
      const host = await mount(createElement(AppStoreBadge, { variant }));
      const link = host.querySelector("a");
      assert.equal(link?.getAttribute("href"), APP_STORE_URL);
      assert.match(link?.className ?? "", /h-14/, "a 56px tap target");
      assert.match(variant === "button" ? (link?.textContent ?? "") : (link?.getAttribute("aria-label") ?? ""), variant === "button" ? /^Get the app$/ : /^Download Slabhold on the App Store$/);
      cleanup?.();
      cleanup = null;
    }
    const native = win as unknown as { Capacitor?: { isNativePlatform: () => boolean } };
    native.Capacitor = { isNativePlatform: () => true };
    try {
      const host = await mount(createElement(AppStoreBadge, { variant: "badge" }));
      assert.equal(host.querySelector("a"), null);
    } finally {
      delete native.Capacitor;
    }
  });

  it("keeps the legal links and the page's canonical", async () => {
    const html = await landingHtml();
    for (const href of ["/privacy", "/terms", "/support"]) assert.match(html, new RegExp(`href="${href}"`));
    assert.match(read("app/welcome/page.tsx"), /alternates: \{ canonical: "\/" \}/);
  });
});

describe("landing redesign: tilt", () => {
  it("leans toward the pointer, flat in the middle, capped at the edges", async () => {
    const { tiltFor, TILT_MAX_DEG } = await import("@/components/landing/tilt");
    assert.deepEqual(tiltFor(100, 200, 200, 400), { x: 0, y: 0 });
    assert.deepEqual(tiltFor(0, 0, 200, 400), { x: TILT_MAX_DEG, y: -TILT_MAX_DEG });
    assert.deepEqual(tiltFor(200, 400, 200, 400), { x: -TILT_MAX_DEG, y: TILT_MAX_DEG });
    assert.deepEqual(tiltFor(900, -50, 200, 400), { x: TILT_MAX_DEG, y: TILT_MAX_DEG }, "clamped outside the box");
    assert.deepEqual(tiltFor(10, 10, 0, 0), { x: 0, y: 0 });
  });

  it("stays flat for reduced motion and settles when the pointer leaves", async () => {
    const { Tilt } = await import("@/components/landing/tilt");
    const frames: (() => void)[] = [];
    const raf = win.requestAnimationFrame;
    win.requestAnimationFrame = ((run: () => void) => frames.push(run)) as unknown as typeof win.requestAnimationFrame;
    try {
      const host = await mount(createElement(Tilt, null, createElement("p", null, "card")));
      const node = host.querySelector<HTMLElement>("[data-tilt]")!;
      node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 }) as DOMRect;
      const move = () => act(() => void node.dispatchEvent(new win.MouseEvent("pointermove", { bubbles: true, clientX: 200, clientY: 0 })));

      state.reducedMotion = true;
      move();
      assert.equal(frames.length, 0);
      assert.equal(node.style.getPropertyValue("--tilt-y"), "");

      state.reducedMotion = false;
      move();
      frames.splice(0).forEach((run) => run());
      assert.equal(node.style.getPropertyValue("--tilt-y"), "7deg");
      assert.equal(node.style.getPropertyValue("--tilt-x"), "7deg");
      assert.ok(node.hasAttribute("data-tilting"));

      act(() => void node.dispatchEvent(new win.MouseEvent("pointerout", { bubbles: true })));
      assert.equal(node.style.getPropertyValue("--tilt-y"), "");
      assert.ok(!node.hasAttribute("data-tilting"));
    } finally {
      win.requestAnimationFrame = raf;
    }
    const css = read("app/globals.css");
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.landing-tilt \{\s*transform: none;/);
  });
});

describe("landing redesign: scroll reveals", () => {
  it("are CSS view timelines, only with motion allowed and where the browser has them", () => {
    const css = read("app/globals.css");
    assert.match(
      css,
      /@media \(prefers-reduced-motion: no-preference\) \{\s*@supports \(animation-timeline: view\(\)\) \{\s*\.landing-reveal \{[^}]*animation-timeline: view\(\);/,
    );
    // Outside that block the class sets nothing, so content is never hidden without it.
    assert.equal(css.split(".landing-reveal {").length - 1, 1);
    // Transform only: a part that is half way in never has faded, low-contrast text.
    const frames = css.slice(css.indexOf("@keyframes landing-reveal"), css.indexOf("@media", css.indexOf("@keyframes landing-reveal")));
    assert.match(frames, /from \{\s*transform: translateY\(40px\) scale\(0\.96\);/);
    assert.doesNotMatch(frames, /opacity/);
    assert.ok((read("components/landing/feature-panels.tsx").match(/landing-reveal/g) ?? []).length >= 3);
  });
});

describe("landing redesign: scanner showcase", () => {
  it("scans a made-up raw card: no real player, no grader, no cert, a plain drawn photo", async () => {
    const { SAMPLE_SCAN, SAMPLE_SCAN_PHOTO } = await import("@/components/landing/showcase/sample-data");
    assert.equal(SAMPLE_SCAN.playerName, "Sample Rookie");
    assert.equal(SAMPLE_SCAN.grade, null);
    assert.equal(SAMPLE_SCAN_PHOTO, "/landing/sample-raw-card.svg");
    const svg = read("public/landing/sample-raw-card.svg");
    assert.doesNotMatch(svg, /<image|<text|href=|PSA|BGS|SGC|CGC|NBA|NFL|MLB|NHL/);
    assert.ok(svg.length < 2500);
  });

  it("prices the sample sales with the scanner's own maths and draws one dot per sale", async () => {
    const { SAMPLE_SCAN_COMP, scanValue } = await import("@/components/landing/showcase/sold-panel");
    const { SAMPLE_SCAN_SALES } = await import("@/components/landing/showcase/sample-data");
    assert.equal(SAMPLE_SCAN_COMP.status, "ok");
    assert.equal(SAMPLE_SCAN_COMP.nSales, SAMPLE_SCAN_SALES.length);
    assert.equal(scanValue(), "$128.00");
    state.reducedMotion = true;
    const { default: ScanResultDemo } = await import("@/components/landing/showcase/scan-result-demo");
    const host = await mount(createElement(ScanResultDemo, { run: 0 }));
    assert.equal(host.querySelectorAll("[data-sold-panel] [role='img'] > span.rounded-full").length, SAMPLE_SCAN_SALES.length);
    assert.match(host.textContent ?? "", /8 sample sales · Recent sold prices via Trawl/);
  });

  it("plays camera, sheet, name, then price, with the scanner's own parts", async () => {
    const { default: ScanDemo, SCAN_BEATS, SCAN_STAGES } = await import("@/components/landing/showcase/scan-demo");
    assert.deepEqual([...SCAN_STAGES], ["camera", "sheet", "name", "price"]);
    assert.ok(SCAN_BEATS.sheet < SCAN_BEATS.name && SCAN_BEATS.name < SCAN_BEATS.price);
    const source = read("components/landing/showcase/scan-demo.tsx");
    assert.match(source, /import \{ RevealCard, RevealName, RevealNameSkeleton \} from "@\/components\/scan\/sheet-parts";/);
    assert.match(read("components/landing/showcase/sold-panel.tsx"), /import \{ SalesDots \} from "@\/components\/scan\/sales-dots";/);

    // No IntersectionObserver here, so it plays at once. Timers are stepped by hand.
    const realObserver = globalThis.IntersectionObserver;
    const realSet = win.setTimeout;
    const realClear = win.clearTimeout;
    const queue: { at: number; run: () => void }[] = [];
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: undefined });
    win.setTimeout = ((run: () => void, at = 0) => queue.push({ at, run })) as unknown as typeof win.setTimeout;
    win.clearTimeout = (() => {}) as typeof win.clearTimeout;
    try {
      const host = await mount(createElement(ScanDemo));
      const demo = host.querySelector<HTMLElement>("[data-scan-demo]")!;
      const stage = () => demo.getAttribute("data-scan-stage");
      assert.equal(stage(), "camera");
      assert.equal(host.querySelector("[data-reveal]"), null, "no sheet yet");
      assert.match(host.textContent ?? "", /Point your camera at a card or slab/);
      const step = async (at: number) => {
        const due = queue.filter((timer) => timer.at === at);
        assert.ok(due.length > 0, `a timer at ${at}ms`);
        await act(async () => due.forEach((timer) => timer.run()));
      };
      await step(SCAN_BEATS.sheet);
      assert.equal(stage(), "sheet");
      assert.ok(host.querySelector('[data-reveal="scan-card"]'), "the card flips in");
      assert.ok(host.querySelector('[data-reveal="name-skeleton"]'), "a skeleton while it reads");
      await step(SCAN_BEATS.name);
      assert.equal(stage(), "name");
      assert.deepEqual(
        [...host.querySelectorAll("[data-stage]")].map((node) => [node.getAttribute("data-stage"), node.textContent?.trim()]),
        [
          ["player", "Sample Rookie"],
          ["set", "2023 Prizm"],
          ["number", "#101"],
          ["parallel", "Silver"],
          ["tags", "RC"],
        ],
      );
      assert.equal(host.querySelector("[data-sold-panel]"), null, "the price comes last");
      await step(SCAN_BEATS.price);
      assert.equal(stage(), "price");
      assert.ok(host.querySelector("[data-sold-panel]"));
    } finally {
      win.setTimeout = realSet;
      win.clearTimeout = realClear;
      Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: realObserver });
    }
  });

  it("shows the last frame with reduced motion: the name, the value and the dots, nothing timed", async () => {
    state.reducedMotion = true;
    const { default: ScanDemo } = await import("@/components/landing/showcase/scan-demo");
    const host = await mount(createElement(ScanDemo));
    const demo = host.querySelector<HTMLElement>("[data-scan-demo]")!;
    assert.equal(demo.getAttribute("data-scan-stage"), "price");
    assert.equal(demo.getAttribute("role"), "img");
    assert.equal(
      demo.getAttribute("aria-label"),
      "Sample scan: Sample Rookie, 2023 Prizm #101, Silver. Value $128.00 from 8 sample sales.",
    );
    assert.match(host.textContent ?? "", /Sample Rookie/);
    assert.match(host.textContent ?? "", /\$128\.00/);
    assert.equal(host.querySelectorAll("[data-sold-panel] [role='img'] > span.rounded-full").length, 8);
    const css = read("app/globals.css");
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{[^@]*\[data-scan-demo\] \[data-stage="set"\]/);
    assert.match(read("components/landing/showcase/scan-demo.tsx"), /motion-safe:animate-\[scan-card-in/);
  });
});

describe("landing redesign: feature carousel", () => {
  async function carousel(flag: boolean) {
    if (flag) process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    const { FeaturePanels } = await import("@/components/landing/feature-panels");
    const host = await mount(createElement(FeaturePanels));
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]')];
    const scroller = host.querySelector<HTMLElement>("[data-carousel-panels]")!;
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as typeof scroller.scrollTo;
    return { host, tabs, scroller, calls };
  }

  it("has a tab and a panel for Scan, Comp, Collection, Feed and Leaderboard; Comp needs its flag", async () => {
    const { host, tabs } = await carousel(true);
    assert.deepEqual(
      tabs.map((tab) => tab.firstChild?.textContent),
      ["Scan", "Comp", "Collection", "Feed", "Leaderboard"],
    );
    for (const tab of tabs) {
      assert.match(tab.className, /min-h-11/, "a 44px tap target");
      const panel = host.querySelector(`#${win.CSS.escape(tab.getAttribute("aria-controls")!)}`);
      assert.equal(panel?.getAttribute("role"), "tabpanel");
      assert.equal(panel?.getAttribute("aria-labelledby"), tab.id);
    }
    cleanup?.();
    cleanup = null;
    delete process.env.NEXT_PUBLIC_QUICK_COMP;
    const off = await carousel(false);
    assert.deepEqual(
      off.tabs.map((tab) => tab.firstChild?.textContent),
      ["Scan", "Collection", "Feed", "Leaderboard"],
    );
  });

  it("selects the tapped tab and scrolls to its panel; a jump with reduced motion; arrows move too", async () => {
    const { host, tabs, calls } = await carousel(true);
    const selected = () => tabs.map((tab) => tab.getAttribute("aria-selected"));
    const panels = () => [...host.querySelectorAll('[role="tabpanel"]')].map((panel) => panel.hasAttribute("inert"));
    assert.deepEqual(selected(), ["true", "false", "false", "false", "false"]);
    assert.deepEqual(panels(), [false, true, true, true, true], "only the shown panel can be tabbed into");

    await act(async () => tabs[3].click());
    assert.deepEqual(selected(), ["false", "false", "false", "true", "false"]);
    assert.equal(calls.at(-1)?.behavior, "smooth");
    assert.deepEqual(panels(), [true, true, true, false, true]);
    assert.deepEqual(tabs.map((tab) => tab.tabIndex), [-1, -1, -1, 0, -1]);

    state.reducedMotion = true;
    await act(async () => void tabs[3].dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(tabs[4].getAttribute("aria-selected"), "true");
    assert.equal(calls.at(-1)?.behavior, "auto");
    await act(async () => void tabs[4].dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(tabs[0].getAttribute("aria-selected"), "true", "wraps around");
  });

  it("marks the leaderboard as sample accounts, with names as plain text", async () => {
    const { FeaturePanels } = await import("@/components/landing/feature-panels");
    const html = renderToStaticMarkup(createElement(FeaturePanels));
    const board = html.slice(html.indexOf('data-chapter="leaderboard"'), html.indexOf('data-chapter="achievements"'));
    assert.match(board, />Sample accounts</);
    assert.match(board, /role="region" aria-label="Sample accounts, not real collectors"/);
    const { default: LeaderboardDemo } = await import("@/components/landing/showcase/leaderboard-demo");
    const { SAMPLE_BOARD } = await import("@/components/landing/showcase/sample-data");
    const host = await mount(createElement(LeaderboardDemo, { run: 0 }));
    assert.equal(host.querySelectorAll("a").length, 0);
    assert.equal(host.querySelectorAll("[data-place]").length, SAMPLE_BOARD.length);
    for (const img of host.querySelectorAll("img")) {
      assert.match(img.getAttribute("src") ?? "", /^\/landing\/avatars\/[a-z0-9_]+\.webp$/);
      assert.equal(img.getAttribute("loading"), "lazy");
      assert.ok(img.getAttribute("width") && img.getAttribute("height"), "sized, so nothing shifts");
    }
    assert.ok(existsSync(join(ROOT, "public/landing/sample-raw-card.svg")));
  });
});
