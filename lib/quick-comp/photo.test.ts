import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CleanedSale, TrawlSoldResult } from "@/lib/comps/types";
import { pickQuickCompPhoto, SAMPLE_PHOTO_URL, safePhoto, safePhotoUrl, samplePhoto } from "./photo";

const img = (id: string, size = "s-l500") => `https://i.ebayimg.com/images/g/${id}/${size}.webp`;

function sale(itemId: string, title: string, soldAt: string): CleanedSale {
  return { itemId, title, price: 40, currency: "USD", soldAt, grader: null, grade: null, url: `https://example.test/${itemId}` };
}

function result(itemId: string, imageUrl: string | null, images?: string[] | null, state?: string): TrawlSoldResult {
  return {
    title: `Fixture ${itemId}`,
    sale_price: 40,
    shipping_price: 0,
    currency: "USD",
    condition: "Graded",
    condition_raw: null,
    date_sold: "2026-10-30",
    buying_format: "AUCTION",
    item_id: itemId,
    item_link: `https://example.test/${itemId}`,
    image_url: imageUrl,
    details: images === undefined && !state ? null : { images, listing_state: state ?? null },
  };
}

describe("safePhotoUrl", () => {
  it("accepts eBay's image host over https and the sample path", () => {
    assert.equal(safePhotoUrl(img("x")), img("x"));
    assert.equal(safePhotoUrl(SAMPLE_PHOTO_URL), SAMPLE_PHOTO_URL);
  });

  it("rejects everything else", () => {
    for (const bad of [
      "http://i.ebayimg.com/images/g/x/s-l500.webp",
      "https://i.ebayimg.com.evil.com/images/g/x/s-l500.webp",
      "https://evil.com/i.ebayimg.com/x.webp",
      "https://user:pw@i.ebayimg.com/x.webp",
      "https://i.ebayimg.com:8443/x.webp",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//i.ebayimg.com/images/g/x/s-l500.webp",
      "/quick-comp/other.svg",
      "",
      null,
      undefined,
      42,
      {},
    ]) {
      assert.equal(safePhotoUrl(bad), null, String(bad));
    }
  });

  it("checks a stored photo again", () => {
    assert.deepEqual(safePhoto({ url: img("x"), itemId: "a", soldAt: "2026-10-30" }), {
      url: img("x"),
      itemId: "a",
      soldAt: "2026-10-30",
    });
    assert.equal(safePhoto({ url: "javascript:alert(1)", itemId: "a", soldAt: "2026-10-30" }), null);
    assert.equal(safePhoto({ url: img("x") }), null);
    assert.equal(safePhoto(undefined), null);
    assert.equal(safePhoto("x"), null);
  });

  it("dates the sample photo to the newest sample sale", () => {
    assert.deepEqual(samplePhoto(["2026-10-01", "2026-10-20", "2026-10-11"]), {
      url: SAMPLE_PHOTO_URL,
      itemId: "sample",
      soldAt: "2026-10-20",
    });
  });
});

describe("pickQuickCompPhoto", () => {
  it("prefers the newest grade-matching sale over a newer one without the grade", () => {
    const sales = [
      sale("new", "2023 Prizm Fixture Player #12", "2026-10-30"),
      sale("psa-old", "2023 Prizm Fixture Player #12 PSA 10", "2026-10-01"),
      sale("psa-mid", "2023 Prizm Fixture Player #12 PSA 10 Gem Mint", "2026-10-20"),
    ];
    const results = [result("new", img("new")), result("psa-old", img("old")), result("psa-mid", img("mid"))];
    assert.deepEqual(pickQuickCompPhoto(sales, results, "PSA 10"), {
      url: img("mid"),
      itemId: "psa-mid",
      soldAt: "2026-10-20",
    });
  });

  it("falls back to the newest sale with any photo", () => {
    const sales = [
      sale("a", "2023 Prizm Fixture Player #12", "2026-10-02"),
      sale("b", "2023 Prizm Fixture Player #12", "2026-10-28"),
      sale("c", "2023 Prizm Fixture Player #12", "2026-10-30"),
    ];
    const results = [result("a", img("a")), result("b", img("b")), result("c", null)];
    assert.equal(pickQuickCompPhoto(sales, results, "PSA 10")?.itemId, "b");
  });

  it("prefers the sharper details.images[0] over image_url", () => {
    const sales = [sale("a", "Fixture PSA 10", "2026-10-30")];
    const results = [result("a", img("a"), [img("a", "s-l1600"), img("a2", "s-l1600")])];
    assert.equal(pickQuickCompPhoto(sales, results, "PSA 10")?.url, img("a", "s-l1600"));
    const unsafeFirst = [result("a", img("a"), ["https://evil.com/a.webp"])];
    assert.equal(pickQuickCompPhoto(sales, unsafeFirst, "PSA 10")?.url, img("a"));
  });

  it("never uses a result that was dropped from the sales", () => {
    const sales = [sale("kept", "Fixture PSA 10", "2026-10-01")];
    const results = [result("dropped", img("dropped")), result("kept", null)];
    assert.equal(pickQuickCompPhoto(sales, results, "PSA 10"), null);
  });

  it("skips removed listings with no images and is null when nothing has one", () => {
    const sales = [sale("gone", "Fixture PSA 10", "2026-10-30"), sale("live", "Fixture PSA 10", "2026-10-01")];
    const results = [result("gone", null, null, "removed"), result("live", img("live"))];
    assert.equal(pickQuickCompPhoto(sales, results, "PSA 10")?.itemId, "live");
    assert.equal(pickQuickCompPhoto(sales, [result("gone", null, null, "removed")], "PSA 10"), null);
    assert.equal(pickQuickCompPhoto([], [], "PSA 10"), null);
  });

  it("keeps PSA 10 off PSA 100 and BGS 9 off BGS 9.5", () => {
    const psa = [sale("hundred", "Fixture PSA 100 lot", "2026-10-30"), sale("ten", "Fixture PSA10", "2026-10-01")];
    const psaResults = [result("hundred", img("hundred")), result("ten", img("ten"))];
    assert.equal(pickQuickCompPhoto(psa, psaResults, "PSA 10")?.itemId, "ten");

    const bgs = [sale("nine", "Fixture BGS 9 Mint", "2026-10-30"), sale("half", "Fixture BGS 9.5 Gem", "2026-10-01")];
    const bgsResults = [result("nine", img("nine")), result("half", img("half"))];
    assert.equal(pickQuickCompPhoto(bgs, bgsResults, "BGS 9.5")?.itemId, "half");
    assert.equal(pickQuickCompPhoto(bgs, bgsResults, "BGS 9")?.itemId, "nine");
    const reversed = [sale("half", "Fixture BGS 9.5 Gem", "2026-10-30"), sale("nine", "Fixture BGS 9 Mint", "2026-10-01")];
    assert.equal(pickQuickCompPhoto(reversed, bgsResults, "BGS 9")?.itemId, "nine");
  });

  it("skips graded titles for raw", () => {
    const sales = [
      sale("psa", "Fixture PSA 9", "2026-10-30"),
      sale("graded", "Fixture graded 9", "2026-10-29"),
      sale("slab", "Fixture in slab", "2026-10-28"),
      sale("raw", "Fixture base card", "2026-10-01"),
    ];
    const results = sales.map((row) => result(row.itemId, img(row.itemId)));
    assert.equal(pickQuickCompPhoto(sales, results, "Raw")?.itemId, "raw");
  });
});
