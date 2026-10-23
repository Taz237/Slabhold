import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { CollectionTrendReadout } from "@/components/collection-value-trend";
import {
  canShowCollectionTrend,
  collectionTrendView,
  describeCollectionTrend,
  ESTIMATED_VALUE_LABEL,
  pointsInTrendRange,
  trendChange,
  type TrendSnapshot,
} from "./value-trend";

const TODAY = "2026-10-22";

function points(): TrendSnapshot[] {
  return [
    { date: "2026-09-01", value: 1000 },
    { date: "2026-10-01", value: 1100 },
    { date: "2026-10-16", value: 1200 },
    { date: "2026-10-22", value: 1242 },
  ];
}

describe("collection value trend math", () => {
  it("formats a gain, a loss, a zero move, and a zero starting value", () => {
    assert.equal(
      trendChange(
        [
          { date: "2026-10-16", value: 1000 },
          { date: "2026-10-22", value: 1031 },
        ],
        "7d",
      )?.label,
      "+$31 (3.1%) in 7 days",
    );
    assert.equal(
      trendChange(
        [
          { date: "2026-10-16", value: 200 },
          { date: "2026-10-22", value: 158 },
        ],
        "7d",
      )?.label,
      "\u2212$42 (21.0%) in 7 days",
    );
    assert.equal(
      trendChange(
        [
          { date: "2026-10-16", value: 1000 },
          { date: "2026-10-22", value: 1000 },
        ],
        "30d",
      )?.label,
      "$0 (0.0%) in 30 days",
    );
    const divided = trendChange(
      [
        { date: "2026-10-16", value: 0 },
        { date: "2026-10-22", value: 42 },
      ],
      "7d",
    );
    assert.equal(divided?.percent, null);
    assert.equal(divided?.label, "+$42 in 7 days");
    assert.equal(Number.isFinite(divided?.delta), true);
    assert.equal(
      trendChange(
        [
          { date: "2026-10-16", value: 0 },
          { date: "2026-10-22", value: 0 },
        ],
        "all",
      )?.label,
      "$0 (0.0%) all time",
    );
  });

  it("hides the line and chart until two snapshots exist", () => {
    assert.deepEqual(describeCollectionTrend([], "7d", TODAY), {
      kind: "tracking",
      label: null,
    });
    const one = describeCollectionTrend([{ date: "2026-10-16", value: 80 }], "7d", TODAY);
    assert.equal(one.kind, "tracking");
    if (one.kind !== "tracking") return;
    assert.equal(one.label, "Tracking started Oct 16");

    const html = renderToStaticMarkup(
      createElement(CollectionTrendReadout, {
        viewerId: "owner",
        ownerId: "owner",
        collectionPublic: false,
        snapshots: [{ date: "2026-10-16", value: 80 }],
        range: "7d",
        today: TODAY,
        onRange: () => undefined,
      }),
    );
    assert.match(html, /Tracking started Oct 16/);
    assert.equal(html.includes("<svg"), false);
    assert.equal(html.includes("in 7 days"), false);
    assert.equal(html.includes("7D"), false);
  });

  it("filters 7D, 30D, and all to different windows", () => {
    const series = points();
    const week = pointsInTrendRange(series, "7d", TODAY);
    const month = pointsInTrendRange(series, "30d", TODAY);
    const all = pointsInTrendRange(series, "all", TODAY);
    assert.deepEqual(week.map((point) => point.date), ["2026-10-16", "2026-10-22"]);
    assert.deepEqual(month.map((point) => point.date), ["2026-10-01", "2026-10-16", "2026-10-22"]);
    assert.equal(all.length, 4);
    assert.equal(trendChange(week, "7d")?.label, "+$42 (3.5%) in 7 days");
    assert.equal(trendChange(month, "30d")?.delta, 142);
    assert.equal(trendChange(all, "all")?.delta, 242);
    assert.notEqual(trendChange(week, "7d")?.delta, trendChange(month, "30d")?.delta);
    assert.notEqual(trendChange(month, "30d")?.delta, trendChange(all, "all")?.delta);
  });

  it("shows a private collection's trend only to its owner", () => {
    const snapshots = points();
    assert.equal(
      canShowCollectionTrend({ viewerId: "owner", ownerId: "owner", collectionPublic: false }),
      true,
    );
    assert.equal(
      canShowCollectionTrend({ viewerId: "owner", ownerId: "owner", collectionPublic: true }),
      true,
    );
    assert.equal(
      canShowCollectionTrend({ viewerId: "visitor", ownerId: "owner", collectionPublic: false }),
      false,
    );
    assert.equal(
      canShowCollectionTrend({ viewerId: "visitor", ownerId: "owner", collectionPublic: true }),
      false,
    );
    assert.equal(
      canShowCollectionTrend({ viewerId: null, ownerId: "owner", collectionPublic: false }),
      false,
    );
    assert.equal(
      canShowCollectionTrend({ viewerId: null, ownerId: "owner", collectionPublic: true }),
      false,
    );
    assert.equal(collectionTrendView({
      viewerId: "visitor",
      ownerId: "owner",
      collectionPublic: false,
      snapshots,
      range: "7d",
      today: TODAY,
    }), null);

    const hidden = renderToStaticMarkup(
      createElement(CollectionTrendReadout, {
        viewerId: "visitor",
        ownerId: "owner",
        collectionPublic: false,
        snapshots,
        range: "7d",
        today: TODAY,
        onRange: () => undefined,
      }),
    );
    assert.equal(hidden, "");
    assert.equal(hidden.includes("svg"), false);
    assert.equal(hidden.includes("$"), false);

    const shown = renderToStaticMarkup(
      createElement(CollectionTrendReadout, {
        viewerId: "owner",
        ownerId: "owner",
        collectionPublic: false,
        snapshots,
        range: "7d",
        today: TODAY,
        onRange: () => undefined,
      }),
    );
    assert.match(shown, /\+\$42 \(3\.5%\) in 7 days/);
    assert.match(shown, /<svg/);
    assert.match(shown, /7D/);

    const profile = readFileSync(join(process.cwd(), "components/profile-view.tsx"), "utf8");
    const trend = readFileSync(join(process.cwd(), "components/collection-value-trend.tsx"), "utf8");
    const math = readFileSync(join(process.cwd(), "lib/collection/value-trend.ts"), "utf8");
    assert.equal(profile.includes("CollectionValueTrend"), false);
    assert.equal(profile.includes("collection_snapshots"), false);
    assert.equal(trend.includes("recharts"), false);
    assert.equal(trend.includes("card_value_snapshots"), false);
    assert.equal(trend.includes("CARD_VALUE_HISTORY"), false);
    assert.equal(math.includes("card_value_snapshots"), false);
    assert.equal(math.includes("CARD_VALUE_HISTORY"), false);
    const dashboard = readFileSync(join(process.cwd(), "components/dashboard.tsx"), "utf8");
    assert.match(math, new RegExp(ESTIMATED_VALUE_LABEL.replace(/[.]/g, "\\.")));
    assert.match(dashboard, /ESTIMATED_VALUE_LABEL/);
    assert.match(dashboard, /CollectionValueTrend/);
  });
});
