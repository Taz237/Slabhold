import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CountUp } from "@/components/count-up";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("chip count-up", () => {
  it("server-renders the final value, so hydration matches", () => {
    assert.equal(renderToStaticMarkup(createElement(CountUp, { text: "+115%", run: true })), '<span data-gain-text="">+115%</span>');
    assert.equal(renderToStaticMarkup(createElement(CountUp, { text: "−40%" })), '<span data-gain-text="">−40%</span>');
  });

  it("is drawn by React, never by writing DOM text", () => {
    for (const path of ["components/count-up.tsx", "components/moving-today.tsx", "components/card-tile.tsx"]) {
      assert.doesNotMatch(read(path), /nodeValue|useChipCountUp/, path);
    }
    const countUp = read("components/count-up.tsx");
    assert.match(countUp, /prefers-reduced-motion: reduce/);
    assert.match(countUp, /getBoundingClientRect/);
    assert.match(read("components/moving-today.tsx"), /countUp=\{rail && animate && index < STAGGER_TILES\}/);
  });
});
