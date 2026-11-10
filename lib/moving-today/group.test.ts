import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleMovingToday,
  groupSameCard,
  hiddenMovingOwner,
  sameCardKey,
  type ProfileRef,
  type PublicCardRef,
  type RawCompSale,
} from "./present";
import { addCalendarDays } from "./rank";

const TODAY = "2026-11-09";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const OWNERS: ProfileRef[] = [
  { id: id(901), username: "ada" },
  { id: id(902), username: "ben" },
  { id: id(903), username: "slabhold_review" },
  { id: id(904), username: "qa_dupes" },
  { id: id(905), username: "quietflag", isTest: true },
];

function card(n: number, owner: number, extra: Partial<PublicCardRef> = {}): PublicCardRef {
  return {
    id: id(n),
    userId: id(owner),
    player: "Demo Rookie",
    yearLabel: "2024",
    setName: "Absolute",
    grade: "PSA 10",
    grader: "PSA",
    parallel: null,
    imageUrl: null,
    accent: "#7c5cff",
    createdAt: `2026-11-0${(n % 8) + 1}T12:00:00Z`,
    ...extra,
  };
}

/** One window sale at `price` plus three earlier comps at $500, so the row is a mover. */
function salesFor(n: number, key: string, price: number, earlier = 3): { sales: RawCompSale[]; history: RawCompSale[] } {
  const sales = [{ queryKey: key, cardId: id(n), itemId: `${key}-today-${n}`, price, soldAt: `${TODAY}T00:00:00Z` }];
  const history = Array.from({ length: earlier }, (_, k) => ({
    queryKey: key,
    cardId: id(n),
    itemId: `${key}-prior-${n}-${k}`,
    price: 500,
    soldAt: `${addCalendarDays(TODAY, -(k + 2))}T00:00:00Z`,
  }));
  return { sales, history };
}

function assemble(cards: PublicCardRef[], groups: { sales: RawCompSale[]; history: RawCompSale[] }[]) {
  return assembleMovingToday({
    today: TODAY,
    sales: groups.flatMap((group) => group.sales),
    history: groups.flatMap((group) => group.history),
    cards,
    newest: cards,
    profiles: OWNERS,
    alternates: [],
    mode: "all-public",
  });
}

describe("Moving today: one row per card", () => {
  it("shows the same card from two owners once, keeping the best-backed row and its link", () => {
    const payload = assemble(
      [card(1, 901), card(2, 902, { player: " demo  rookie ", setName: "ABSOLUTE" })],
      [salesFor(1, "nabers-a", 590, 3), salesFor(2, "nabers-b", 590, 5)],
    );
    const rows = payload.sales.filter((sale) => /demo\s+rookie/i.test(sale.player));
    assert.equal(rows.length, 1, JSON.stringify(payload.sales.map((sale) => sale.href)));
    assert.equal(rows[0].cardId, id(2), "more sales behind it");
    assert.equal(rows[0].href, `/u/ben/cards/${id(2)}`);
    assert.equal(rows[0].priceLabel, "$590.00");
    assert.equal(payload.totalCount, 1);
  });

  it("keeps a different grade as its own row", () => {
    const payload = assemble(
      [card(1, 901), card(2, 902, { grade: "PSA 9" })],
      [salesFor(1, "nabers-10", 590), salesFor(2, "nabers-9", 300)],
    );
    assert.equal(payload.sales.length, 2);
    assert.deepEqual(new Set(payload.sales.map((sale) => sale.cardId)), new Set([id(1), id(2)]));
  });

  it("keeps a different parallel as its own row", () => {
    const payload = assemble(
      [card(1, 901), card(2, 902, { parallel: "Spectrum" })],
      [salesFor(1, "base", 590), salesFor(2, "spectrum", 900)],
    );
    assert.equal(payload.sales.length, 2);
  });

  it("drops a plain card tile that is the same card as a mover", () => {
    const payload = assemble([card(1, 901), card(2, 902)], [salesFor(1, "nabers", 590)]);
    assert.equal(payload.sales.length, 1);
    assert.equal(payload.sales[0].kind, "mover");
    assert.equal(payload.sales[0].cardId, id(1));
  });
});

describe("Moving today: no test or review accounts", () => {
  it("drops cards and sales from slabhold_review, qa_ handles and is_test profiles", () => {
    const payload = assemble(
      [
        card(1, 903, { player: "Review Card" }),
        card(2, 904, { player: "Qa Card" }),
        card(3, 905, { player: "Flagged Card" }),
        card(4, 901, { player: "Real Card" }),
      ],
      [salesFor(1, "review", 590), salesFor(2, "qa", 400), salesFor(3, "flagged", 700), salesFor(4, "real", 650)],
    );
    assert.deepEqual(
      payload.sales.map((sale) => sale.player),
      ["Real Card"],
    );
    assert.ok(payload.sales.every((sale) => sale.href.startsWith("/u/ada/")));
  });

  it("shows the real owner's copy when the review account holds the same card", () => {
    const payload = assemble([card(1, 903), card(2, 901)], [salesFor(1, "nabers-a", 590, 6), salesFor(2, "nabers-b", 590)]);
    assert.equal(payload.sales.length, 1);
    assert.equal(payload.sales[0].href, `/u/ada/cards/${id(2)}`);
  });

  it("hides only test and review owners", () => {
    assert.equal(hiddenMovingOwner({ username: "slabhold_review" }), true);
    assert.equal(hiddenMovingOwner({ username: "@Slabhold_Review" }), true);
    assert.equal(hiddenMovingOwner({ username: "qa_anything" }), true);
    assert.equal(hiddenMovingOwner({ username: "ada", isTest: true }), true);
    assert.equal(hiddenMovingOwner({ username: "ada" }), false);
    assert.equal(hiddenMovingOwner({ username: "slabhold" }), false);
  });
});

describe("groupSameCard", () => {
  const meta = (row: { identity: string | null; keys: string[]; sales: number; newest: string; priority?: number }) => ({
    identity: row.identity,
    queryKeys: row.keys,
    priority: row.priority ?? 0,
    sales: row.sales,
    newest: row.newest,
  });

  it("joins rows on a shared query key, prefers more sales, then newer", () => {
    const rows = [
      { name: "a", identity: "x", keys: ["k1"], sales: 2, newest: "2026-11-01" },
      { name: "b", identity: "y", keys: ["k1"], sales: 2, newest: "2026-11-05" },
      { name: "c", identity: "z", keys: ["k2"], sales: 9, newest: "2026-10-01" },
    ];
    assert.deepEqual(groupSameCard(rows, meta).map((row) => row.name), ["b", "c"]);
  });

  it("never joins two rows with no identity and no key", () => {
    const rows = [
      { name: "a", identity: null, keys: [], sales: 1, newest: "" },
      { name: "b", identity: null, keys: [], sales: 1, newest: "" },
    ];
    assert.equal(groupSameCard(rows, meta).length, 2);
  });

  it("normalizes the card key and skips cards with no player", () => {
    const base = { player: "Demo Rookie", yearLabel: "2024", setName: "Absolute", grade: "PSA 10", parallel: null };
    assert.equal(sameCardKey(base), sameCardKey({ ...base, player: "  DEMO   rookie", setName: "absolute" }));
    assert.notEqual(sameCardKey(base), sameCardKey({ ...base, grade: "PSA 9" }));
    assert.notEqual(sameCardKey(base), sameCardKey({ ...base, parallel: "Spectrum" }));
    assert.equal(sameCardKey({ ...base, player: "Card" }), null);
    assert.equal(sameCardKey({ ...base, player: "" }), null);
  });
});
