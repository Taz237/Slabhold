import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendFeed,
  doubleTapHeart,
  EMPTY_TASTE,
  feedCardFromRow,
  feedCardLabel,
  feedCount,
  feedEmptyText,
  feedGlow,
  feedKey,
  feedPills,
  feedSearch,
  feedSetLine,
  feedWindow,
  heartTap,
  mixFeed,
  parseFeedFilters,
  prefetchUrls,
  spreadOwners,
  tasteFrom,
  type FeedCard,
} from "./feed";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function card(n: number, partial: Partial<FeedCard> = {}): FeedCard {
  return {
    id: id(n),
    href: `/u/ada/cards/${id(n)}`,
    player: `Player ${n}`,
    yearLabel: "2023-24",
    setName: "Prizm",
    cardNumber: "",
    parallel: "",
    serialRun: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    grade: "",
    grader: "",
    gradeValue: "",
    imageUrl: `https://img.test/${n}.jpg`,
    accent: "#7c5cff",
    sport: "basketball",
    priceLabel: "",
    createdAt: `2026-11-${String(10 + (n % 10)).padStart(2, "0")}T00:00:00Z`,
    owner: { id: id(900 + n), username: `owner${n}`, displayName: `Owner ${n}`, avatarUrl: null },
    likeCount: 0,
    commentCount: 0,
    postId: null,
    source: "fresh",
    ...partial,
  };
}

const owner = { id: id(901), username: "ada", displayName: "Ada", avatarUrl: null };

describe("feed card from a public row", () => {
  it("keeps public fields, the number, parallel and print run, and links to the owner's card page", () => {
    const made = feedCardFromRow(
      {
        id: id(1),
        player: "Victor Wembanyama",
        year_label: "2023-24",
        set_name: "Prizm",
        card_number: "#136",
        parallel: "silver",
        serial_run: 25,
        is_rookie: true,
        is_auto: true,
        condition_type: "graded",
        grader: "PSA",
        grade: "10",
        estimated_value: 420,
        sport: "Basketball",
        created_at: "2026-11-01T00:00:00Z",
        price_cents: 99999,
      },
      owner,
      { likeCount: 12, commentCount: 3, postId: id(50), source: "popular" },
    );
    assert.ok(made);
    assert.equal(made.href, `/u/ada/cards/${id(1)}`);
    assert.equal(made.cardNumber, "136");
    assert.equal(made.serialRun, 25);
    assert.equal(made.sport, "basketball");
    assert.equal(made.priceLabel, "$420.00");
    assert.equal(made.likeCount, 12);
    assert.equal(made.postId, id(50));
    assert.equal(feedSetLine(made), "2023-24 Prizm #136");
    assert.deepEqual(
      feedPills(made).map((pill) => pill.label),
      ["RC", "PSA 10", "/25", "Auto", "Silver"],
    );
    assert.match(feedCardLabel(made), /^Victor Wembanyama, 2023-24 Prizm #136, RC, PSA 10, \/25, Auto, Silver, by @ada$/);
    // Price paid never rides along.
    assert.doesNotMatch(JSON.stringify(made), /99999/);
  });

  it("drops a card with no owner handle, and hides the number when the card has none", () => {
    assert.equal(feedCardFromRow({ id: id(1) }, null), null);
    const made = feedCardFromRow({ id: id(2), card_number: "12", no_number: true }, owner);
    assert.equal(made?.cardNumber, "");
  });

  it("shows no grade pill on a raw card and no Base parallel", () => {
    assert.deepEqual(feedPills(card(1, { grade: "9", parallel: "Base" })), []);
  });
});

describe("feed filters", () => {
  it("parse and print For You / Following and a sport, leaving out defaults", () => {
    assert.deepEqual(parseFeedFilters({ tab: "following", sport: "Football" }), { tab: "following", sport: "football" });
    assert.deepEqual(parseFeedFilters({ tab: "nope", sport: "pokemon" }), { tab: "for-you", sport: null });
    assert.equal(feedSearch({ tab: "for-you", sport: null }), "");
    assert.equal(feedSearch({ tab: "following", sport: "baseball" }, 12), "?tab=following&sport=baseball&offset=12");
    assert.equal(feedKey({ tab: "for-you", sport: null }), "for-you:all");
  });
});

describe("For You mix", () => {
  it("never repeats a card, in a page or across the session", () => {
    const cards = [card(1), card(2), card(1), card(3)];
    const mixed = mixFeed(cards, EMPTY_TASTE, new Set([id(3)]));
    assert.deepEqual(mixed.map((c) => c.id).sort(), [id(1), id(2)]);
    const appended = appendFeed(mixed, [card(2), card(3), card(4)], new Set([id(3)]));
    assert.deepEqual(appended.map((c) => c.id).sort(), [id(1), id(2), id(4)]);
  });

  it("takes turns between followed, the viewer's taste, popular and fresh", () => {
    const followed = card(1, { owner: { ...owner, id: id(800) } });
    const mine = card(2, { player: "Shohei Ohtani", sport: "baseball" });
    const popular = card(3, { source: "popular", likeCount: 40 });
    const fresh = [card(4), card(5), card(6)];
    const taste = tasteFrom({
      owned: [{ sport: "baseball", playerName: "Shohei Ohtani" }],
      liked: [],
      following: [id(800)],
      viewerId: null,
    });
    const mixed = mixFeed([...fresh, popular, mine, followed], taste, new Set());
    assert.deepEqual(mixed.slice(0, 4).map((c) => c.id), [followed.id, mine.id, popular.id, fresh[0].id]);
    assert.equal(mixed.length, 6);
  });

  it("puts the viewer's own cards after everyone else's", () => {
    const me = id(700);
    const mixed = mixFeed(
      [card(1, { source: "popular", owner: { ...owner, id: me } }), card(2, { source: "popular" })],
      tasteFrom({ owned: [], liked: [], following: [], viewerId: me }),
      new Set(),
    );
    assert.equal(mixed[0].id, id(2));
  });

  it("spreads one owner's cards out when another card can go between", () => {
    const a = { ...owner, id: id(1) };
    const b = { ...owner, id: id(2) };
    const spread = spreadOwners([card(1, { owner: a }), card(2, { owner: a }), card(3, { owner: b })]);
    assert.deepEqual(spread.map((c) => c.owner.id), [a.id, b.id, a.id]);
  });
});

describe("heart", () => {
  it("a tap toggles it; a double tap only likes", () => {
    assert.deepEqual(heartTap({ liked: false, count: 4 }), { liked: true, count: 5 });
    assert.deepEqual(heartTap({ liked: true, count: 0 }), { liked: false, count: 0 });
    assert.deepEqual(doubleTapHeart({ liked: true, count: 5 }), { liked: true, count: 5 });
    assert.deepEqual(doubleTapHeart({ liked: false, count: 5 }), { liked: true, count: 6 });
  });

  it("counts read short", () => {
    assert.equal(feedCount(0), "");
    assert.equal(feedCount(999), "999");
    assert.equal(feedCount(1250), "1.2K");
    assert.equal(feedCount(48200), "48K");
    assert.equal(feedCount(2_350_000), "2.3M");
  });
});

describe("swipe speed", () => {
  it("warms the next 3 photos and draws only the slides around the one on screen", () => {
    const cards = [card(1), card(2, { imageUrl: null }), card(3), card(4), card(5)];
    assert.deepEqual(prefetchUrls(cards, 0), ["https://img.test/3.jpg", "https://img.test/4.jpg"]);
    assert.deepEqual(feedWindow(0, 10), { start: 0, end: 3 });
    assert.deepEqual(feedWindow(6, 8), { start: 4, end: 7 });
  });

  it("glows in the card's color pulled toward brand purple, never a raw value from the row", () => {
    assert.equal(feedGlow("#2563eb"), "color-mix(in oklab, #2563eb 45%, #7C3AED)");
    assert.equal(feedGlow("red; background:url(x)"), "color-mix(in oklab, #7C3AED 45%, #7C3AED)");
  });
});

describe("empty feed", () => {
  it("says what to do next on each tab", () => {
    assert.equal(feedEmptyText({ tab: "for-you", sport: null }, false).title, "No public cards yet");
    assert.equal(feedEmptyText({ tab: "following", sport: null }, false).title, "See who you follow");
    assert.match(feedEmptyText({ tab: "following", sport: "football" }, true).title, /football/);
  });
});
