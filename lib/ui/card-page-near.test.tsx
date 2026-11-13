import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { CardCollectorsSayingPending } from "@/components/card-talk-frame";
import { NearCardCollectorsSaying } from "@/components/card-talk-near";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";

installDom();

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const staticImports = (source: string) =>
  [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);

type Watch = { callback: IntersectionObserverCallback; nodes: Element[]; off: boolean };
let watches: Watch[];
const realIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;

function scrollNear() {
  for (const watch of watches) {
    if (watch.off) continue;
    watch.callback(
      watch.nodes.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      {} as IntersectionObserver,
    );
  }
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const social = {
  user: { id: "u1", username: "tester" },
  homePosts: [],
  profiles: [],
  publicCards: [],
  ready: true,
} as unknown as SocialContextValue;

const withSocial = (node: ReactElement) => createElement(SocialContext.Provider, { value: social }, node);

let host: HTMLElement;
let reactRoot: Root | null;

beforeEach(() => {
  watches = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    watch: Watch;
    constructor(callback: IntersectionObserverCallback) {
      this.watch = { callback, nodes: [], off: false };
      watches.push(this.watch);
    }
    observe(node: Element) {
      this.watch.nodes.push(node);
    }
    disconnect() {
      this.watch.off = true;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
  };
  host = document.createElement("div");
  document.body.append(host);
  reactRoot = null;
});

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount());
  host.remove();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = realIO;
});

describe("posts section on the card pages", () => {
  const props = { cardId: "c1", heading: "Who's talking about this card" };

  it("server and first client render draw the same frame and skeleton as before", () => {
    const pending = renderToStaticMarkup(withSocial(createElement(CardCollectorsSayingPending, props)));
    const html = renderToString(withSocial(createElement(NearCardCollectorsSaying, props)));
    assert.equal(html, `<div>${pending}</div>`);
    host.innerHTML = html;
    const before = host.innerHTML;
    const errors: unknown[] = [];
    act(() => {
      reactRoot = hydrateRoot(host, withSocial(createElement(NearCardCollectorsSaying, props)), {
        onRecoverableError: (error) => errors.push(error),
      });
    });
    assert.deepEqual(errors, []);
    assert.equal(host.innerHTML, before);
  });

  it("waits off screen, then loads the real section once it scrolls near", async () => {
    reactRoot = createRoot(host);
    act(() => reactRoot!.render(withSocial(createElement(NearCardCollectorsSaying, props))));
    await settle();
    assert.doesNotMatch(host.innerHTML, /No posts yet/);
    assert.match(host.innerHTML, /skeleton-shimmer/);
    act(() => scrollNear());
    await settle();
    assert.match(host.innerHTML, /No posts yet\. Be the first\./);
  });

  it("its one early tap target, Post about this card, is a real link before it loads", () => {
    const html = renderToString(withSocial(createElement(NearCardCollectorsSaying, props)));
    assert.match(html, /<a [^>]*href="\/compose\?card=c1"/);
  });
});

describe("the owner card page", () => {
  it("defers only the posts section: the sales rows draw as before", () => {
    const source = read("components/card-detail.tsx");
    assert.match(source, /<NearCardCollectorsSaying /);
    assert.doesNotMatch(source, /<LazyCardCollectorsSaying /);
    assert.match(source, /<div className="mt-2">\s*<LazyCompsList/);
    // The public card's posts sit just under the fold there, so it is unchanged.
    assert.match(read("components/public-card-view.tsx"), /<LazyCardCollectorsSaying /);
  });
});

describe("card pages' static imports", () => {
  it("bring in no Supabase browser client and no deferred part", () => {
    const banned = [
      "@/lib/supabase/browser",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "@/components/card-collectors-saying",
      "@/components/comps-list",
      "@/components/sales-chart",
      "@/components/deal-sheet",
      "@/components/card-form",
      "@/components/card-added-panel",
      "@/components/want-button",
    ];
    for (const path of ["components/card-detail.tsx", "components/public-card-view.tsx"]) {
      const imports = staticImports(read(path));
      for (const name of banned) {
        if (path.endsWith("public-card-view.tsx") && name === "@/components/want-button") continue;
        assert.ok(!imports.includes(name), `${path} imports ${name}`);
      }
    }
  });
});
