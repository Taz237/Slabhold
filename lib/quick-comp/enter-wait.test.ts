import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import { createSuggestionTyping } from "./typing";

const wemby: CatalogCard = {
  id: "fixture-wemby",
  playerName: "Victor Wembanyama",
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  sport: "Basketball",
  parallel: "Base",
};

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(results: CatalogCard[] | null) {
  const typing = createSuggestionTyping({ search: async () => results, onChange: () => {}, debounceMs: 250 });
  const ran: CatalogCard[][] = [];
  return { typing, ran, run: (cards: CatalogCard[]) => ran.push(cards) };
}

async function settle() {
  mock.timers.tick(250);
  await flush();
  await flush();
}

describe("an Enter waiting on suggestions", () => {
  it("runs once when this text's suggestions land", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { typing, ran, run } = setup([wemby]);
      typing.type("wemby ");
      typing.whenReady("wemby", run);
      await settle();
      assert.deepEqual(ran, [[wemby]]);
      typing.type("wemby p");
      await settle();
      assert.equal(ran.length, 1);
    } finally {
      mock.timers.reset();
    }
  });

  it("is dropped by more typing, cancelEnter, a miss or trouble", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const typed = setup([wemby]);
      typed.typing.type("wemby");
      typed.typing.whenReady("wemby", typed.run);
      typed.typing.type("wemby prizm");
      await settle();
      assert.equal(typed.ran.length, 0);

      const blurred = setup([wemby]);
      blurred.typing.type("wemby");
      blurred.typing.whenReady("wemby", blurred.run);
      blurred.typing.cancelEnter();
      await settle();
      assert.equal(blurred.ran.length, 0);

      for (const results of [[], null]) {
        const s = setup(results);
        s.typing.type("zz fixture");
        s.typing.whenReady("zz fixture", s.run);
        await settle();
        assert.equal(s.ran.length, 0);
      }
    } finally {
      mock.timers.reset();
    }
  });
});
