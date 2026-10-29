import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { exactTime } from "@/lib/format";
import { FEED_ROW_ESTIMATE_PX, createRowHeights } from "./timeline";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("feed row heights", () => {
  it("starts unseen rows at the estimate and remembers drawn ones", () => {
    const heights = createRowHeights();
    assert.equal(heights.get("a"), FEED_ROW_ESTIMATE_PX);
    heights.set("a", 612.4);
    assert.equal(heights.get("a"), 612);
    heights.set("a", 0);
    assert.equal(heights.get("a"), 612, "a skipped row reporting 0 keeps the real height");
  });

  it("forgets the oldest rows past its limit", () => {
    const heights = createRowHeights(2);
    heights.set("a", 100);
    heights.set("b", 200);
    heights.set("c", 300);
    assert.equal(heights.get("a"), FEED_ROW_ESTIMATE_PX);
    assert.equal(heights.get("c"), 300);
  });
});

describe("timeline scroll work", () => {
  it("skips offscreen rows, but never clips a row's menu, dialog or toast", () => {
    const css = read("app/globals.css");
    assert.match(css, /\.feed-row \{\s*content-visibility: auto;\s*\}/);
    assert.match(
      css,
      /\.feed-row:has\(\[role="menu"\], \[role="dialog"\], \[role="status"\], \.fixed\) \{\s*content-visibility: visible;/,
    );
    const ui = read("components/timeline-ui.tsx");
    assert.match(ui, /data-feed-key=\{itemKey\}/);
    assert.match(ui, /containIntrinsicSize: `auto \$\{rowHeights\.get\(itemKey\)\}px`/);
    // The fade-in is unchanged.
    assert.match(ui, /motion-safe:animate-\[feed-in_420ms_cubic-bezier\(0\.2,0\.7,0\.2,1\)_both\]/);
  });

  it("doesn't prefetch every link a row scrolls past; it warms the one you touch", () => {
    const tweet = read("components/tweet.tsx");
    const links = tweet.match(/<Link\b[^>]*>/g) ?? [];
    assert.ok(links.length >= 5);
    for (const link of links) assert.match(link, /prefetch=\{false\}/, link);
    assert.match(tweet, /onPointerDown=\{warmPost\}/);
    assert.match(tweet, /router\.prefetch\(link\.getAttribute\("href"\)/);
    assert.match(read("components/post-card-tile.tsx"), /prefetch=\{false\}/);
    assert.match(read("components/card-tile.tsx"), /prefetch=\{prefetch\}/);
  });

  it("shows a like at once and lets the feed catch up in a transition", () => {
    const tweet = read("components/tweet.tsx");
    assert.match(tweet, /setLikeTap\(\{ liked: !liked/);
    assert.match(tweet, /startTransition\(\(\) => toggleLike\(targetId\)\)/);
  });

  it("formats the exact post time the same way, with one shared formatter", () => {
    const stamp = "2026-10-29T15:04:00.000Z";
    const expected = new Date(stamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    assert.equal(exactTime(stamp), expected);
    assert.equal(exactTime(null), "");
  });
});
