import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingGalaxy } from "@/components/landing/landing-galaxy";

/*
 * Signed-out Home's galaxy backdrop: decoration only, drawn on the server,
 * moved by CSS alone, and still when the reader asked for less motion.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const CSS = read("app/landing.css");

describe("LandingGalaxy", () => {
  it("is a hidden, untappable layer fixed behind the page", () => {
    const html = renderToStaticMarkup(createElement(LandingGalaxy));
    assert.match(html, /^<div aria-hidden="true" class="lg-galaxy"/);
    assert.doesNotMatch(html, /<button|<a |tabindex/);
    assert.match(CSS, /\.lg-galaxy \{\s*position: fixed;\s*inset: 0;\s*overflow: hidden;\s*pointer-events: none;/);
  });

  it("is a slow mesh of the four brand purples with a faint grain", () => {
    const html = renderToStaticMarkup(createElement(LandingGalaxy));
    assert.equal((html.match(/<i><\/i>/g) ?? []).length, 4);
    assert.match(html, /class="lg-galaxy-grain"/);
    const mesh = CSS.slice(CSS.indexOf(".lg-galaxy-mesh i:nth-child(1)"), CSS.indexOf(".lg-galaxy-grain"));
    // #5B21B6, #7C3AED, #2A1260, and #A78BFA at 20%.
    for (const color of ["rgba(91, 33, 182,", "rgba(124, 58, 237,", "rgba(42, 18, 96,", "rgba(167, 139, 250, 0.2)"]) {
      assert.ok(mesh.includes(color), color);
    }
    assert.match(CSS, /\.lg-galaxy-mesh i \{[^}]*animation: lg-drift 40s ease-in-out infinite alternate;/);
    assert.match(CSS, /@keyframes lg-drift \{\s*to \{\s*transform: translate3d\(/, "transforms only");
    const grain = CSS.match(/\.lg-galaxy-grain \{[^}]*\}/)?.[0] ?? "";
    assert.match(grain, /opacity: 0\.05;/);
    assert.match(grain, /feTurbulence/);
  });

  it("ships no code and no dust chunk: a server component, nothing to hydrate", () => {
    const source = read("components/landing/landing-galaxy.tsx");
    assert.doesNotMatch(source, /^"use client";|lazy\(|useSyncExternalStore|onboarding\/intro/m);
  });

  it("holds still with reduced motion", () => {
    const reduced = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce) {"));
    assert.match(reduced, /\.lg \*,\s*\.lg \*::before \{\s*animation: none !important;/);
  });
});
