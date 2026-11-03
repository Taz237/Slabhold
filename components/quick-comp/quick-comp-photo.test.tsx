import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { SavedPayload } from "@/lib/quick-comp/recent";
import { NO_PHOTO_LABEL, PHOTO_CAPTION, QuickCompPhotoHero, photoAlt } from "./quick-comp-photo";
import { QuickCompResult } from "./quick-comp-result";
import { QuickCompLoading } from "./quick-comp-states";

const identity: QuickCompIdentity = {
  playerName: "Fixture Player",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Base",
  grade: "PSA 10",
};

const photo = { url: "https://i.ebayimg.com/images/g/fixture/s-l1600.webp", itemId: "i1", soldAt: "2026-10-30" };

function saved(extra: Partial<SavedPayload> = {}): SavedPayload {
  return {
    median: 40,
    p25: 36,
    p75: 44,
    count: 1,
    source: "trawl",
    fetchedAt: null,
    lowConfidence: true,
    sample: false,
    comps: [
      {
        id: "c1",
        itemId: "i1",
        title: "2023-24 Panini Prizm Fixture Player #136 PSA 10",
        soldPrice: 40,
        soldDate: "2026-10-30",
        platform: "eBay",
        condition: "PSA 10",
        shipping: null,
        url: "https://example.test/1",
      },
    ],
    ...extra,
  };
}

const hero = (value: unknown) =>
  renderToStaticMarkup(createElement(QuickCompPhotoHero, { photo: value as never, identity }));

describe("Quick Comp photo", () => {
  it("draws one plain img from eBay's host with no referrer", () => {
    const html = hero(photo);
    assert.equal((html.match(/<img/g) ?? []).length, 1);
    assert.match(html, new RegExp(`src="${photo.url.replace(/[.]/g, "\\.")}"`));
    assert.match(html, /alt="2023-24 Panini Prizm Fixture Player #136, PSA 10, from a recent eBay sale"/);
    assert.equal(photoAlt(identity), "2023-24 Panini Prizm Fixture Player #136, PSA 10, from a recent eBay sale");
    assert.match(html, /referrerPolicy="no-referrer"/i);
    assert.match(html, /decoding="async"/);
    assert.match(html, /width="448"/);
    assert.match(html, /height="448"/);
    assert.match(html, /object-contain/);
    assert.ok(html.includes(`>${PHOTO_CAPTION}<`));
    assert.doesNotMatch(html, /_next\/image/);
  });

  it("draws the placeholder for no photo, with no img and no caption", () => {
    for (const value of [null, undefined, { ...photo, url: "javascript:alert(1)" }, { ...photo, url: "https://evil.com/a.webp" }]) {
      const html = hero(value);
      assert.doesNotMatch(html, /<img/);
      assert.match(html, new RegExp(`role="img" aria-label="${NO_PHOTO_LABEL}"`));
      assert.ok(!html.includes(PHOTO_CAPTION));
    }
  });

  it("keeps the box and the loading block the same size", () => {
    const loading = renderToStaticMarkup(createElement(QuickCompLoading));
    for (const html of [hero(photo), hero(null), loading]) {
      assert.match(html, /relative h-56 w-full overflow-hidden rounded-2xl/);
      assert.match(html, /mt-2 flex h-5 items-center/);
    }
    assert.ok(loading.indexOf("h-56") < loading.indexOf("data-comp-skeleton"), "the photo box loads first");
    assert.doesNotMatch(loading, /animate-pulse/);
  });

  it("puts the photo above the value, and the placeholder on a saved row without one", () => {
    const render = (payload: SavedPayload) =>
      renderToStaticMarkup(createElement(QuickCompResult, { identity, catalog: null, payload, Chart: null, savedAt: "2026-11-03T10:00:00.000Z" }));
    const withPhoto = render(saved({ photo }));
    assert.ok(withPhoto.indexOf("<img") > withPhoto.indexOf("Saved"));
    assert.ok(withPhoto.indexOf("<img") < withPhoto.indexOf("data-comp-skeleton"));

    const old = saved();
    delete old.photo;
    const oldHtml = render(old);
    assert.doesNotMatch(oldHtml, /<img/);
    assert.ok(oldHtml.includes(`aria-label="${NO_PHOTO_LABEL}"`));

    const empty = render(saved({ comps: [], median: null, photo: null }));
    assert.match(empty, /data-comp-empty/);
    assert.ok(empty.indexOf(NO_PHOTO_LABEL) < empty.indexOf("data-comp-empty"));
  });
});
