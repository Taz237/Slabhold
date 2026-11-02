import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lowConfidenceNote } from "@/components/comp-basis";
import { isLowConfidenceValue } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Sample value read only. */
const estimate = (nSales: number) => ({ status: "ok", nSales }) as CardValueResult;

/**
 * What the owner sees: the comp card's amber tag (estimate reads only) next
 * to the Recent sales caption, mirroring card-detail's two spots.
 */
function screen(salesCount: number, kind: "estimate" | "exact") {
  const tagShown = kind === "estimate" && isLowConfidenceValue(estimate(salesCount));
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      tagShown ? createElement("span", null, "Low confidence") : null,
      createElement("p", null, "Recent sold prices", lowConfidenceNote(salesCount, true, tagShown)),
    ),
  );
}

const count = (html: string) => html.split("Low confidence").length - 1;

describe("recent sales caption: low confidence", () => {
  it("shows once under the owner's sales with 3 live sales and a non-estimate read", () => {
    assert.equal(count(screen(3, "exact")), 1);
    assert.match(screen(3, "exact"), /Recent sold prices · Low confidence/);
  });

  it("still shows once when the comp card already has its amber tag", () => {
    assert.equal(count(screen(3, "estimate")), 1);
    assert.doesNotMatch(screen(3, "estimate"), /· Low confidence/);
  });

  it("does not show with 5 or more sales, none, or sample rows", () => {
    assert.equal(count(screen(6, "exact")), 0);
    assert.equal(count(screen(6, "estimate")), 0);
    assert.equal(lowConfidenceNote(0, true, false), "");
    assert.equal(lowConfidenceNote(3, false, false), "");
  });

  it("is wired in card-detail with the same check as the comp card's tag", () => {
    const src = read("components/card-detail.tsx");
    assert.match(src, /lowConfidence=\{estimateTagShown\}/);
    assert.match(src, /Recent sold prices\s*\{lowConfidenceNote\(salesCount, usingLive, estimateTagShown\)\}/);
  });
});
