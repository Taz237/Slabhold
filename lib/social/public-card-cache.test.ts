import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cardsForKeys,
  createPublicCardBatcher,
  emptyPublicCardCache,
  failPublicCards,
  mergePublicCards,
  publicCardKeys,
  publicCardsFailed,
  publicCardsSettled,
  unsettledKeys,
} from "./public-card-cache";
import { loadPublicCardsForKeys } from "./load-public-cards";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function row(id: string, owner = OWNER, player = "Victor Wembanyama") {
  return {
    id,
    user_id: owner,
    player,
    year: 2023,
    year_label: "2023-24",
    set: "Panini Prizm",
    set_name: "Panini Prizm",
    grade: "Raw",
    grader: null,
    parallel: "Base",
    is_rookie: true,
    condition_type: "raw",
    estimated_value: 10,
    image_url: null,
    card_number: "136",
    sport: "Basketball",
    accent: "#7c5cff",
    created_at: "2026-10-30T00:00:00.000Z",
  };
}

type Call = { table: string; ops: string[] };

/** Records each query's filters and answers from the rows above. */
function fakeClient(rows: ReturnType<typeof row>[]) {
  const calls: Call[] = [];
  const supabase = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then") {
              return (resolve: (value: unknown) => unknown) => {
                const joined = call.ops.join("|");
                const data = rows.filter((item) => {
                  if (joined.includes("in:id")) return joined.includes(item.id);
                  if (joined.includes("eq:user_id")) return joined.includes(item.user_id);
                  if (joined.includes("ilike:player")) {
                    return joined.toLowerCase().includes(`ilike:player:${item.player.toLowerCase()}`);
                  }
                  return true;
                });
                return Promise.resolve({ data, error: null }).then(resolve);
              };
            }
            return (...args: unknown[]) => {
              call.ops.push(`${String(key)}:${args.map((arg) => (Array.isArray(arg) ? arg.join(",") : String(arg))).join(":")}`);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe("public card cache", () => {
  it("turns a request into stable keys and ignores blanks", () => {
    assert.deepEqual(
      publicCardKeys({ ids: ["b", "a", "a", "", null, undefined], ownerId: OWNER, players: [" Victor Wembanyama ", "victor wembanyama", ""] }),
      ["id:a", "id:b", `owner:${OWNER}`, "player:victor wembanyama"],
    );
    assert.deepEqual(publicCardKeys({}), []);
  });

  it("is settled once every key has loaded, and only asks for what is missing", () => {
    let cache = emptyPublicCardCache();
    const keys = publicCardKeys({ ids: ["a", "b"] });
    assert.equal(publicCardsSettled(cache, keys), false);
    assert.deepEqual(unsettledKeys(cache, keys, new Set(["id:b"])), ["id:a"]);
    cache = mergePublicCards(cache, [], ["id:a", "id:b"]);
    assert.equal(publicCardsSettled(cache, keys), true);
    assert.equal(publicCardsSettled(cache, []), true);
    assert.deepEqual(unsettledKeys(cache, keys, new Set()), []);
  });

  it("keeps cards by id, with the newest copy winning", () => {
    const first = loadedCard("a", 10);
    const second = loadedCard("a", 25);
    let cache = mergePublicCards(emptyPublicCardCache(), [first], ["id:a"]);
    cache = mergePublicCards(cache, [second, loadedCard("b", 5)], [`owner:${OWNER}`]);
    assert.deepEqual(
      cardsForKeys(cache).map((card) => [card.id, card.estimatedSellPrice]),
      [
        ["a", 25],
        ["b", 5],
      ],
    );
  });

  it("reads cards by id, by owner, and by player name, never the whole table", async () => {
    const { supabase, calls } = fakeClient([
      row("a"),
      row("b"),
      row("c", OTHER, "C.J. Stroud"),
      row("d", OTHER, "Victor Wembanyama"),
    ]);
    const cards = await loadPublicCardsForKeys(supabase, [
      "id:a",
      `owner:${OTHER}`,
      "player:victor wembanyama",
    ]);
    assert.deepEqual([...new Set(cards.map((card) => card.id))].sort(), ["a", "b", "c", "d"]);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.table, "public_cards");
      const joined = call.ops.join("|");
      assert.ok(/in:id|eq:user_id|ilike:player/.test(joined), joined);
      assert.match(joined, /limit:/);
    }
    const byPlayer = calls.find((call) => call.ops.join("|").includes("ilike:player"));
    assert.ok(byPlayer);
    // Exact name, case-insensitive: the same match search uses (trim + lowercase).
    assert.match(byPlayer.ops.join("|"), /ilike:player:victor wembanyama/);
  });

  it("escapes LIKE wildcards in player names", async () => {
    const { supabase, calls } = fakeClient([]);
    await loadPublicCardsForKeys(supabase, ["player:50%_off\\"]);
    assert.match(calls[0].ops.join("|"), /ilike:player:50\\%\\_off\\\\/);
  });

  it("splits long id lists and skips an empty request", async () => {
    const { supabase, calls } = fakeClient([]);
    const ids = Array.from({ length: 150 }, (_, index) => `id:card-${index}`);
    await loadPublicCardsForKeys(supabase, ids);
    assert.equal(calls.length, 2);
    const none = fakeClient([]);
    assert.deepEqual(await loadPublicCardsForKeys(none.supabase, []), []);
    assert.equal(none.calls.length, 0);
  });

  it("shares one read between asks in the same tick, and never asks twice", async () => {
    const reads: string[][] = [];
    const settledWith: string[][] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const batcher = createPublicCardBatcher(
      async (keys) => {
        reads.push([...keys]);
        await gate;
        return [];
      },
      (_cards, keys) => settledWith.push([...keys]),
      () => {},
    );
    batcher.request(["id:a"]);
    batcher.request(["id:a", "id:b"]);
    batcher.request([`owner:${OWNER}`]);
    await Promise.resolve();
    assert.deepEqual(reads, [["id:a", "id:b", `owner:${OWNER}`]]);
    // Still on the way: asking again does nothing.
    batcher.request(["id:b"]);
    await Promise.resolve();
    assert.equal(reads.length, 1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(settledWith, [["id:a", "id:b", `owner:${OWNER}`]]);
    // Done: asking again does nothing either.
    batcher.request(["id:a"]);
    await Promise.resolve();
    assert.equal(reads.length, 1);
  });

  it("keeps a failed read retryable: nothing settles, and the next ask reads again", async () => {
    const settledWith: string[][] = [];
    const failedWith: string[][] = [];
    let reads = 0;
    const batcher = createPublicCardBatcher(
      async () => {
        reads += 1;
        if (reads === 1) throw new Error("offline");
        return [];
      },
      (cards, keys) => settledWith.push([...keys, `cards:${cards.length}`]),
      (keys) => failedWith.push([...keys]),
    );
    batcher.request(["id:a"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(settledWith, []);
    assert.deepEqual(failedWith, [["id:a"]]);
    batcher.request(["id:a"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(reads, 2);
    assert.deepEqual(settledWith, [["id:a", "cards:0"]]);
  });

  it("marks failed keys as failed, not settled, until a read succeeds", () => {
    const failed = failPublicCards(emptyPublicCardCache(), ["id:a"]);
    assert.equal(publicCardsSettled(failed, ["id:a"]), false);
    assert.equal(publicCardsFailed(failed, ["id:a", "id:b"]), true);
    assert.equal(publicCardsFailed(failed, ["id:b"]), false);
    const read = mergePublicCards(failed, [], ["id:a"]);
    assert.equal(publicCardsSettled(read, ["id:a"]), true);
    assert.equal(publicCardsFailed(read, ["id:a"]), false);
  });

  it("forgets everything on reset, and drops reads that were on the way", async () => {
    const settledWith: string[][] = [];
    let release: (rows: never[]) => void = () => {};
    let reads = 0;
    const batcher = createPublicCardBatcher(
      () => {
        reads += 1;
        return reads === 1 ? new Promise<never[]>((resolve) => (release = resolve)) : Promise.resolve([]);
      },
      (_cards, keys) => settledWith.push([...keys]),
      () => {},
    );
    batcher.request(["id:a"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    batcher.reset();
    release([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The read from before the reset belongs to the old viewer: dropped.
    assert.deepEqual(settledWith, []);
    batcher.request(["id:a"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(reads, 2);
    assert.deepEqual(settledWith, [["id:a"]]);
    // A key that was done is read again after a reset.
    batcher.reset();
    batcher.request(["id:a"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(reads, 3);
  });

  it("clears the cache on refresh, account changes, and the viewer's own visibility changes", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(provider, /const resetPublicCards = useCallback\(/);
    assert.match(provider, /cardBatcher\.reset\(\);/);
    // Pull-to-refresh, sign-in, sign-up, sign-out, and a new viewer id.
    for (const name of ["refresh", "signUp", "signIn", "signOut"]) {
      const at = provider.indexOf(`const ${name} = useCallback(`);
      assert.ok(at > -1, name);
      const body = provider.slice(at, provider.indexOf("\n  const ", at + 10));
      assert.match(body, /resetPublicCards\(\)/, name);
    }
    assert.match(provider, /useEffect\(\(\) => \{\n\s+if \(cardViewerRef\.current === cardViewerId\) return;/);
    const collection = readFileSync(join(process.cwd(), "components/collection-provider.tsx"), "utf8");
    assert.match(collection, /resetPublicCards\(\)/);
  });

  it("is not read in full by the site snapshot any more", () => {
    const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    assert.doesNotMatch(remote, /from\("public_cards"\)\.select\("\*"\)(?!\.)/);
    assert.doesNotMatch(remote, /cardsRes/);
  });
});

function loadedCard(id: string, value: number) {
  return {
    ownerId: OWNER,
    id,
    playerName: "Victor Wembanyama",
    year: 2023,
    setBrand: "Panini Prizm",
    cardNumber: "136",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: value,
    grade: "Raw",
    parallel: "Base",
    isRookie: true,
    serialRun: null,
    yearLabel: "2023-24",
    purchasePrice: null,
    openToOffers: null,
  };
}
