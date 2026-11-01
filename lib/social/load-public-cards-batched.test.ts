import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicCardsForKeys, playerIlikeOr } from "@/lib/social/load-public-cards";

const OWNER = "11111111-1111-4111-8111-111111111111";

function row(id: string, player: string) {
  return {
    id,
    user_id: OWNER,
    player,
    year: 2023,
    brand: "Prizm",
    card_number: "1",
    sport: "Football",
    accent: "#7c5cff",
    created_at: "2026-10-30T00:00:00.000Z",
  };
}

type Call = { table: string; ops: [string, unknown[]][] };

/** Records each query's builder calls. Answers `or` reads by matching the quoted names. */
function fakeClient(rows: ReturnType<typeof row>[], error: { message: string } | null = null) {
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
              return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
                const or = call.ops.find(([name]) => name === "or")?.[1][0];
                const data =
                  typeof or === "string"
                    ? rows.filter((item) => or.includes(`player.ilike."${item.player.toLowerCase()}"`))
                    : [];
                return Promise.resolve({ data: error ? null : data, error }).then(resolve, reject);
              };
            }
            return (...args: unknown[]) => {
              call.ops.push([String(key), args]);
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

const names = (count: number) => Array.from({ length: count }, (_, index) => `player ${index}`);
const orCalls = (calls: Call[]) => calls.filter((call) => call.ops.some(([name]) => name === "or"));

describe("public card reads by player", () => {
  it("reads 8 players in one query, next to the id and owner reads", async () => {
    const { supabase, calls } = fakeClient([]);
    await loadPublicCardsForKeys(supabase, ["id:a", `owner:${OWNER}`, ...names(8).map((name) => `player:${name}`)]);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.table === "public_cards"));
    const [read] = orCalls(calls);
    assert.ok(read);
    const filter = read.ops.find(([name]) => name === "or")?.[1][0] as string;
    assert.equal(filter.match(/player\.ilike\."/g)?.length, 8);
    assert.deepEqual(read.ops.find(([name]) => name === "limit")?.[1], [1000]);
    assert.ok(!read.ops.some(([name]) => name === "ilike"));
  });

  it("splits 9 players into 2 reads", async () => {
    const { supabase, calls } = fakeClient([]);
    await loadPublicCardsForKeys(supabase, names(9).map((name) => `player:${name}`));
    assert.equal(calls.length, 2);
    assert.equal(orCalls(calls).length, 2);
  });

  it("quotes and escapes each name", () => {
    assert.equal(
      playerIlikeOr(["c.j. stroud", "shaquille o'neal", 'ja "the" morant', "50%_off\\"]),
      'player.ilike."c.j. stroud",player.ilike."shaquille o\'neal",player.ilike."ja \\"the\\" morant",player.ilike."50\\\\%\\\\_off\\\\\\\\"',
    );
  });

  it("maps rows for every player in the read", async () => {
    const { supabase } = fakeClient([row("a", "C.J. Stroud"), row("b", "Jalen Brunson"), row("c", "Someone Else")]);
    const cards = await loadPublicCardsForKeys(supabase, ["player:c.j. stroud", "player:jalen brunson"]);
    assert.deepEqual(cards.map((card) => [card.id, card.playerName]), [
      ["a", "C.J. Stroud"],
      ["b", "Jalen Brunson"],
    ]);
  });

  it("still rejects when the read fails", async () => {
    const { supabase } = fakeClient([], { message: "offline" });
    await assert.rejects(loadPublicCardsForKeys(supabase, ["player:c.j. stroud"]), /offline/);
  });
});
