import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  collectionValueImagePath,
  collectionValueShareModel,
  collectionValueShareText,
  shareRange,
} from "./collection-value";

const TODAY = "2026-10-30";
const rows = [
  { snapshot_date: "2026-09-15", value: 30 },
  { snapshot_date: "2026-10-01", value: 41 },
  { snapshot_date: "2026-10-20", value: 200 },
  { snapshot_date: TODAY, value: 285 },
];

describe("collection value share image", () => {
  it("draws the value, the range change, the handle and the site, from the same range math as the app", () => {
    const model = collectionValueShareModel({ username: "Taz", rows, range: "30d", today: TODAY });
    assert.ok(model);
    assert.equal(model.value, "$285.00");
    assert.equal(model.change, "+$244.00 (+595%) past 30 days");
    assert.equal(model.up, true);
    assert.equal(model.handle, "@taz");
    assert.equal(model.site, "slabhold.app");
    assert.match(model.line, /^M/);
    assert.match(model.area, /Z$/);
    assert.equal(model.headline, "My collection is up $244.00 this month");
  });

  it("says down when the range fell", () => {
    const model = collectionValueShareModel({
      username: "taz",
      rows: [
        { snapshot_date: "2026-10-20", value: 130.58 },
        { snapshot_date: TODAY, value: 100 },
      ],
      range: "7d",
      today: TODAY,
    });
    assert.ok(model);
    assert.equal(model.up, false);
    assert.match(model.change, /^−\$30\.58/);
    assert.equal(model.headline, "My collection this week");
  });

  it("is null with fewer than two days, so nothing empty is shared", () => {
    assert.equal(collectionValueShareModel({ username: "taz", rows: rows.slice(0, 1), range: "30d", today: TODAY }), null);
    assert.equal(collectionValueShareModel({ username: "", rows, range: "30d", today: TODAY }), null);
  });

  it("only accepts known ranges from the URL", () => {
    assert.equal(shareRange("90d"), "90d");
    assert.equal(shareRange("junk"), "30d");
    assert.equal(shareRange(null), "30d");
  });

  it("builds the image path and the post text", () => {
    assert.equal(collectionValueImagePath("7d"), "/api/share-image/collection-value?range=7d");
    assert.equal(collectionValueShareText(), "My collection on Slabhold");
  });
});

describe("collection value share route", () => {
  it("is the signed-in owner's own image, 404 for a private collection, never cached on a CDN", () => {
    const route = readFileSync(join(process.cwd(), "app/api/share-image/collection-value/route.tsx"), "utf8");
    assert.match(route, /getAuthUserId\(\)/);
    assert.match(route, /if \(publicCards\.error \|\| !publicCards\.count\) return notFound\(\);/);
    assert.match(route, /\.eq\("user_id", userId\)/);
    assert.match(route, /PRIVATE_OG_CACHE_CONTROL/);
    const hero = readFileSync(join(process.cwd(), "components/dashboard.tsx"), "utf8");
    assert.match(hero, /shareable=\{Boolean\(user\?\.username\) && cards\.some\(\(card\) => card\.isPublic\)\}/);
  });
});
