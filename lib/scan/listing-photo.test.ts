import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { listingPhotoFor, safeListingPhoto, safeListingUrl, withListingPhotos } from "./listing-photo";
import { rankScanMatches, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/** A photo of that exact card from a sold listing the search already returned. Made-up listings. */

function result(title: string, image: string | null, id: string, soldAt = "2026-11-01"): TrawlSoldResult {
  return {
    title,
    sale_price: 30,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: `${soldAt}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: id,
    item_link: `https://www.ebay.com/itm/${id}`,
    image_url: image,
    details: null,
  } as TrawlSoldResult;
}

function miller(parallel: string): ScanMatch {
  const read = scanReadFrom(
    { lines: ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"], backLines: ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."], image: null, kind: "card", border: null },
    INDEXED_DIRECTORY,
  );
  const match = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
  assert.ok(match);
  return { ...match, parallel };
}

const IMG = "https://i.ebayimg.com/images/g/abc/s-l500.jpg";
const RESULTS = [
  result("2024 Bowman Aidan Miller 1st Pink/Red /299 #BP-27", IMG, "1", "2026-10-01"),
  result("2024 Bowman Aidan Miller 1st Pink Red 12/299 BP-27", "https://i.ebayimg.com/images/g/new/s-l500.jpg", "2", "2026-11-05"),
  result("2024 Bowman Aidan Miller 1st Fuchsia /299 #BP-27", "https://i.ebayimg.com/images/g/fuchsia/s-l500.jpg", "3", "2026-11-06"),
  result("2024 Bowman Chrome Paul Skenes 1st Pink/Red /299", "https://i.ebayimg.com/images/g/other/s-l500.jpg", "4", "2026-11-07"),
  result("2024 Bowman Aidan Miller 1st Pink/Red /299 #BP-27 PSA 10", "https://i.ebayimg.com/images/g/slab/s-l500.jpg", "5", "2026-11-08"),
];

describe("listing photos", () => {
  it("is the newest sold listing of that exact card and parallel, linked to the listing", () => {
    const photo = listingPhotoFor(miller("Pink/Red"), RESULTS, INDEXED_DIRECTORY);
    assert.deepEqual(photo, { imageUrl: "https://i.ebayimg.com/images/g/new/s-l500.jpg", url: "https://www.ebay.com/itm/2", soldAt: "2026-11-05T18:00:00.000Z" });
  });

  it("is never another parallel's, another player's or a slab's photo", () => {
    assert.equal(listingPhotoFor(miller("Fuchsia"), RESULTS, INDEXED_DIRECTORY)?.imageUrl, "https://i.ebayimg.com/images/g/fuchsia/s-l500.jpg");
    assert.equal(listingPhotoFor(miller("Gold"), RESULTS, INDEXED_DIRECTORY), null);
    for (const parallel of ["Pink/Red", "Fuchsia", "Gold", ""]) {
      const url = listingPhotoFor(miller(parallel), RESULTS, INDEXED_DIRECTORY)?.imageUrl ?? "";
      assert.doesNotMatch(url, /other|slab/, parallel);
    }
  });

  it("a numbered card with its parallel open gets no photo: any one could be another parallel", () => {
    assert.equal(listingPhotoFor(miller(""), RESULTS, INDEXED_DIRECTORY), null);
  });

  it("no image on the listing, or no search results: no photo", () => {
    assert.equal(listingPhotoFor(miller("Pink/Red"), [result("2024 Bowman Aidan Miller 1st Pink/Red /299 #BP-27", null, "9")], INDEXED_DIRECTORY), null);
    assert.equal(listingPhotoFor(miller("Pink/Red"), [], INDEXED_DIRECTORY), null);
    const [only] = withListingPhotos([miller("Gold")], RESULTS, INDEXED_DIRECTORY);
    assert.equal("listing" in only, false);
  });

  it("only eBay's image host and eBay listing links pass, checked again on the phone", () => {
    assert.equal(safeListingUrl("https://www.ebay.com/itm/1"), "https://www.ebay.com/itm/1");
    for (const bad of ["http://www.ebay.com/itm/1", "https://ebay.com.evil.example/itm/1", "javascript:alert(1)", "https://user:pw@www.ebay.com/itm/1", "", null]) {
      assert.equal(safeListingUrl(bad), null, String(bad));
    }
    assert.equal(safeListingPhoto({ imageUrl: "https://evil.example/a.jpg", url: "https://www.ebay.com/itm/1" }), null);
    assert.deepEqual(safeListingPhoto({ imageUrl: IMG, url: "https://evil.example/", soldAt: 5 }), { imageUrl: IMG, url: null, soldAt: null });
  });

  it("thumbnails are lazy, sent with no referrer, and nothing writes them to our database or storage", () => {
    const view = readFileSync(join(process.cwd(), "components/scan/listing-photo.tsx"), "utf8");
    assert.match(view, /loading="lazy"/);
    assert.match(view, /referrerPolicy="no-referrer"/);
    assert.match(view, /rel="noopener noreferrer"/);
    assert.match(view, /safeListingPhoto\(match\.listing\)/);
    for (const file of ["lib/scan/listing-photo.ts", "components/scan/listing-photo.tsx"]) {
      assert.doesNotMatch(readFileSync(join(process.cwd(), file), "utf8"), /supabase|storage\.|\.insert\(|\.upsert\(|localStorage|saveScan/i, file);
    }
    // The Add card handoff carries the card, never the listing's photo.
    assert.doesNotMatch(readFileSync(join(process.cwd(), "lib/scan/handoff.ts"), "utf8"), /listing/);
  });
});
