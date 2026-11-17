import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addTaste,
  loadSeen,
  loadSpot,
  loadTaste,
  saveSeen,
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
const forYou: FeedFilters = { tab: "for-you", sport: null };

describe("feed spot", () => {
  it("brings Back to the same card in the same tab and sport", () => {
    const store = memory();
    saveSpot(store, forYou, { cards: cards(5), nextOffset: 12, index: 3 }, 1000);
    const spot = loadSpot(store, forYou, 2000);
    assert.equal(spot?.index, 3);
    assert.equal(spot?.cards[3].id, "c3");
    assert.equal(spot?.nextOffset, 12);
    assert.equal(loadSpot(store, { tab: "following", sport: null }, 2000), null);
    assert.equal(loadSpot(store, { tab: "for-you", sport: "football" }, 2000), null);
  });

  it("starts fresh after half an hour", () => {
    const store = memory();
    saveSpot(store, forYou, { cards: cards(2), nextOffset: null, index: 1 }, 0);
    assert.equal(loadSpot(store, forYou, SPOT_MAX_AGE_MS + 1), null);
  });

  it("keeps a window around the card on screen in a long session", () => {
    const store = memory();
    saveSpot(store, forYou, { cards: cards(300), nextOffset: 300, index: 250 }, 0);
    const spot = loadSpot(store, forYou, 1)!;
    assert.equal(spot.cards.length, 120);
    assert.equal(spot.cards[spot.index].id, "c250");
  });

  it("never throws when storage is blocked", () => {
    saveSpot(broken, forYou, { cards: cards(2), nextOffset: null, index: 0 });
    assert.equal(loadSpot(broken, forYou), null);
    assert.equal(loadSeen(broken).size, 0);
    assert.deepEqual(addTaste(broken, { sport: "football", player: "A" }), [{ sport: "football", player: "A" }]);
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
