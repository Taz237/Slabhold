import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createElement } from "react";
import { installDom } from "@/lib/test/dom";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { FIXTURE_COMP, FIXTURE_FOUNDER, htmlText, htmlWords, renderLoaded, withLandingContexts } from "@/lib/test/landing-fixtures";

const { win } = installDom();
// The Quick Comp panel's code loads "once idle"; jsdom has no idle callback, so idle is now.
(win as unknown as { requestIdleCallback: (run: () => void) => number }).requestIdleCallback = (run) => win.setTimeout(run, 0);

const FLAG = process.env.NEXT_PUBLIC_QUICK_COMP;
afterEach(() => {
  if (FLAG === undefined) delete process.env.NEXT_PUBLIC_QUICK_COMP;
  else process.env.NEXT_PUBLIC_QUICK_COMP = FLAG;
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** The rendered landing with real cards and a real comp, its lazy panel loaded. */
async function landingHtml(flag: "1" | undefined) {
  if (flag) process.env.NEXT_PUBLIC_QUICK_COMP = flag;
  else delete process.env.NEXT_PUBLIC_QUICK_COMP;
  const { LandingPage } = await import("@/components/landing-page");
  const { LandingCompProvider } = await import("@/components/landing/landing-links");
  const page = createElement(LandingPage, { founder: FIXTURE_FOUNDER, comp: FIXTURE_COMP, media: EMPTY_MEDIA });
  return renderLoaded(withLandingContexts(createElement(LandingCompProvider, { comp: FIXTURE_COMP }, page)));
}

const DESCRIPTION =
  "Comp your sports cards with recent sold prices, track your collection, and talk cards with collectors who get it.";
// The PWA manifest keeps its own line until it is changed on purpose.
const MANIFEST_DESCRIPTION = "Comp any sports card, track your collection and follow the collectors who get it";

/** Words the landing never says. "Download on the App Store" is allowed only inside Apple's own badge, which the page no longer draws. */
const BANNED: [string, RegExp][] = [
  ["best", /\bbest\b/i],
  ["AI", /\bAI\b/],
  ["free", /\bfree\b/i],
  ["number one", /number one/i],
  ["#1", /#1\b/],
  ["flip", /\bflip(s|ped|ping)?\b/i],
  ["download", /\bdownload/i],
  ["mail", /\bmail\b/i],
  ["seconds", /\bseconds?\b/i],
  ["any card", /any card/i],
  ["next upgrade", /next upgrade/i],
  ["a hashtag", /(^|\s)#[a-z]\w+/i],
];

describe("landing copy", () => {
  it("says the same hero line with Quick Comp on or off: scan, read the edge, you pick the version", async () => {
    for (const flag of ["1", undefined] as const) {
      const page = htmlText(await landingHtml(flag));
      assert.match(page, /Scan it\. Know the exact version\./);
      assert.match(
        page,
        /Slabhold crops and straightens your card, reads it down to the edge serial, then you pick the exact version and see what it sold for\./,
      );
      assert.doesNotMatch(page, /as good as|paid tools/i, "no comparison claims");
      assert.doesNotMatch(page, /Recent sold prices for any card|It takes a minute/);
    }
  });

  it("shows the Quick Comp section only with its flag on", async () => {
    assert.match(htmlText(await landingHtml("1")), /Quick Comp Recent sold prices, the median and the range\./);
    assert.doesNotMatch(htmlText(await landingHtml(undefined)), /Quick Comp/);
  });

  it("uses none of the banned words anywhere in the rendered page", async () => {
    const html = await landingHtml("1");
    const words = htmlWords(html);
    assert.match(words, /via Trawl/, "the Quick Comp panel was read too");
    for (const [name, pattern] of BANNED) assert.doesNotMatch(words, pattern, name);
  });

  it("has no Sample Rookie, no $128.00 demo price and no \"any card\" line", async () => {
    const html = await landingHtml("1");
    assert.doesNotMatch(html, /Sample Rookie/);
    assert.doesNotMatch(html, /\$128\.00/);
    assert.doesNotMatch(html, /any card/i);
    assert.doesNotMatch(htmlWords(html), /\bSample\b|Sample accounts|Replay/);
    for (const file of ["components/landing/showcase/sample-data.ts", "components/landing/showcase/quick-comp-demo.tsx"]) {
      assert.doesNotMatch(read(file), /Sample Rookie|SAMPLE_SCAN|sample-raw-card/, file);
    }
  });

  it("draws no made-up people and no made-up card: no avatar and no sample card image", async () => {
    const html = await landingHtml("1");
    assert.doesNotMatch(html, /\/landing\/avatars\//);
    assert.doesNotMatch(html, /sample-raw-card\.svg|sample-card\.svg/);
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => decodeURIComponent(match[1].replace(/&amp;/g, "&")));
    assert.ok(images.length >= 5);
    for (const src of images) {
      assert.ok(src === "/logo.svg" || src.includes("/card-photos/") || src === FIXTURE_COMP.photo.src, src);
    }
  });

  it("describes today's Slabhold in the site metadata and the manifest", async () => {
    const layout = read("app/layout.tsx");
    assert.equal(layout.split(`"${DESCRIPTION}"`).length - 1, 3, "description, Open Graph and Twitter");
    assert.doesNotMatch(layout, /portfolio, flips/i);
    const { webAppManifest } = await import("@/lib/pwa/manifest");
    assert.equal(webAppManifest.description, MANIFEST_DESCRIPTION);
  });

  it("keeps the banned words off the page's title, description and share image", async () => {
    const { LANDING_TITLE, LANDING_DESCRIPTION } = await import("@/lib/landing/seo");
    const { homeShareImage } = await import("@/lib/social/share-image");
    const image = homeShareImage();
    const words = [LANDING_TITLE, LANDING_DESCRIPTION, image.kicker, image.title, image.detail].join("\n");
    for (const [name, pattern] of BANNED) assert.doesNotMatch(words, pattern, name);
    assert.equal(`${image.title} ${image.detail}`, "Scan it. Know the exact version.");
  });
});

describe("landing claims", () => {
  it("never compares Quick Comp to other tools, and its line says what it shows", () => {
    for (const file of ["components/landing-page.tsx", "components/landing/sections.tsx", "components/landing/glass-hero.tsx", "components/landing/quick-comp-section.tsx"]) {
      assert.doesNotMatch(read(file), /as good as|paid tools/i, file);
    }
    assert.match(read("components/landing/quick-comp-section.tsx"), /<p className="lg-lead">Recent sold prices, the median and the range\.<\/p>/);
  });
});
