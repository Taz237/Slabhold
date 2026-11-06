import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactElement } from "react";
import type { PickupDemo } from "@/components/landing/showcase/sample-data";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const REAL: PickupDemo = {
  player: "Fixture Jordan Love",
  year: "2020",
  set: "Panini Prizm",
  grader: "PSA",
  grade: "10",
  photoUrl: "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/f1/love.jpg",
};

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

describe("timeline pickup thumb", () => {
  it("gives the real slab a 112px box so its tiny label stays readable", async () => {
    const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
    const host = await mount(createElement(TimelineDemo, { run: 0, pickup: REAL }));
    const slab = host.querySelector<HTMLElement>('[data-copy="0"] [data-post="p6"] [data-real-pickup]')!;
    const box = slab.parentElement!;
    assert.match(box.className, /\bw-28\b/);
    assert.doesNotMatch(box.className, /\bw-16\b/);
    assert.match(slab.querySelector("img")!.getAttribute("sizes") ?? "", /112px/);
  });

  it("gives the sample slab the same 112px box", async () => {
    const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
    const host = await mount(createElement(TimelineDemo, { run: 0 }));
    const slab = host.querySelector<HTMLElement>('[data-copy="0"] [data-post="p6"] [data-kind="slab"]')!;
    assert.match(slab.parentElement!.className, /\bw-28\b/);
  });
});
