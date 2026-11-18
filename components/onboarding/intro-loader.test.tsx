import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { IntroLoading, introPart } from "@/components/onboarding/intro-loader";
import { LAZY_PART_RETRY_MS } from "@/lib/ui/lazy-part";

const { win } = installDom();

type IntroProps = { userId: string; onEnd: () => void };

async function mount(Part: ComponentType<IntroProps>, onEnd: () => void) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(Part, { userId: "u1", onEnd })));
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function settle(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("intro loading", () => {
  it("is a skeleton of the intro, not a pure black screen", () => {
    const markup = renderToStaticMarkup(createElement(IntroLoading));
    assert.match(markup, /aria-busy="true"/);
    assert.match(markup, /data-intro-loading/);
    // Progress dots, the art frame, two text lines and the button shape.
    assert.ok((markup.match(/data-skeleton/g) ?? []).length >= 4);
    // The shared shimmer holds still for Reduce Motion (globals.css).
    assert.match(markup, /skeleton-shimmer/);
    assert.doesNotMatch(markup, /animate-pulse/);
  });

  it("shows the skeleton while the intro's code loads, then the intro", async () => {
    let resolve: (component: ComponentType<IntroProps>) => void = () => {};
    const Part = introPart(() => new Promise((done) => (resolve = done)));
    const view = await mount(Part, () => {});
    assert.ok(view.host.querySelector("[data-intro-loading]"));
    await act(async () => resolve(() => createElement("p", { "data-intro": "" }, "intro")));
    await settle(0);
    assert.ok(view.host.querySelector("[data-intro]"));
    view.unmount();
  });

  it("skips to setup, instead of crashing the app, when the intro's code fails twice", async () => {
    let ended = 0;
    const Part = introPart(() => Promise.reject(new Error("ChunkLoadError")));
    const warn = console.warn;
    console.warn = () => {};
    try {
      const view = await mount(Part, () => void ended++);
      await settle(LAZY_PART_RETRY_MS + 200);
      assert.equal(ended, 1);
      view.unmount();
    } finally {
      console.warn = warn;
    }
  });
});
