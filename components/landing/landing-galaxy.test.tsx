import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";

/*
 * Signed-out Home's galaxy backdrop: decoration only, and no drifting dust
 * when the reader asked for less motion.
 */

const { win, state } = installDom();

let unmounts: (() => void)[] = [];

afterEach(() => {
  for (const unmount of unmounts) unmount();
  unmounts = [];
  state.reducedMotion = false;
});

async function mountGalaxy() {
  const { LandingGalaxy } = await import("@/components/landing/landing-galaxy");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(LandingGalaxy)));
  // The dust is its own lazy chunk.
  for (let tries = 0; tries < 20; tries += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    if (host.querySelector("span")) break;
  }
  unmounts.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("LandingGalaxy", () => {
  it("is a hidden, untappable layer behind the page", async () => {
    const host = await mountGalaxy();
    const layer = host.firstElementChild as HTMLElement;
    assert.ok(layer, "renders a layer");
    assert.equal(layer.getAttribute("aria-hidden"), "true");
    assert.match(layer.className, /\bpointer-events-none\b/);
    assert.match(layer.className, /\bfixed\b/);
    assert.match(layer.className, /\binset-0\b/);
    assert.match(layer.className, /#1E1036/);
    assert.equal(host.querySelectorAll("button, a, [tabindex]").length, 0);
  });

  it("draws the dust when motion is fine", async () => {
    state.reducedMotion = false;
    const host = await mountGalaxy();
    assert.ok(host.querySelectorAll("span").length > 0, "dust specks render");
  });

  it("leaves the dust out with reduced motion", async () => {
    state.reducedMotion = true;
    const host = await mountGalaxy();
    assert.equal(host.querySelectorAll("span").length, 0);
  });
});
