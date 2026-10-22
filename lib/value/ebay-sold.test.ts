import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import {
  EBAY_SOLD_LINK_LABEL,
  attachmentPriceText,
  ebaySoldSearchQuery,
  ebaySoldSearchUrl,
  ebaySoldSearchUrlForCard,
  visibleAcquiredSource,
} from "./ebay-sold";

describe("eBay sold search", () => {
  it("builds a sold and completed search for the card", () => {
    const query = ebaySoldSearchQuery({
      playerName: "J.J. McCarthy",
      yearLabel: "2024",
      setBrand: "Panini Donruss",
      parallel: "Optic Preview-Pink",
      cardNumber: "303",
      grade: "Raw",
    });
    assert.equal(query, "2024 Panini Donruss J.J. McCarthy Optic Preview Pink #303");
    const href = ebaySoldSearchUrl(query);
    assert.ok(href);
    const url = new URL(href);
    assert.equal(url.origin + url.pathname, "https://www.ebay.com/sch/i.html");
    assert.equal(url.searchParams.get("_nkw"), query);
    assert.equal(url.searchParams.get("LH_Sold"), "1");
    assert.equal(url.searchParams.get("LH_Complete"), "1");
    assert.equal(
      ebaySoldSearchUrlForCard({ playerName: "J.J. McCarthy", yearLabel: "2024" }),
      ebaySoldSearchUrl("2024 J.J. McCarthy"),
    );
    assert.equal(ebaySoldSearchUrl("   "), null);
    assert.equal(ebaySoldSearchUrlForCard({ playerName: "  ", setBrand: "" }), null);
    assert.equal(EBAY_SOLD_LINK_LABEL, "Sold comps via Trawl");
    assert.doesNotMatch(EBAY_SOLD_LINK_LABEL, /fee/i);
    if (!href) throw new Error("missing sold search");
    const html = renderToStaticMarkup(createElement(EbaySoldLink, { href }));
    assert.match(html, /Sold comps via Trawl/);
    assert.match(html, /href="https:\/\/www\.ebay\.com\/sch\/i\.html\?/);
    assert.match(html, /LH_Sold=1/);
    assert.doesNotMatch(html, /See eBay sold/);
    assert.doesNotMatch(html, /fee/i);
  });

  it("keeps a real estimate and drops the empty sales line and plain eBay", () => {
    assert.equal(attachmentPriceText("$35.00"), "$35.00");
    assert.equal(attachmentPriceText("Value updating"), "Value updating");
    assert.equal(attachmentPriceText("…"), "…");
    assert.equal(attachmentPriceText(NOT_ENOUGH_SALES_LABEL), null);
    assert.equal(attachmentPriceText("  "), null);
    assert.equal(visibleAcquiredSource("eBay"), null);
    assert.equal(visibleAcquiredSource("Card show"), "Card show");
  });
});
