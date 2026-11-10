import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoPlaceholder, SlabFrame, type ArtCard } from "@/components/card-slab-frame";
import { HeroSlabs, heroSlots } from "@/components/landing/hero-slabs";
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

  it("draws the landing hero samples with a generic purple label: Grade, no grader, no barcode", () => {
    const html = renderToStaticMarkup(createElement(HeroSlabs, { cards: [] }));
    assert.match(html, /data-hero-slabs="sample"/);
    assert.match(html, />Sample slabs</);
    assert.doesNotMatch(html, GRADERS);
    assert.doesNotMatch(html, GRADER_LOOKS);
    assert.doesNotMatch(html, /teal/i);
    assert.equal((html.match(/data-label="sample"/g) ?? []).length, 3);
    assert.equal((html.match(/>Grade</g) ?? []).length, 3);
    for (const grade of [">10<", ">9.5<"]) assert.ok(html.includes(grade), grade);
    for (const title of ["Your grail", "Rookie auto", "Short print"]) assert.match(html, new RegExp(title));
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
    // Founder cards in the hero keep their own label too.
    const slots = heroSlots([{ id: "c1", photoUrl: "https://example.com/a.jpg", ...real }]);
    assert.equal(slots[1].sample, false);
    assert.equal(slots[0].sample, true);
  });

  it("gives onboarding's sample first card the generic label", () => {
    const source = read("components/onboarding/first-run-setup.tsx");
    const sample = source.slice(source.indexOf("const SAMPLE_FIRST_CARD"), source.indexOf("};", source.indexOf("const SAMPLE_FIRST_CARD")));
    assert.doesNotMatch(sample, GRADERS);
    assert.match(source, /card=\{SAMPLE_FIRST_CARD\}[\s\S]{0,200}label="sample"/);
  });

  it("names no grader on the made-up Quick Comp card", () => {
    assert.doesNotMatch(read("components/landing/showcase/quick-comp-demo.tsx"), /label: "[^"]*\b(PSA|BGS|SGC|CGC)\b/);
    assert.doesNotMatch(read("components/landing/showcase/sample-data.ts").match(/SAMPLE_QUERY = "[^"]*"/)?.[0] ?? "", GRADERS);
  });
});
