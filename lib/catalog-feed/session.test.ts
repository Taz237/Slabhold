import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addTaste,
  loadSeen,
  loadSpot,
  loadTaste,
  saveSeen,
  saveCards,
  saveSpot,
  SPOT_MAX_AGE_MS,
} from "./session";
import type { FeedCard, FeedFilters } from "./feed";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {},
};

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }) as FeedCard);
const ids = (list: FeedCard[]) => list.map((card) => card.id);
const forYou: FeedFilters = { tab: "for-you", sport: null };

describe("feed spot", () => {
  it("brings Back to the same card in the same tab and sport", () => {
    const store = memory();
    saveCards(store, cards(5));
    saveSpot(store, forYou, { ids: ids(cards(5)), nextOffset: 12, index: 3 }, 1000);
    const spot = loadSpot(store, forYou, 2000);
    assert.equal(spot?.index, 3);
    assert.equal(spot?.cards[3].id, "c3");
    assert.equal(spot?.nextOffset, 12);
    assert.equal(loadSpot(store, { tab: "following", sport: null }, 2000), null);
    assert.equal(loadSpot(store, { tab: "for-you", sport: "football" }, 2000), null);
  });

  it("starts fresh after half an hour", () => {
    const store = memory();
    saveCards(store, cards(2));
    saveSpot(store, forYou, { ids: ids(cards(2)), nextOffset: null, index: 1 }, 0);
    assert.equal(loadSpot(store, forYou, SPOT_MAX_AGE_MS + 1), null);
  });

  it("keeps a window around the card on screen in a long session", () => {
    const store = memory();
    saveCards(store, cards(300));
    saveSpot(store, forYou, { ids: ids(cards(300)), nextOffset: 300, index: 250 }, 0);
    const spot = loadSpot(store, forYou, 1)!;
    assert.equal(spot.cards.length, 120);
    assert.equal(spot.cards[spot.index].id, "c250");
  });

  it("never throws when storage is blocked", () => {
    saveCards(broken, cards(2));
    saveSpot(broken, forYou, { ids: ids(cards(2)), nextOffset: null, index: 0 });
    assert.equal(loadSpot(broken, forYou), null);
    assert.equal(loadSeen(broken).size, 0);
    assert.deepEqual(addTaste(broken, { sport: "football", player: "A" }), [{ sport: "football", player: "A" }]);
  });
});

describe("what the spot writes", () => {
  it("writes only card ids where you are, and each card once, so a swipe stays a tiny write", () => {
    const store = memory();
    const list = cards(3).map((card) => ({ ...card, player: "A long player name", setName: "Prizm" }) as FeedCard);
    saveCards(store, list);
    saveSpot(store, forYou, { ids: ids(list), nextOffset: 12, index: 1 }, 0);
    const spot = JSON.parse(store.getItem("slabhold:catalog-feed:v2:for-you:all")!);
    assert.deepEqual(spot.ids, ["c0", "c1", "c2"]);
    assert.equal("cards" in spot, false);
    assert.doesNotMatch(JSON.stringify(spot), /player/);
    // Another tab shares the same cards.
    saveSpot(store, { tab: "following", sport: null }, { ids: ["c2"], nextOffset: null, index: 0 }, 0);
    assert.equal(loadSpot(store, { tab: "following", sport: null }, 1)?.cards[0].player, "A long player name");
  });

  it("lands on the same card when an older card fell out of the saved cards", () => {
    const store = memory();
    saveCards(store, cards(4).slice(1));
    saveSpot(store, forYou, { ids: ids(cards(4)), nextOffset: null, index: 2 }, 0);
    const spot = loadSpot(store, forYou, 1)!;
    assert.equal(spot.cards[spot.index].id, "c2");
  });

  it("forgets the spot when none of its cards were kept", () => {
    const store = memory();
    saveSpot(store, forYou, { ids: ["gone"], nextOffset: null, index: 0 }, 0);
    assert.equal(loadSpot(store, forYou, 1), null);
  });
});

describe("seen and taste", () => {
  it("remember what was shown and hearted players", () => {
    const store = memory();
    saveSeen(store, new Set(["a", "b"]));
    assert.deepEqual([...loadSeen(store)], ["a", "b"]);
    addTaste(store, { sport: "baseball", player: "Shohei Ohtani" });
    assert.deepEqual(loadTaste(store), [{ sport: "baseball", player: "Shohei Ohtani" }]);
  });
});
