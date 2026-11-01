import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boardHtml, items, listHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";

const PLACE_TAG = { 1: ">1ST<", 2: ">2ND<", 3: ">3RD<" } as const;

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
      assert.match(place.body, /\btruncate\b/);
      if (rank === 1) assert.match(place.body, /data-crown=""/);
      else assert.doesNotMatch(place.body, /data-crown/);
    }
    assert.match(places[0]!.body, /width:56px;height:56px/);
    assert.match(places[1]!.body, /width:44px;height:44px/);
    assert.match(places[2]!.body, /width:44px;height:44px/);
    assert.match(places[0]!.body, /h-\[88px\]/);
    assert.match(places[1]!.body, /h-\[68px\]/);
    assert.match(places[2]!.body, /h-\[56px\]/);
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
      assert.match(item.body, /min-h-12/);
      assert.match(item.body, /width:32px;height:32px/);
      assert.match(item.tag, /animation-delay:/);
      assert.doesNotMatch(item.body, /lb-banner|data-crown|>1ST<|>2ND<|>3RD</);
    }
    assert.match(slim[0]!.body, /Name u3/);
    assert.match(slim[0]!.body, /@u3/);
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

  it("marks the viewer's podium place with data-viewer-row and the You tag", () => {
    const section = boardHtml(
      render(pageModel(snap({ "most-cards-added": [row("a", 5), row("me", 4), row("c", 1)] }), "me")),
      "most-cards-added",
    );
    const places = items(listHtml(section, "data-podium") ?? "");
    assert.match(places[1]!.tag, /data-viewer-row=""/);
    assert.match(places[1]!.body, />You</);
    assert.match(places[1]!.body, /box-shadow:0 0 0 2px #09090b/);
    assert.doesNotMatch(places[0]!.tag, /data-viewer-row/);
  });

  it("keeps the post board's handle as the name and the card as the detail", () => {
    const section = boardHtml(
      render(pageModel(snap({ "top-card-post": [row("p1", 3, { userId: "ann", title: "Wemby Prizm", subtitle: "@ann" })] }))),
      "top-card-post",
    );
    const first = items(listHtml(section, "data-podium") ?? "")[0]!;
    assert.match(first.body, />ann</);
    assert.match(first.body, /@ann · Wemby Prizm/);
  });
});
