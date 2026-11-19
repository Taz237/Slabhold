import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { landingPulls, type PullCardRow } from "@/lib/landing/pulls";
import { landingPullsWall } from "@/lib/landing/pulls-load";
import { PHOTOS } from "@/lib/test/landing-fixtures";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function card(id: string, userId: string, image: string | null = `${PHOTOS}/${userId}/${id}.jpg`): PullCardRow {
  return { id, user_id: userId, player: "Fixture Rookie", year: 2024, year_label: null, set: "Fixture Set", set_name: null, image_url: image };
}

const PROFILES = [
  { id: "u1", username: "Fixture_Puller" },
  { id: "u2", username: "second_puller" },
];

describe("landing pulls", () => {
  it("draws a listed pull only when the public card belongs to that handle and has our photo", () => {
    const pulls = landingPulls(
      [
        { handle: "fixture_puller", cardId: A },
        { handle: "second_puller", cardId: B },
      ],
      PROFILES,
      [card(A, "u1"), card(B, "u2")],
    );
    assert.deepEqual(pulls, [
      { cardId: A, handle: "Fixture_Puller", photoUrl: `${PHOTOS}/u1/${A}.jpg`, label: "Fixture Rookie, 2024 Fixture Set" },
      { cardId: B, handle: "second_puller", photoUrl: `${PHOTOS}/u2/${B}.jpg`, label: "Fixture Rookie, 2024 Fixture Set" },
    ]);
  });

  it("skips someone else's card, an unknown handle, a private card, an off-site photo and a repeat", () => {
    const refs = [
      { handle: "fixture_puller", cardId: B },
      { handle: "nobody", cardId: A },
      { handle: "second_puller", cardId: "33333333-3333-4333-8333-333333333333" },
      { handle: "fixture_puller", cardId: A },
      { handle: "fixture_puller", cardId: A },
    ];
    assert.deepEqual(
      landingPulls(refs, PROFILES, [card(A, "u1"), card(B, "u2")]).map((pull) => pull.cardId),
      [A],
    );
    assert.deepEqual(landingPulls(refs, PROFILES, [card(A, "u1", "https://evil.example/a.jpg")]), []);
    assert.deepEqual(landingPulls(refs, PROFILES, [card(A, "u1", null)]), []);
  });

  it("makes no read at all without pulls.json, and no wall when the read fails or finds nothing", async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return [];
    };
    assert.equal(await landingPullsWall(() => false, read), null);
    assert.equal(reads, 0);
    assert.equal(await landingPullsWall(() => true, read), null);
    assert.equal(reads, 1);
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(
        await landingPullsWall(() => true, async () => {
          throw new Error("down");
        }),
        null,
      );
    } finally {
      console.warn = warn;
    }
    const pull = { cardId: A, handle: "fixture_puller", photoUrl: `${PHOTOS}/u1/a.jpg`, label: "Fixture Rookie" };
    assert.deepEqual(await landingPullsWall(() => true, async () => [pull]), [pull]);
  });

  it("reads as a logged-out visitor through public_cards, cached for an hour, and never calls Trawl", () => {
    const source = readFileSync(join(process.cwd(), "lib/landing/pulls-load.ts"), "utf8");
    assert.match(source, /anonClient\(\)/);
    assert.match(source, /from\("public_cards"\)/);
    assert.match(source, /unstable_cache\(loadLandingPulls, \["landing-pulls"\], \{ revalidate: 3600 \}\)/);
    assert.doesNotMatch(source, /from\("cards"\)|lib\/comps|fetchTrawl|createSupabaseAdmin/);
    const select = readFileSync(join(process.cwd(), "lib/landing/pulls.ts"), "utf8").match(/PULL_CARD_SELECT =\s*"([^"]+)"/)?.[1] ?? "";
    assert.doesNotMatch(select, /estimated_value|paid|cert|notes|email/);
  });
});
