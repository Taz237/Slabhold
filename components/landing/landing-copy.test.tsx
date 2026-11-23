import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { ALL_SCREEN_FILES, htmlText, htmlWords, mediaRoot, withLandingContexts } from "@/lib/test/landing-fixtures";

installDom();

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** The landing page with every slot filled and no posts: every word on it is ours. */
async function landingHtml() {
  process.env.NEXT_PUBLIC_QUICK_COMP = "1";
  const { LandingPage } = await import("@/components/landing-page");
  const fixture = mediaRoot([...ALL_SCREEN_FILES, "profile-cards.mp4", "home-for-you.mp4"], { hero: true });
  try {
    return renderToStaticMarkup(withLandingContexts(createElement(LandingPage, { media: fixture.media() })));
  } finally {
    fixture.remove();
    delete process.env.NEXT_PUBLIC_QUICK_COMP;
  }
}

const BADGE = "Download on the App Store";

/** Every word a visitor can read or hear, minus the official badge's own name. */
function ourWords(html: string): string {
  const words = htmlWords(html);
  const badges = (html.match(/<img src="\/landing\/app-store-badge\.svg" alt="Download on the App Store"/g) ?? []).length;
  assert.equal(words.split(BADGE).length - 1, badges, "the badge's words appear only as the official artwork's name");
  assert.ok(badges >= 3);
  return words.split(BADGE).join(" ");
}

const DESCRIPTION =
  "Comp your sports cards with recent sold prices, track your collection, and talk cards with collectors who get it.";
// The PWA manifest keeps its own line until it is changed on purpose.
const MANIFEST_DESCRIPTION = "Comp any sports card, track your collection and follow the collectors who get it";

/** Words the landing never says. "Download on the App Store" is allowed only as Apple's own badge. */
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
  it("says the hero line and each section's heading and one line, word for word", async () => {
    const page = htmlText(await landingHtml());
    for (const line of [
      "Talk cards here.",
      "A timeline that's only cards. Post pickups and pulls, follow collectors who chase what you chase, and see what cards really sold for.",
      "A timeline that's only cards.",
      "Your cards, front and center",
      "Scan a card. See what it sold for.",
      "Crop and straighten, a typed reveal, then the sold prices for that exact card.",
      "Your cards, and what they're worth.",
      "A cards-first grid, a value you can scrub, and the movers underneath.",
      "Swipe the catalog.",
      "A feed of cards you can swipe through.",
      "The weekly board.",
      "Climb it each week, and bring a buddy with you.",
      "Join Slabhold",
      "Built by collectors, for collectors.",
    ]) {
      assert.ok(page.includes(line), line);
    }
  });

  it("uses none of the banned words anywhere in the rendered page", async () => {
    const words = ourWords(await landingHtml());
    for (const [name, pattern] of BANNED) assert.doesNotMatch(words, pattern, name);
  });

  it("has no Quick Comp, no comps line, no Get the app label, no samples and no made-up price", async () => {
    const html = await landingHtml();
    const words = ourWords(html);
    assert.doesNotMatch(words, /Quick Comp|see its comps|comp it in the app|Get the app/i);
    assert.doesNotMatch(words, /Sample Rookie|\bSample\b|Replay/);
    assert.doesNotMatch(words, /\$128|\$412|\$\s?\d/);
    assert.doesNotMatch(words, /any card/i);
    assert.doesNotMatch(words, /you pick the exact version|Know the exact version/);
    assert.doesNotMatch(html, /\/landing\/avatars\//);
    assert.doesNotMatch(html, /sample-raw-card\.svg|sample-card\.svg|kitchen-table-card/);
  });

  it("keeps the hobby rules: no marketplace, no TCG, no eBay, no made-up counts, no rivals, team voice", async () => {
    const words = ourWords(await landingHtml());
    assert.doesNotMatch(words, /marketplace|buy now|for sale|sell your|asking price|\bask\b|\boffers?\b/i);
    assert.doesNotMatch(words, /pok[eé]mon|tcg|mail day/i);
    assert.doesNotMatch(words, /ebay|trawl/i);
    assert.doesNotMatch(words, /\d[\d,.]*\+?\s*(k\s*)?(collectors|users|members|people)\b/i);
    assert.doesNotMatch(words, /testimonial|trusted by|loved by/i);
    assert.doesNotMatch(words, /CollX|Ludex|Card Ladder|Alt\b|130 ?point|Market Movers|unlike|better than|other apps/i);
    assert.doesNotMatch(words, /\bNBA\b|\bNFL\b|\bMLB\b|\bNHL\b|Panini|Topps|Upper Deck|Giants/, "no league, team or maker names added by the page");
    assert.doesNotMatch(words, /auto-?detect|automatically|instantly/i);
    assert.doesNotMatch(words, /\b(we|I)'ve\b|\bmy\b/i, "team voice");
    assert.doesNotMatch(words, /!/);
  });

  it("draws only real pictures: the logo, the official badge, the hero card and the screens", async () => {
    const html = await landingHtml();
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => decodeURIComponent(match[1].replace(/&amp;/g, "&")));
    assert.ok(images.length >= 5);
    for (const src of images) {
      assert.ok(
        src === "/logo.svg" || src === "/landing/app-store-badge.svg" || src.includes("/landing/hero-card.jpg") || src.includes("/landing/screens/"),
        src,
      );
    }
    const empty = renderToStaticMarkup(
      withLandingContexts(createElement((await import("@/components/landing-page")).LandingPage, { media: EMPTY_MEDIA })),
    );
    const bare = [...empty.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(bare)].sort(), ["/landing/app-store-badge.svg", "/logo.svg"]);
  });

  it("describes today's Slabhold in the site metadata and the manifest", async () => {
    const layout = read("app/layout.tsx");
    assert.equal(layout.split(`"${DESCRIPTION}"`).length - 1, 3, "description, Open Graph and Twitter");
    assert.doesNotMatch(layout, /portfolio, flips/i);
    const { webAppManifest } = await import("@/lib/pwa/manifest");
    assert.equal(webAppManifest.description, MANIFEST_DESCRIPTION);
  });

  it("gives / and /welcome the new title and description, on the page, Open Graph and Twitter", async () => {
    const { LANDING_TITLE, LANDING_DESCRIPTION, LANDING_OPEN_GRAPH, LANDING_TWITTER } = await import("@/lib/landing/seo");
    assert.equal(LANDING_TITLE, "Slabhold: the sports card timeline, collection and scanner");
    assert.equal(
      LANDING_DESCRIPTION,
      "Talk cards with collectors, show off your collection, and see what cards really sold for. Scan a card or slab to add it.",
    );
    assert.equal(LANDING_OPEN_GRAPH.title, LANDING_TITLE);
    assert.equal(LANDING_OPEN_GRAPH.description, LANDING_DESCRIPTION);
    assert.equal(LANDING_TWITTER.title, LANDING_TITLE);
    assert.equal(LANDING_TWITTER.description, LANDING_DESCRIPTION);
    assert.deepEqual(LANDING_OPEN_GRAPH.images.map((image) => image.url), ["/opengraph-image"]);
    assert.deepEqual([...LANDING_TWITTER.images], ["/twitter-image"]);
    for (const page of ["app/welcome/page.tsx", "app/(app)/page.tsx"]) {
      const source = read(page);
      assert.match(source, /title: LANDING_TITLE,\s*description: LANDING_DESCRIPTION,/, page);
      assert.match(source, /openGraph: \{ \.\.\.LANDING_OPEN_GRAPH/, page);
      assert.match(source, /twitter: \{ \.\.\.LANDING_TWITTER/, page);
    }
  });

  it("keeps the banned words off the page's title, description and share image", async () => {
    const { LANDING_TITLE, LANDING_DESCRIPTION } = await import("@/lib/landing/seo");
    const { homeShareImage } = await import("@/lib/social/share-image");
    const image = homeShareImage();
    const words = [LANDING_TITLE, LANDING_DESCRIPTION, image.kicker, image.title, image.detail].join("\n");
    for (const [name, pattern] of BANNED) assert.doesNotMatch(words, pattern, name);
    assert.equal(`${image.title}${image.detail}`, "Talk cards here.");
    const og = read("components/og-frame.tsx");
    assert.doesNotMatch(og, /HOME_GALAXY|radial-gradient\(circle at 8% 0%|HomeSlab|loadHomeCard|landingMedia/, "a solid field: no galaxy and no card");
  });
});
