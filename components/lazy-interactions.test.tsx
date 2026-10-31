import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { ValueChart, type ChartPoint } from "@/components/charts/value-chart";
import { LazyMentionTextarea, preloadMentionTextarea } from "@/components/mention-textarea-lazy";
import { MentionTextarea } from "@/components/mention-textarea";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";

installDom();

/** Fires once on observe with a 300px box, like a phone-width chart. */
class FixedResizeObserver {
  constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  observe() {
    this.callback([{ contentRect: { width: 300 } }]);
  }
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: FixedResizeObserver });

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Static (non-type) imports of a module, by specifier. */
function staticImports(source: string): string[] {
  return [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

describe("ValueChart scrub handlers", () => {
  const points: ChartPoint[] = [
    { date: "2026-10-01", value: 41 },
    { date: "2026-10-10", value: 120 },
    { date: "2026-10-20", value: 200 },
    { date: "2026-10-30", value: 285 },
  ];

  it("come from their own chunk, fetched at idle or on first touch", () => {
    const chart = read("components/charts/value-chart.tsx");
    assert.ok(!staticImports(chart).includes("@/components/charts/value-chart-scrub"));
    assert.match(chart, /import\("@\/components\/charts\/value-chart-scrub"\)/);
    assert.match(chart, /afterFirstIdle\(\(\) => void loadScrub\(\)/);
    assert.doesNotMatch(chart, /nearestIndex/);
  });

  it("still land the first tap, made before the chunk is in, then drag and release", async () => {
    const seen: (ChartPoint | null)[] = [];
    act(() =>
      root!.render(
        createElement(ValueChart, { points, tone: "up", ariaLabel: "x", onScrub: (point: ChartPoint | null) => seen.push(point) }),
      ),
    );
    const svg = host.querySelector("svg")!;
    const press = (type: string, clientX: number) => {
      const event = new window.MouseEvent(type, { bubbles: true, clientX });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      Object.defineProperty(event, "pointerId", { value: 1 });
      svg.dispatchEvent(event);
    };
    // Both before the chunk has loaded: held, then replayed in order.
    press("pointerdown", 0);
    press("pointermove", 250);
    assert.equal(seen.length, 0);
    await settle();
    assert.deepEqual(
      seen.map((point) => point?.value ?? null),
      [41, 285],
    );
    press("pointerup", 250);
    await settle();
    assert.equal(seen.at(-1), null);
  });
});

describe("Home composer textarea", () => {
  const social = {
    user: null,
    mode: "local",
    profiles: [],
    followingOf: () => [],
    blockedIds: [],
  } as unknown as SocialContextValue;

  const props = {
    maxLength: 280,
    rows: 2,
    placeholder: "What's happening?",
    className: "w-full resize-none bg-transparent text-[15px] leading-5 outline-none placeholder:text-zinc-500",
  };

  it("keeps the full box out of the feed's static imports", () => {
    const feed = read("components/feed-view.tsx");
    const imports = staticImports(feed);
    assert.ok(!imports.includes("@/components/mention-textarea"));
    assert.match(feed, /<LazyMentionTextarea\s/);
    const lazy = read("components/mention-textarea-lazy.tsx");
    assert.ok(!staticImports(lazy).includes("@/components/mention-textarea"));
    assert.match(lazy, /import\("@\/components\/mention-textarea"\)/);
  });

  it("draws the same box as the full one before it loads", () => {
    const plain = renderToStaticMarkup(
      createElement(SocialContext.Provider, { value: social }, createElement(LazyMentionTextarea, { ...props, value: "hi", onChange: () => {} })),
    );
    const full = renderToStaticMarkup(
      createElement(SocialContext.Provider, { value: social }, createElement(MentionTextarea, { ...props, value: "hi", onChange: () => {} })),
    );
    assert.equal(plain, full);
  });

  it("takes typing before the full box loads, then hands over text, focus and caret", async () => {
    let value = "";
    function Composer() {
      const [body, setBody] = useState("");
      value = body;
      return createElement(LazyMentionTextarea, { ...props, value: body, onChange: setBody });
    }
    act(() => root!.render(createElement(SocialContext.Provider, { value: social }, createElement(Composer))));
    const plain = host.querySelector("textarea")!;
    act(() => plain.focus());
    // Typed into the plain box, through the box's own onChange.
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(plain, "Pulled a 10");
      const key = Object.keys(plain).find((name) => name.startsWith("__reactProps"))!;
      (plain as unknown as Record<string, { onChange: (event: { target: HTMLTextAreaElement }) => void }>)[key].onChange({
        target: plain,
      });
    });
    assert.equal(value, "Pulled a 10");
    plain.setSelectionRange(6, 6);

    await act(async () => {
      await preloadMentionTextarea();
    });
    const full = host.querySelector("textarea")!;
    assert.notEqual(full, plain);
    assert.equal(full.value, "Pulled a 10");
    assert.equal(document.activeElement, full);
    assert.equal(full.selectionStart, 6);
    assert.equal(host.querySelectorAll("textarea").length, 1);
  });
});

describe("DM send and read", () => {
  it("load from their own chunk, not the provider's", () => {
    for (const path of ["components/social-provider.tsx", "lib/social/remote.ts", "lib/social/local-db.ts"]) {
      const source = read(path);
      assert.ok(!staticImports(source).includes("@/lib/social/dm-actions"), path);
      assert.doesNotMatch(source, /function (remoteSendMessage|localSendMessage|remoteMarkThreadRead)\b/, path);
    }
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /const loadDmActions = \(\) => import\("@\/lib\/social\/dm-actions"\);/);
    assert.match(provider, /if \(firstIdle && signedIn\) void loadDmActions\(\)/);
    const send = provider.slice(provider.indexOf("const sendMessage = useCallback"), provider.indexOf("const markThreadRead"));
    assert.match(send, /await loadDmActions\(\)/);
  });
});
