import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boardHtml, items, listHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";

/** The engraved numeral is a picture. The place is said once, for screen readers. */
const PLACE_TAG = { 1: ">1st place<", 2: ">2nd place<", 3: ">3rd place<" } as const;

describe("podium for the top 3", () => {
  it("draws ranks 1 to 3 as a three-column podium with #1 in the middle, in rank order for screen readers", () => {
    const section = boardHtml(render(pageModel(snap({ "most-cards-added": rows(10) }))), "most-cards-added");
    const podium = listHtml(section, "data-podium");
    assert.ok(podium, "the podium list is drawn");
    assert.match(podium, /grid-cols-3/);
    const places = items(podium);
    assert.equal(places.length, 3);
    assert.deepEqual(
      places.map((place) => place.tag.match(/data-rank="(\d+)"/)?.[1]),
      ["1", "2", "3"],
    );
    const order = places.map((place) => place.tag.match(/\border-(\d)\b/)?.[1]);
    assert.deepEqual(order, ["2", "1", "3"], "#2 left, #1 centre, #3 right");
    for (const [index, place] of places.entries()) {
      const rank = (index + 1) as 1 | 2 | 3;
      assert.match(place.tag, /class="[^"]*\blb-row\b/);
      assert.match(place.body, new RegExp(`lb-banner lb-banner-${rank}\\b`));
      assert.match(place.body, new RegExp(`lb-ring-${rank}\\b`));
      assert.match(place.body, new RegExp(PLACE_TAG[rank]));
      assert.match(place.body, new RegExp(`aria-hidden="true" class="lb-engraved[^"]*">${rank}<`));
      assert.match(place.body, /\btruncate\b/);
      if (rank === 1) assert.match(place.body, /data-crown=""/);
      else assert.doesNotMatch(place.body, /data-crown/);
    }
    assert.match(places[0]!.body, /width:68px;height:68px/);
    assert.match(places[1]!.body, /width:52px;height:52px/);
    assert.match(places[2]!.body, /width:52px;height:52px/);
    assert.match(places[0]!.body, /h-\[132px\]/);
    assert.match(places[1]!.body, /h-\[104px\]/);
    assert.match(places[2]!.body, /h-\[84px\]/);
    assert.equal(section.indexOf("data-podium") < section.indexOf("data-rank-rows"), true, "podium sits above the rows");
  });

  it("draws ranks 4 to 10 as slim plain rows", () => {
    const section = boardHtml(render(pageModel(snap({ "most-cards-added": rows(10) }))), "most-cards-added");
    const list = listHtml(section, "data-rank-rows");
    assert.ok(list);
    const slim = items(list);
    assert.deepEqual(
      slim.map((item) => item.tag.match(/data-rank="(\d+)"/)?.[1]),
      ["4", "5", "6", "7", "8", "9", "10"],
    );
    for (const item of slim) {
      assert.match(item.body, /min-h-14/);
      assert.match(item.body, /width:36px;height:36px/);
      assert.match(item.tag, /animation-delay:/);
      assert.doesNotMatch(item.body, /lb-banner|data-crown|place</);
    }
    assert.match(slim[0]!.body, /Name u3/);
    assert.doesNotMatch(slim[0]!.body, /@u3/, "the handle is in the sheet");
    assert.match(slim[0]!.body, />27</);
  });

  it("fills empty podium places with ghosts in their columns", () => {
    const section = boardHtml(render(pageModel(snap({ "most-cards-added": [row("solo", 2)] }))), "most-cards-added");
    const podium = listHtml(section, "data-podium");
    assert.ok(podium);
    const places = items(podium);
    assert.equal(places.length, 3);
    assert.match(places[0]!.tag, /data-rank="1"/);
    assert.match(places[1]!.tag, /data-ghost-rank="2"/);
    assert.match(places[2]!.tag, /data-ghost-rank="3"/);
    assert.match(places[1]!.tag, /\border-1\b/);
    assert.match(places[2]!.tag, /\border-3\b/);
    assert.match(places[1]!.body, /lb-ghost lb-ghost-2/);
    assert.match(places[1]!.body, /href="\/cards\/new"/);
    assert.equal(listHtml(section, "data-rank-rows"), null, "no empty rank list");
  });

  it("marks the viewer's podium place with data-viewer-row, the You tag, and a ring on the block itself", () => {
    const section = boardHtml(
      render(pageModel(snap({ "most-cards-added": [row("a", 5), row("me", 4), row("c", 1)] }), "me")),
      "most-cards-added",
    );
    const places = items(listHtml(section, "data-podium") ?? "");
    assert.match(places[1]!.tag, /data-viewer-row=""/);
    assert.match(places[1]!.body, />You</);
    assert.doesNotMatch(places[0]!.tag, /data-viewer-row/);
    // The highlight is the metal block's own shadow: same box, same width, same radius.
    const block = places[1]!.body.match(/<span data-you-block="" class="([^"]*)"/)?.[1] ?? "";
    assert.match(block, /^lb-banner lb-banner-2 /);
    assert.match(block, /\bw-full\b/);
    assert.match(block, /\brounded-xl\b/);
    assert.doesNotMatch(places[0]!.body, /data-you-block/);
    // Nothing around the block draws a ring of its own, so there is nothing to misalign.
    assert.doesNotMatch(places[1]!.body, /style="[^"]*box-shadow/);
    const css = render(pageModel(snap({}))).match(/\.lb-banner\[data-you-block\] \{[^}]*\}/)?.[0] ?? "";
    assert.match(css, /0 0 0 3px #A78BFA/);
    // And the board never clips it: no overflow on the section, only on its backdrop layer.
    const sectionTag = section.slice(0, section.indexOf(">"));
    assert.doesNotMatch(sectionTag, /overflow-(?:hidden|clip)/);
  });

  it("keeps every block inside the board card with nested corners", () => {
    const section = boardHtml(render(pageModel(snap({ "most-cards-added": rows(10) }))), "most-cards-added");
    const sectionClass = section.match(/class="([^"]*)"/)?.[1] ?? "";
    // 24px card corners, 12px padding, 12px block corners.
    assert.match(sectionClass, /\brounded-3xl\b/);
    assert.match(sectionClass, /\bp-3\b/);
    for (const place of items(listHtml(section, "data-podium") ?? "")) {
      const block = place.body.match(/class="(lb-banner [^"]*)"/)?.[1] ?? "";
      assert.match(block, /\brounded-xl\b/);
      assert.doesNotMatch(block, /rounded-t-|rounded-b-/, "all four corners are round: no square bottom to clip");
    }
  });

  it("keeps the post board's handle as the name and the card as the detail, without repeating the handle", () => {
    const section = boardHtml(
      render(pageModel(snap({ "top-card-post": [row("p1", 3, { userId: "ann", title: "Wemby Prizm", subtitle: "@ann" })] }))),
      "top-card-post",
    );
    const first = items(listHtml(section, "data-podium") ?? "")[0]!;
    assert.match(first.body, />ann</);
    assert.match(first.body, />Wemby Prizm</);
    assert.doesNotMatch(first.body, /@ann/);
  });
});
