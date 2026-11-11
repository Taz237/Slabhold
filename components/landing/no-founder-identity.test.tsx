import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { installDom } from "@/lib/test/dom";
import type { CompDemo } from "@/components/landing/showcase/sample-data";

installDom();

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

/** The founder's name, handle, surname and the founder/creator wording. */
const IDENTITY = /donnietaz|\bDonnie\b|Taziole|\bfounder\b|\bcreator\b|Built by @|From @/i;

const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";

function card(id: string, playerName: string) {
  return {
    id,
    photoUrl: `${PHOTOS}/f1/${id}.jpg`,
    playerName,
    year: 2023,
    yearLabel: "2023",
    setBrand: "Prizm",
    grade: "10",
    gradeQualifier: "",
    certNumber: "",
    accent: "#7c5cff",
    conditionType: "graded" as const,
    grader: "PSA",
  };
}

/** An old-shape payload that still carries the profile: the page must drop it. */
const OLD_PAYLOAD = {
  profile: { username: "donnietaz", displayName: "Donnie", avatarUrl: "https://cdn.example/donnie.png" },
  cards: [card("a", "Top Card"), card("b", "Second Card"), card("c", "Third Card")],
};

const REAL_COMP: CompDemo = {
  query: "Fixture Maxey 2021 Donruss Optic Downtown PSA 10",
  label: "Fixture Maxey · 2021 Donruss Optic Downtown · PSA 10",
  photo: { src: "/_next/image?url=maxey&w=128&q=75" },
  alt: "Fixture Maxey, 2021 Donruss Optic Downtown, PSA 10",
  sales: [{ price: 300, when: "today" }],
  stats: { median: 300, p25: 290, p75: 308, min: 285, max: 310, count: 9 },
  basis: "Based on 9 sales",
  real: true,
};

function files(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) return files(path);
    return /\.(tsx?|md|json|webmanifest|txt)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("logged-out surfaces carry no founder identity", () => {
  it("the landing page never names the founder, even with real cards", async () => {
    const { LandingPage } = await import("@/components/landing-page");
    const html = renderToStaticMarkup(
      createElement(
        ImageConfigContext.Provider,
        { value: { ...imageConfigDefault, ...nextConfig.images } },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams() },
          createElement(LandingPage, { founder: OLD_PAYLOAD as never }),
        ),
      ),
    );
    assert.match(html, /data-hero-slabs="founder"/, "the 3 real card photos stay");
    assert.equal((html.match(/card-photos%2Ff1%2F/g) ?? []).length >= 3, true);
    assert.doesNotMatch(text(html), IDENTITY);
    assert.doesNotMatch(html, /donnietaz|Donnie|avatar/i);
    assert.match(text(html), /From a Slabhold collection/);
  });

  it("the Quick Comp chapter tags a real card without naming anyone", async () => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
    try {
      const { FeaturePanels } = await import("@/components/landing/feature-panels");
      const html = renderToStaticMarkup(createElement(FeaturePanels, { comp: REAL_COMP }));
      assert.doesNotMatch(text(html), IDENTITY);
      assert.doesNotMatch(html, /donnietaz|Donnie/i);
      assert.match(text(html), /From a Slabhold collection/);
    } finally {
      delete process.env.NEXT_PUBLIC_QUICK_COMP;
    }
  });

  it("the server showcase and comp never carry the handle, name or avatar", async () => {
    const { founderShowcase } = await import("@/lib/landing/founder");
    const showcase = founderShowcase(
      { id: "f1", username: "donnietaz", display_name: "Donnie", avatar_url: "https://cdn.example/a.png" },
      [],
    );
    assert.doesNotMatch(JSON.stringify(showcase), /donnietaz|Donnie|a\.png/);
    assert.doesNotMatch(read("lib/landing/founder-comp.ts"), /owner: profile\.username/);
  });

  it("About, Help, Terms, Privacy, Support, metadata, manifest and share images", () => {
    const pages = [
      "app/(app)/about/page.tsx",
      "app/(app)/terms/page.tsx",
      "app/(app)/privacy/page.tsx",
      "app/(app)/support/page.tsx",
      "app/(app)/login/page.tsx",
      "app/(app)/signup/page.tsx",
      "app/layout.tsx",
      "app/manifest.ts",
      "app/opengraph-image.tsx",
      "app/twitter-image.tsx",
      "app/welcome/page.tsx",
      "components/og-frame.tsx",
      "components/landing-page.tsx",
    ];
    for (const path of pages) {
      // Comments, imports and variable names may say "founder" about the data
      // source. Strings and JSX text, what a visitor can see, may not.
      const drawn = read(path)
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
        .replace(/^import .*$/gm, "");
      assert.doesNotMatch(drawn, /donnietaz|\bDonnie\b|Taziole|Built by @|From @/i, path);
      assert.doesNotMatch(drawn, /["'`>][^"'`<>\n]*\b(founder|creator)\b[^"'`<>\n]*["'`<]/i, path);
    }
  });

  it("nothing public under public/ or the landing components names him", () => {
    for (const path of [...files("public"), ...files("components/landing"), ...files("components/onboarding")]) {
      assert.doesNotMatch(read(path), /donnietaz|\bDonnie\b|Taziole/i, path);
    }
    for (const path of files("components/landing")) {
      assert.doesNotMatch(read(path), /From @\$?\{?owner|From the founder|Follow on Slabhold/, path);
    }
  });
});
