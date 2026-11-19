import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoPlaceholder, SlabFrame, type ArtCard } from "@/components/card-slab-frame";
import { LandingPage } from "@/components/landing-page";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { withLandingContexts } from "@/lib/test/landing-fixtures";
import { SAMPLE_SLABS } from "@/components/landing/sample-cards";

const GRADERS = /\b(PSA|BGS|SGC|CGC|Beckett)\b/i;
const GRADER_LOOKS = /#C8102E|#E4E7EB|#B9BEC6|#111113|#1F5FBF|repeating-linear-gradient\(90deg/i;
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function slab(card: ArtCard, label?: "grader" | "sample") {
  return renderToStaticMarkup(
    <SlabFrame card={card} label={label}>
      <PhotoPlaceholder card={card} />
    </SlabFrame>,
  );
}

describe("generic sample slabs", () => {
  it("sample slab data names no grader", () => {
    for (const card of SAMPLE_SLABS) assert.equal(card.grader ?? "", "");
    assert.doesNotMatch(read("components/landing/sample-cards.ts"), GRADERS);
  });

  it("draws no sample slab on the landing page at all: an empty glass slab, no teal, no grader look", () => {
    const html = renderToStaticMarkup(withLandingContexts(createElement(LandingPage, { media: EMPTY_MEDIA })));
    assert.match(html, /data-glass-hero="empty"/);
    assert.doesNotMatch(html, /data-hero-slabs|data-label="sample"|>Sample slabs</);
    for (const title of ["Your grail", "Rookie auto", "Short print"]) assert.doesNotMatch(html, new RegExp(title));
    assert.doesNotMatch(html, GRADERS);
    assert.doesNotMatch(html, GRADER_LOOKS);
    assert.doesNotMatch(html, /teal/i);
    // The made-up slabs are onboarding's now; the landing page never imports them.
    for (const file of ["components/landing-page.tsx", "components/landing/glass-hero.tsx", "components/landing/sections.tsx"]) {
      assert.doesNotMatch(read(file), /sample-cards|SAMPLE_SLABS/, file);
    }
  });

  it("keeps the sample label generic and purple wherever a made-up slab is still drawn", () => {
    const html = slab(SAMPLE_SLABS[0], "sample");
    assert.match(html, /data-label="sample"/);
    assert.match(html, />Grade</);
    assert.doesNotMatch(html, GRADERS);
    assert.doesNotMatch(html, GRADER_LOOKS);
    assert.match(html, /from-\[#7C3AED\]/);
    for (const label of html.match(/from-\[#7C3AED\] to-\[#5B21B6\][\s\S]*?h-\[9px\]/g) ?? []) {
      assert.doesNotMatch(label, /font-extrabold|font-bold/, "the label stays at Geist 600");
    }
  });

  it("keeps real cards on the grader label", () => {
    const real: ArtCard = { ...SAMPLE_SLABS[0], playerName: "Fixture Player", grader: "PSA" };
    const html = slab(real);
    assert.match(html, /data-tone="psa"/);
    assert.match(html, />PSA</);
    assert.doesNotMatch(html, /data-label="sample"/);
  });

  it("gives onboarding's sample first card the generic label", () => {
    const source = read("components/onboarding/first-run-setup.tsx");
    const sample = source.slice(source.indexOf("const SAMPLE_FIRST_CARD"), source.indexOf("};", source.indexOf("const SAMPLE_FIRST_CARD")));
    assert.doesNotMatch(sample, GRADERS);
    assert.match(source, /card=\{SAMPLE_FIRST_CARD\}[\s\S]{0,200}label="sample"/);
  });

  it("has no made-up Quick Comp card left to name a grader on", () => {
    const demo = read("components/landing/showcase/quick-comp-demo.tsx");
    assert.doesNotMatch(demo, /label: "[^"]*\b(PSA|BGS|SGC|CGC)\b/);
    assert.doesNotMatch(demo, /SAMPLE|Sample/);
    assert.doesNotMatch(read("components/landing/showcase/sample-data.ts"), /SAMPLE_QUERY/);
  });
});
