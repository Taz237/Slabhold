import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ComponentType, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PickupDemo } from "@/components/landing/showcase/sample-data";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const PHOTO = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos/f1/love.jpg";
const REAL: PickupDemo = { player: "Fixture Jordan Love", year: "2020", set: "Panini Prizm", grader: "PSA", grade: "10", photoUrl: PHOTO };
const POST_TEXT = "Finally got this back from PSA. Jordan Love 10. Worth the wait.";

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

function paolo(host: HTMLElement) {
  return host.querySelector<HTMLElement>('[data-copy="0"] [data-post="p6"]')!;
}

describe("timeline pickup with a real card", () => {
  it("gives Paolo's pickup the new text, his tag, and the real slab", async () => {
    const { SAMPLE_POSTS, PERSONAS } = await import("@/components/landing/showcase/sample-data");
    const post = SAMPLE_POSTS.find((item) => item.id === "p6")!;
    assert.equal(post.persona, PERSONAS.paolo);
    assert.equal(post.body, POST_TEXT);
    assert.equal(post.pickup, true);
    assert.deepEqual([post.ago, post.replies, post.likes], ["3h", 9, 64], "time and counts unchanged");

    const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
    const host = await mount(createElement(TimelineDemo, { run: 0, pickup: REAL }));
    const row = paolo(host);
    assert.match(row.textContent ?? "", /Paolo Dimaculangan/);
    assert.match(row.textContent ?? "", /@paolo_lolocards/);
    assert.match(row.textContent ?? "", new RegExp(POST_TEXT.replace(/\./g, "\\.")));
    assert.match(row.textContent ?? "", /Pickup/);
    const slab = row.querySelector('[data-real-pickup]');
    assert.ok(slab, "the real slab");
    assert.equal(slab.getAttribute("role"), "img");
    assert.equal(slab.getAttribute("aria-label"), "Fixture Jordan Love, 2020 Panini Prizm, PSA 10");
    const img = slab.querySelector("img")!;
    assert.match(decodeURIComponent(img.getAttribute("src") ?? ""), /card-photos\/f1\/love\.jpg/);
    assert.equal(img.getAttribute("loading"), "lazy");
    assert.match(slab.textContent ?? "", /Fixture Jordan Love/);
    assert.match(slab.textContent ?? "", /PSA/);
    assert.match(slab.textContent ?? "", /2020 · Panini Prizm/, "year and set on the label's top line");
    assert.doesNotMatch(slab.textContent ?? "", /Graded card/);

    // Only Paolo's post carries it. The kitchen-table photo stays on p1.
    assert.equal(host.querySelectorAll('[data-copy="0"] [data-real-pickup]').length, 1);
    assert.ok(host.querySelector('[data-copy="0"] [data-post="p1"] img[src="/landing/kitchen-table-card.webp"]'));
  });

  it("keeps the Graded card line when year and set are both empty", async () => {
    const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
    const host = await mount(createElement(TimelineDemo, { run: 0, pickup: { ...REAL, year: "", set: "" } }));
    const slab = paolo(host).querySelector("[data-real-pickup]")!;
    assert.match(slab.textContent ?? "", /Graded card/);
    assert.equal(slab.getAttribute("aria-label"), "Fixture Jordan Love, PSA 10");
  });

  it("puts the sample slab back when the real photo fails, keeping the new text", async () => {
    const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
    const host = await mount(createElement(TimelineDemo, { run: 0, pickup: REAL }));
    await act(async () => {
      paolo(host).querySelector("[data-real-pickup] img")!.dispatchEvent(new win.Event("error"));
    });
    assert.equal(host.querySelectorAll("[data-real-pickup]").length, 0);
    const sample = await mount(createElement(TimelineDemo, { run: 0 }));
    assert.equal(paolo(host).innerHTML, paolo(sample).innerHTML, "exactly today's sample slab");
    assert.match(paolo(host).textContent ?? "", /Worth the wait\./);
  });

  it("keeps today's sample slab without a real card", async () => {
    const { default: TimelineDemo } = await import("@/components/landing/showcase/timeline-demo");
    const host = await mount(createElement(TimelineDemo, { run: 0 }));
    const row = paolo(host);
    assert.equal(row.querySelector("[data-real-pickup]"), null);
    assert.match(row.textContent ?? "", /Rookie auto/);
    assert.match(row.textContent ?? "", /BGS/);
    assert.match(row.textContent ?? "", /Worth the wait\./);
  });

  it("keeps the Sample accounts tag on the timeline with the real card", async () => {
    const { FeaturePanels } = await import("@/components/landing/feature-panels");
    const html = renderToStaticMarkup(createElement(FeaturePanels, { pickup: REAL }));
    const timeline = html.slice(html.indexOf('data-chapter="timeline"'), html.indexOf('data-chapter="graphs"'));
    assert.match(timeline, />Sample accounts</);
    assert.match(timeline, />Sample</);
  });

  it("hands the page's card to the lazy timeline through the provider", async () => {
    const { LandingCompProvider, LandingPickupContext } = await import("@/components/landing/landing-links");
    const { use } = await import("react");
    // Children go in as the third argument, so the props type doesn't require them.
    const Provider = LandingCompProvider as unknown as ComponentType<{ comp: null; pickup?: PickupDemo | null }>;
    let seen: PickupDemo | null = null;
    function Probe() {
      seen = use(LandingPickupContext);
      return null;
    }
    renderToStaticMarkup(createElement(Provider, { comp: null, pickup: REAL }, createElement(Probe)));
    assert.deepEqual(seen, REAL);
    renderToStaticMarkup(createElement(Provider, { comp: null }, createElement(Probe)));
    assert.equal(seen, null);
  });
});
