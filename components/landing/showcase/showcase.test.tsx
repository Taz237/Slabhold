import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
const INTRO = sources("components/onboarding/intro");
const ALL = [...SHOWCASE, ...INTRO, "components/landing/feature-panels.tsx"];

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
    for (const file of ALL) assert.doesNotMatch(read(file), /next\/image|avif/i, file);
  });
});

describe("landing chapters", () => {
  it("reserve a fixed height for every chapter's demo, drawn on the server", async () => {
    const { CHAPTER_HEIGHTS, FeaturePanels } = await import("@/components/landing/feature-panels");
    for (const height of Object.values(CHAPTER_HEIGHTS)) assert.match(height, /^h-\[\d+px\]( min-\[\d+px\]:h-\[\d+px\])?$/);
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    try {
      const html = renderToStaticMarkup(createElement(FeaturePanels));
      for (const [id, height] of Object.entries(CHAPTER_HEIGHTS)) {
        assert.ok(html.slice(html.indexOf(`data-chapter="${id}"`)).includes(height), id);
      }
      assert.match(html, /skeleton-shimmer/, "the demos load later, behind skeletons");
    } finally {
      delete process.env.NEXT_PUBLIC_QUICK_COMP;
    }
  });

  it("leaves Quick Comp out entirely with its flag off", async () => {
    delete process.env.NEXT_PUBLIC_QUICK_COMP;
    const { FeaturePanels } = await import("@/components/landing/feature-panels");
    const html = renderToStaticMarkup(createElement(FeaturePanels));
    assert.doesNotMatch(html, /Quick Comp|comp any card|%2Fcomp/i);
  });

  it("labels the timeline as sample accounts, visibly and on the feed region", async () => {
    const { FeaturePanels } = await import("@/components/landing/feature-panels");
    const html = renderToStaticMarkup(createElement(FeaturePanels));
    const timeline = html.slice(html.indexOf('data-chapter="timeline"'), html.indexOf('data-chapter="graphs"'));
    assert.match(timeline, />Sample accounts</);
    assert.match(timeline, /role="region" aria-label="Sample accounts, not real collectors"/);
    assert.match(timeline, />Sample</);
  });

  it("draws the timeline from personas, handles as plain text, avatars from /landing/avatars/", async () => {
    const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
    const host = await mount(createElement(TimelineDemo, { run: 0 }));
    const images = [...host.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "");
    assert.ok(images.length > 0);
    for (const src of images) assert.match(src, /^\/landing\/avatars\/[a-z0-9_]+\.webp$/);
    for (const img of host.querySelectorAll("img")) {
      assert.equal(img.getAttribute("loading"), "lazy");
      assert.equal(img.getAttribute("decoding"), "async");
      assert.ok(img.getAttribute("width") && img.getAttribute("height"));
    }
    const handles = [...(host.textContent ?? "").matchAll(/@([a-z0-9_]+)/g)].map((match) => match[1]);
    assert.ok(handles.length > 0);
    for (const handle of handles) assert.ok(personaRows.has(handle), handle);
    assert.equal(host.querySelectorAll("a").length, 0, "no handle is a link");
  });

  it("shows final frames with reduced motion and runs no animations", async () => {
    state.reducedMotion = true;
    const spy = spyAnimate();
    try {
      const { default: QuickCompDemo } = await import("@/components/landing/showcase/quick-comp-demo");
      const { SAMPLE_QUERY } = await import("@/components/landing/showcase/sample-data");
      let host = await mount(createElement(QuickCompDemo, { run: 0 }));
      assert.match(host.textContent ?? "", new RegExp(SAMPLE_QUERY));
      assert.match(host.textContent ?? "", /\$412/);
      assert.match(host.textContent ?? "", /via Trawl/);
      cleanup?.();

      const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
      host = await mount(createElement(TimelineDemo, { run: 0 }));
      assert.equal(host.querySelectorAll("[data-post]").length, 3, "the first three posts, static");
      assert.equal(host.querySelector("[data-copy='1']"), null, "no looping copy");
      cleanup?.();

      const { default: GraphsDemo } = await import("@/components/landing/showcase/graphs-demo");
      host = await mount(createElement(GraphsDemo, { run: 1, gain: null }));
      assert.match(host.textContent ?? "", /\$412/);
      assert.deepEqual(spy.calls, []);
    } finally {
      spy.restore();
    }
  });
});

describe("landing assets", () => {
  it("drops the old screenshots and keeps a fresh 2.png for the share image", () => {
    assert.equal(existsSync(join(ROOT, "public/landing/1.png")), false);
    assert.equal(existsSync(join(ROOT, "public/landing/3.png")), false);
    assert.equal(existsSync(join(ROOT, "public/landing/2.png")), true);
    const png = readFileSync(join(ROOT, "public/landing/2.png"));
    assert.equal(png.readUInt32BE(16), 860, "860 px wide");
    for (const file of ["components/og-frame.tsx", "next.config.ts", "app/layout.tsx", "lib/social/share-image.ts"]) {
      assert.doesNotMatch(read(file), /landing\/(1|3)\.png/, file);
    }
  });
});
