import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECENT_PLAYERS_KEY,
  collectionPlayers,
  readRecentPlayers,
  rememberRecentPlayer,
  searchAddPlayers,
} from "@/lib/cards/add-flow-players";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

describe("player search", () => {
  it("finds directory players for 'wemb' and 'neto' with sport and team", () => {
    const wemb = searchAddPlayers("wemb", INDEXED_DIRECTORY);
    assert.equal(wemb[0]?.name, "Victor Wembanyama");
    assert.equal(wemb[0]?.sport, "Basketball");
    assert.equal(wemb[0]?.team, "San Antonio Spurs");
    assert.equal(wemb[0]?.custom, undefined);
    const neto = searchAddPlayers("neto", INDEXED_DIRECTORY);
    assert.ok(neto.some((hit) => hit.name === "Zach Neto" && hit.sport === "Baseball"));
  });

  it("offers a typed name when nothing matches, and nothing for a blank query", () => {
    const typed = searchAddPlayers("Zzyzx Qwerty", INDEXED_DIRECTORY);
    assert.equal(typed.length, 1);
    assert.equal(typed[0].custom, true);
    assert.equal(typed[0].name, "Zzyzx Qwerty");
    assert.deepEqual(searchAddPlayers("   ", INDEXED_DIRECTORY), []);
  });

  it("stays fast on the full roster", () => {
    const started = performance.now();
    for (const query of ["w", "we", "wem", "wemb", "jal", "jalen", "neto", "mah"]) {
      searchAddPlayers(query, INDEXED_DIRECTORY);
    }
    const perQuery = (performance.now() - started) / 8;
    assert.ok(perQuery < 50, `${perQuery.toFixed(1)}ms per query`);
  });
});

describe("recent players", () => {
  it("keeps the last 5 unique names, newest first, names only", () => {
    const storage = memoryStorage();
    for (const name of ["A One", "B Two", "C Three", "a one", "D Four", "E Five", "F Six"]) {
      rememberRecentPlayer(storage, name);
    }
    assert.deepEqual(readRecentPlayers(storage), ["F Six", "E Five", "D Four", "a one", "C Three"]);
    const stored = JSON.parse(storage.getItem(RECENT_PLAYERS_KEY) ?? "null");
    assert.ok(Array.isArray(stored));
    assert.ok(stored.every((item: unknown) => typeof item === "string"));
  });

  it("survives bad or missing storage", () => {
    const storage = memoryStorage();
    storage.setItem(RECENT_PLAYERS_KEY, "{not json");
    assert.deepEqual(readRecentPlayers(storage), []);
    storage.setItem(RECENT_PLAYERS_KEY, JSON.stringify([1, "Ok Name", null, ""]));
    assert.deepEqual(readRecentPlayers(storage), ["Ok Name"]);
    assert.deepEqual(readRecentPlayers(null), []);
    assert.doesNotThrow(() => rememberRecentPlayer(null, "X"));
    const throwing = {
      ...memoryStorage(),
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    } as Storage;
    assert.deepEqual(readRecentPlayers(throwing), []);
    assert.doesNotThrow(() => rememberRecentPlayer(throwing, "X"));
  });
});

describe("in your collection", () => {
  it("lists distinct players from your cards, newest first, max 8", () => {
    const cards = [
      { playerName: "Old Guy", createdAt: "2024-01-01T00:00:00Z" },
      { playerName: "Victor Wembanyama", createdAt: "2026-05-01T00:00:00Z" },
      { playerName: "victor wembanyama ", createdAt: "2026-04-01T00:00:00Z" },
      { playerName: "Zach Neto", createdAt: "2026-06-01T00:00:00Z" },
      { playerName: "", createdAt: "2026-07-01T00:00:00Z" },
      ...Array.from({ length: 10 }, (_, index) => ({
        playerName: `Player ${index}`,
        createdAt: `2025-0${(index % 9) + 1}-01T00:00:00Z`,
      })),
    ];
    const names = collectionPlayers(cards);
    assert.equal(names.length, 8);
    assert.deepEqual(names.slice(0, 2), ["Zach Neto", "Victor Wembanyama"]);
    assert.equal(names.includes("Old Guy"), false);
    assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length);
  });
});
