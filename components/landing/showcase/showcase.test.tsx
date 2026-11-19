import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompDemo } from "@/components/landing/showcase/sample-data";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();

const ROOT = process.cwd();
function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function sources(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => `${dir}/${name}`);
}

const SHOWCASE = sources("components/landing/showcase");

/** A made-up card standing in for the real one the page hands the panel. */
const REAL: CompDemo = {
  query: "Fixture Guard 2021 Fixture Set PSA 10",
  label: "Fixture Guard · 2021 Fixture Set · PSA 10",
  photo: { src: "/_next/image?url=fixture&w=128&q=75" },
  alt: "Fixture Guard, 2021 Fixture Set, PSA 10",
  sales: [
    { price: 310, when: "2d ago" },
    { price: 299.5, when: "4d ago" },
    { price: 285, when: "today" },
  ],
  stats: { median: 300, p25: 290, p75: 308, min: 285, max: 310, count: 9 },
  basis: "Based on 9 sales",
  real: true,
};
const INTRO = sources("components/onboarding/intro");
const ALL = [...SHOWCASE, ...INTRO, "components/landing/quick-comp-section.tsx", "components/landing/sections.tsx", "components/landing/glass-hero.tsx"];

const personasDoc = read("public/landing/avatars/personas.md");
const personaRows = new Map(
  [...personasDoc.matchAll(/^\| @([a-z0-9_]+) \| ([^|]+?) \|/gm)].map((match) => [match[1], match[2].trim()]),
);

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  state.reducedMotion = false;
});

/** Counts element.animate() calls. jsdom has none of its own. */
function spyAnimate() {
  const calls: string[] = [];
  const proto = win.Element.prototype as unknown as { animate?: unknown };
  const had = Object.getOwnPropertyDescriptor(proto, "animate");
  proto.animate = function (this: Element) {
    calls.push(this.tagName);
    return { cancel() {}, pause() {}, play() {}, finished: Promise.resolve(), playState: "finished" };
  };
  return {
    calls,
    restore() {
      if (had) Object.defineProperty(proto, "animate", had);
      else delete proto.animate;
    },
  };
}

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

describe("landing showcase and intro sources", () => {
  it("make no made-up claims, don't sell, and keep \"free\" off the visuals", () => {
    for (const file of ALL) {
      const source = read(file);
      assert.doesNotMatch(source, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i, file);
      assert.doesNotMatch(source, /join (thousands|\d)/i, file);
      assert.doesNotMatch(source, /marketplace|buy now|for sale|sell your/i, file);
      assert.doesNotMatch(source, /pok[eé]mon|tcg|mail day/i, file);
      assert.doesNotMatch(source, /eBay data|eBay logo/i, file);
    }
    // The demos and the intro's visuals are pictures of the app: no "free" drawn in them.
    for (const file of [...SHOWCASE, ...INTRO]) assert.doesNotMatch(read(file), /\bfree\b/i, file);
  });

  it("never fetch or call an API: static sample data only", () => {
    for (const file of ALL) {
      const source = read(file);
      assert.doesNotMatch(source, /\bfetch\(/, file);
      assert.doesNotMatch(source, /\/api\//, file);
      assert.doesNotMatch(source, /trawl\.dev|from "@\/lib\/comps\/(trawl|index)"/, file);
    }
  });

  it("gives every Link prefetch={false} and never links a persona", () => {
    for (const file of ALL) {
      const source = read(file);
      for (const match of source.matchAll(/<Link\b[^>]*>/g)) assert.match(match[0], /prefetch=\{false\}/, file);
      assert.doesNotMatch(source, /\/u\/\$\{|userHref|FollowButton/, file);
    }
  });

  it("uses only the zip's avatars, untouched, and only personas from personas.md", async () => {
    const files = readdirSync(join(ROOT, "public/landing/avatars")).sort();
    assert.deepEqual(files, [
      "diegos_gridiron_pc.webp",
      "femi_matchday.webp",
      "kitchentable_pc.webp",
      "loupe_and_labels.webp",
      "minh_rookieroom.webp",
      "paolo_lolocards.webp",
      "personas.md",
      "rinkside_andre.webp",
      "sami_rookiehunt.webp",
    ]);
    const { PERSONAS, SAMPLE_POSTS, SAMPLE_ALERTS, avatarSrc } = await import("@/components/landing/showcase/sample-data");
    for (const persona of Object.values(PERSONAS)) {
      assert.equal(personaRows.get(persona.handle), persona.name, persona.handle);
      assert.ok(existsSync(join(ROOT, "public", avatarSrc(persona))), persona.handle);
      assert.match(avatarSrc(persona), /^\/landing\/avatars\/[a-z0-9_]+\.webp$/);
    }
    for (const item of [...SAMPLE_POSTS, ...SAMPLE_ALERTS]) assert.ok(personaRows.has(item.persona.handle));
    for (const file of [...SHOWCASE, ...INTRO]) assert.doesNotMatch(read(file), /next\/image|avif/i, file);
    // The personas are onboarding's only: the landing page draws none of them.
    for (const file of sources("components/landing")) assert.doesNotMatch(read(file), /avatarSrc|PERSONAS|landing\/avatars/, file);
  });
});

describe("landing chapters", () => {
  it("are gone: the landing showcase folder holds only Quick Comp, its motion helpers and the shared shapes", () => {
    assert.deepEqual(SHOWCASE.sort(), [
      "components/landing/showcase/motion.ts",
      "components/landing/showcase/quick-comp-demo.tsx",
      "components/landing/showcase/sample-data.ts",
    ]);
    assert.equal(existsSync(join(ROOT, "components/landing/feature-panels.tsx")), false);
  });

  it("reserves a fixed height for the Quick Comp panel while its code loads, behind a skeleton", () => {
    const source = read("components/landing/quick-comp-section.tsx");
    assert.match(source, /<Suspense fallback=\{<div aria-hidden className="skeleton-shimmer h-\[\d+px\] rounded-2xl" \/>\}>/);
  });

  it("leaves Quick Comp out entirely with its flag off", async () => {
    delete process.env.NEXT_PUBLIC_QUICK_COMP;
    const { QuickCompSection } = await import("@/components/landing/quick-comp-section");
    const { LandingCompProvider } = await import("@/components/landing/landing-links");
    const html = renderToStaticMarkup(createElement(LandingCompProvider, { comp: REAL }, createElement(QuickCompSection)));
    assert.equal(html, "");
  });

  it("keeps the real card photo for onboarding's kitchen-table pickup only, as a plain lazy image", () => {
    assert.ok(existsSync(join(ROOT, "public/landing/kitchen-table-card.webp")));
    const photo = readFileSync(join(ROOT, "public/landing/kitchen-table-card.webp"));
    assert.equal(photo.subarray(8, 12).toString(), "WEBP");
    const source = read("components/onboarding/intro/screens.tsx");
    assert.match(source, /src="\/landing\/kitchen-table-card\.webp"/);
    assert.doesNotMatch(source, /kitchen-table-card[^"]*\.(avif|png|jpe?g)|next\/image/);
    assert.match(source, /kitchen-table-card\.webp"[^>]*className="aspect-\[5\/7\] w-11/);
    for (const file of sources("components/landing")) assert.doesNotMatch(read(file), /kitchen-table-card/, file);
  });

  it("shows Quick Comp's final frame with reduced motion and runs no animations", async () => {
    state.reducedMotion = true;
    const spy = spyAnimate();
    try {
      const { default: QuickCompDemo } = await import("@/components/landing/showcase/quick-comp-demo");
      const host = await mount(createElement(QuickCompDemo, { comp: REAL }));
      assert.match(host.textContent ?? "", new RegExp(REAL.query));
      assert.match(host.textContent ?? "", /\$300/);
      assert.match(host.textContent ?? "", /via Trawl/);
      assert.deepEqual(spy.calls, []);
    } finally {
      spy.restore();
    }
  });
});

describe("landing assets", () => {
  it("drops the old screenshots, 2.png with its sample screen included", () => {
    for (const name of ["1.png", "2.png", "3.png", "sample-raw-card.svg"]) {
      assert.equal(existsSync(join(ROOT, "public/landing", name)), false, name);
    }
    for (const file of ["components/og-frame.tsx", "next.config.ts", "app/layout.tsx", "lib/social/share-image.ts"]) {
      assert.doesNotMatch(read(file), /landing\/(1|2|3)\.png|"2\.png"/, file);
    }
  });
});
