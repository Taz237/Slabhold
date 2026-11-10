import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { leadBoardFirst, openSpotsRow } from "@/lib/leaderboard/present";
import {
  LEADERBOARD_DESCRIPTION,
  OPEN_SPOT_LABEL,
  openSpotsLabel,
  RULES_LINE,
  RULES_SHEET_LABEL,
} from "@/lib/leaderboard/rules";
import { boardHtml, pageModel, render, rows, snap } from "@/lib/test/leaderboard-view";
import { isReviewAccount, isTestAccount } from "@/lib/test-accounts";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Source without comments, so only copy and code are checked. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("web fixes 2: no free copy", () => {
  for (const file of [
    "components/landing-page.tsx",
    "components/landing/feature-panels.tsx",
    "components/public-card-comps.tsx",
  ]) {
    it(`${file} never says free`, () => {
      assert.doesNotMatch(withoutComments(read(file)), /\bfree\b/i);
    });
  }

  it("uses the new landing, panel and public card copy", () => {
    const landing = read("components/landing-page.tsx");
    assert.match(landing, /Recent sold prices for any card\. Then track your cards and share them with collectors who get it\./);
    assert.match(landing, />Join Slabhold</);
    assert.match(read("components/landing/feature-panels.tsx"), /line: "Recent sold prices, the median and the range\." \}/);
    const comps = read("components/public-card-comps.tsx");
    assert.match(comps, /Create an account to see full history and charts/);
    assert.doesNotMatch(comps, /alerts/i, "signed-in users don't get value alerts yet");
  });
});

describe("web fixes 2: review account", () => {
  it("is left off Moving today without becoming a test account", () => {
    assert.equal(isReviewAccount("slabhold_review"), true);
    assert.equal(isReviewAccount("@Slabhold_Review"), true);
    assert.equal(isReviewAccount("slabhold"), false);
    // Not a test account, so signup follow, suggestions and the board SQL mirror stay as they were.
    assert.equal(isTestAccount("slabhold_review"), false);
  });
});

describe("web fixes 2: livelier leaderboards", () => {
  it("draws an empty board this week as one open-spots row with the join step", () => {
    const model = pageModel(snap({}));
    const cards = model.boards.find((board) => board.id === "most-cards-added");
    assert.deepEqual(cards?.openRow, {
      count: 3,
      title: "3 open spots. Add a card to join.",
      ctaLabel: "Add a card",
      ctaHref: "/cards/new",
    });
    const section = boardHtml(render(model), "most-cards-added");
    assert.equal((section.match(/data-open-spots="3"/g) ?? []).length, 1);
    assert.match(section, /aria-label="3 open spots\. Add a card to join\."/);
    assert.match(section, /href="\/cards\/new"/);
    assert.doesNotMatch(section, new RegExp(`>${OPEN_SPOT_LABEL}<`), "no column of Open spot rows");
    assert.match(section, />3 open spots</);
    assert.match(section, />Add a card to join</, "short label, no trailing period");
  });

  it("keeps the podium once anyone is on the board, and on last week", () => {
    const one = pageModel(snap({ "most-cards-added": rows(1) }));
    assert.equal(one.boards.find((board) => board.id === "most-cards-added")?.openRow, null);
    const last = pageModel(snap({}), null, "previous");
    for (const board of last.boards) assert.equal(board.openRow, null);
    assert.equal(openSpotsRow([], 0, "most-cards-added"), null);
  });

  it("words the row per board", () => {
    assert.equal(openSpotsLabel(3, "most-cards-added"), "3 open spots. Add a card to join.");
    assert.equal(openSpotsLabel(1, "top-card-post"), "1 open spot. Post a card to join.");
    assert.equal(openSpotsLabel(2, "rising-collectors"), "2 open spots. Find collectors to follow.");
  });

  it("leads with the board that has the most people when the first board is empty", () => {
    const model = pageModel(snap({ "rising-collectors": rows(2), "top-card-post": rows(5) }));
    assert.deepEqual(
      model.boards.map((board) => board.id),
      ["top-card-post", "most-cards-added", "rising-collectors"],
    );
    const markup = render(model);
    assert.ok(markup.indexOf('data-board="top-card-post"') < markup.indexOf('data-board="most-cards-added"'));
  });

  it("keeps today's order when the first board has people, on a tie, and on last week", () => {
    const order = (model: ReturnType<typeof pageModel>) => model.boards.map((board) => board.id);
    const today = ["most-cards-added", "rising-collectors", "top-card-post"];
    assert.deepEqual(order(pageModel(snap({ "most-cards-added": rows(1), "top-card-post": rows(8) }))), today);
    assert.deepEqual(order(pageModel(snap({}))), today);
    assert.deepEqual(
      order(pageModel(snap({ "rising-collectors": rows(2), "top-card-post": rows(2) }))),
      ["rising-collectors", "most-cards-added", "top-card-post"],
    );
    assert.deepEqual(order(pageModel(snap({}, { "top-card-post": rows(3) }), null, "previous")), today);
    assert.deepEqual(leadBoardFirst([], "current").boards, []);
  });

  it("shows one short lead line and moves the rest into How the boards work", () => {
    const markup = render(pageModel(snap({})));
    const header = markup.slice(0, markup.indexOf("<details"));
    const sheet = markup.slice(markup.indexOf("<details"), markup.indexOf("</details>"));
    assert.match(header, new RegExp(RULES_LINE));
    const description = LEADERBOARD_DESCRIPTION.replace(/[.]/g, "\\.").replace(/'/g, "(?:'|&#x27;)");
    assert.doesNotMatch(header, new RegExp(description));
    assert.match(sheet, new RegExp(description));
    assert.match(sheet, new RegExp(`aria-label="${RULES_SHEET_LABEL}"`));
    assert.match(sheet, new RegExp(`>${RULES_SHEET_LABEL}<`), "the sheet's name is visible, not only an icon");
  });
});
