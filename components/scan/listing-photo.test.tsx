import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListingThumb } from "@/components/scan/listing-photo";
import { OtherMatches } from "@/components/scan/sheet-parts";
import { PREVIEW_RAW, PREVIEW_WITH_PHOTOS } from "@/lib/scan/preview-fixtures";

describe("ListingThumb", () => {
  it("shows the listing's photo as a 44px tap target with a name, lazy and sized", () => {
    const html = renderToStaticMarkup(createElement(ListingThumb, { match: PREVIEW_WITH_PHOTOS[0] }));
    assert.match(html, /<button[^>]*aria-label="See the sold listing&#x27;s photo: [^"]+"/);
    assert.match(html, /min-h-11 min-w-11/);
    assert.match(html, /<img[^>]*loading="lazy"/);
    assert.match(html, /width="32"[^>]*height="45"/);
  });

  it("with no listing photo, or an image host that isn't eBay's, shows the empty card and no image", () => {
    for (const match of [PREVIEW_RAW[0], { ...PREVIEW_RAW[0], listing: { imageUrl: "https://evil.example/card.jpg", url: null, soldAt: null } }]) {
      const html = renderToStaticMarkup(createElement(ListingThumb, { match }));
      assert.match(html, /role="img" aria-label="No listing photo"/);
      assert.doesNotMatch(html, /<img|<button/);
    }
  });

  it("every 'Or one of these' row has a photo or the empty card, beside its own tap-to-pick button", () => {
    const html = renderToStaticMarkup(createElement(OtherMatches, { rows: PREVIEW_WITH_PHOTOS, onPromote: () => {} }));
    const rows = html.split("<li").slice(1);
    assert.equal(rows.length, PREVIEW_WITH_PHOTOS.length - 1);
    for (const row of rows) assert.match(row, /<img[^>]*loading="lazy"|aria-label="No listing photo"/);
    assert.ok(rows.some((row) => /<img/.test(row)) && rows.some((row) => /No listing photo/.test(row)));
    // The photo's button and the row's button are siblings, never nested.
    assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });
});
