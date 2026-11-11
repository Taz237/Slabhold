import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";

installDom();

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const FLAG = process.env.NEXT_PUBLIC_QUICK_COMP;
afterEach(() => {
  if (FLAG === undefined) delete process.env.NEXT_PUBLIC_QUICK_COMP;
  else process.env.NEXT_PUBLIC_QUICK_COMP = FLAG;
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

async function landingText(flag: "1" | undefined) {
  if (flag) process.env.NEXT_PUBLIC_QUICK_COMP = flag;
  else delete process.env.NEXT_PUBLIC_QUICK_COMP;
  const { LandingPage } = await import("@/components/landing-page");
  return text(
    renderToStaticMarkup(createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, createElement(LandingPage))),
  );
}

const DESCRIPTION =
  "Comp your sports cards with recent sold prices, track your collection, and talk cards with collectors who get it.";
// The PWA manifest keeps its own line until it is changed on purpose.
const MANIFEST_DESCRIPTION = "Comp any sports card, track your collection and follow the collectors who get it";

describe("landing copy", () => {
  it("sells Quick Comp in the sub-line and closing card when the flag is on", async () => {
    const page = await landingText("1");
    assert.match(page, /Recent sold prices for any card\. Then track your cards and share them with collectors who get it\./);
    assert.doesNotMatch(page, /as good as|paid tools/i, "no comparison claims");
    assert.match(page, /Comp a card, bring your collection, find your people\. It takes a minute\./);
  });

  it("keeps today's sub-line and drops Quick Comp from the closing card when the flag is off", async () => {
    const page = await landingText(undefined);
    assert.match(page, /Track your sports cards with recent sold prices, and share them with collectors who get it\./);
    assert.match(page, /Bring your collection, find your people\. It takes a minute\./);
    assert.doesNotMatch(page, /Comp a card|Recent sold prices for any card/);
  });

  it("describes today's Slabhold in the metadata and the manifest", async () => {
    const layout = read("app/layout.tsx");
    assert.equal(layout.split(`"${DESCRIPTION}"`).length - 1, 3, "description, Open Graph and Twitter");
    assert.doesNotMatch(layout, /portfolio, flips/i);
    const { webAppManifest } = await import("@/lib/pwa/manifest");
    assert.equal(webAppManifest.description, MANIFEST_DESCRIPTION);
  });

  it("keeps \"free\" off the home share image", async () => {
    const { homeShareImage } = await import("@/lib/social/share-image");
    const image = homeShareImage();
    for (const line of [image.kicker, image.title, image.detail]) assert.doesNotMatch(String(line), /free/i);
  });
});

describe("landing claims", () => {
  it("never compares Quick Comp to other tools, and the chapter line says what it shows", async () => {
    for (const file of ["components/landing-page.tsx", "components/landing/feature-panels.tsx"]) {
      assert.doesNotMatch(read(file), /as good as|paid tools/i, file);
    }
    const { CHAPTERS } = await import("@/components/landing/feature-panels");
    assert.equal(
      CHAPTERS.find((chapter) => chapter.id === "quick-comp")?.line,
      "Recent sold prices, the median and the range.",
    );
  });
});
