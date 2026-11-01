import "@/lib/test/image-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { boardHtml, items, listHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";
import { rankBoard } from "./present";
import { buildWeekBoards, type BoardCard, type BoardProfile, type ScoreInput } from "./score";
import { weekContaining } from "./week";

const ORIGIN = "https://proj.supabase.co";
const WEEK = weekContaining(new Date("2026-10-23T18:00:00.000Z"));
const OLD = "2026-09-01T00:00:00.000Z";
const BEFORE = "2026-10-10T16:00:00.000Z";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;
after(() => {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
});

function photo(userId: string, name: string): string {
  return `${ORIGIN}/storage/v1/object/public/card-photos/${userId}/${name}.jpg`;
}

function at(day: number, hour: number): string {
  return new Date(Date.UTC(2026, 9, day, hour)).toISOString();
}

function card(id: string, isPublic: boolean, createdAt: string, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    userId: "author",
    isPublic,
    player: `Player ${id}`,
    year: 2024,
    setName: "Prizm",
    parallel: "",
    imageUrl: photo("author", id),
    createdAt,
    hidden: false,
    deleted: false,
    ...extra,
  };
}

function profile(id: string): BoardProfile {
  return { id, username: id, displayName: id, createdAt: OLD, isTest: false, avatarUrl: null, accent: "#7c5cff" };
}

function input(cards: BoardCard[]): ScoreInput {
  return {
    profiles: [profile("author")],
    posts: [],
    cards,
    usersWithPost: ["author"],
    likes: [],
    replies: [],
    follows: [],
    blockPairs: [],
    now: new Date("2026-10-23T18:00:00.000Z"),
  };
}

function authorRow(cards: BoardCard[]) {
  const list = buildWeekBoards(input(cards), WEEK)["most-cards-added"]?.rows ?? [];
  return list.find((item) => item.userId === "author");
}

describe("cards-added photos", () => {
  it("keeps only public counted cards, newest first, and still counts private cards", () => {
    const author = authorRow([
      card("pub-a", true, at(20, 14)),
      card("priv-a", false, at(20, 15)),
      card("pub-b", true, at(21, 14)),
      card("priv-b", false, at(21, 15)),
      card("pub-c", true, at(22, 14)),
    ]);
    assert.ok(author);
    assert.equal(author.contributions[0]?.points, 5);
    assert.deepEqual(author.photos, [photo("author", "pub-c"), photo("author", "pub-b"), photo("author", "pub-a")]);
    const ranked = rankBoard([author], [], null, "cards", { boardId: "most-cards-added" });
    assert.deepEqual(ranked.entries[0]?.photos, author.photos);
  });

  it("keeps at most 4 photos and never a card that did not count", () => {
    const sameDay = Array.from({ length: 26 }, (_, index) =>
      card(`cap-${index}`, true, new Date(Date.UTC(2026, 9, 19, 14, index)).toISOString()),
    );
    const author = authorRow([
      ...sameDay,
      card("dup-photo", true, at(22, 16), { imageUrl: photo("author", "cap-0") }),
      card("old", true, BEFORE),
      card("hidden", true, at(22, 17), { hidden: true }),
      card("gone", true, at(22, 18), { deleted: true }),
    ]);
    assert.ok(author);
    assert.equal(author.contributions[0]?.points, 25);
    assert.deepEqual(author.photos, [
      photo("author", "cap-24"),
      photo("author", "cap-23"),
      photo("author", "cap-22"),
      photo("author", "cap-21"),
    ]);

    const six = authorRow(Array.from({ length: 6 }, (_, index) => card(`six-${index}`, true, at(20, 10 + index))));
    assert.equal(six?.photos?.length, 4);
    assert.deepEqual(six?.photos?.[0], photo("author", "six-5"));
  });

  it("gives the other boards no photos", () => {
    const boards = buildWeekBoards(input([card("pub", true, at(21, 14))]), WEEK);
    for (const item of [...(boards["top-card-post"]?.rows ?? []), ...(boards["rising-collectors"]?.rows ?? [])]) {
      assert.equal(item.photos, undefined);
    }
    assert.deepEqual(rankBoard([row("x", 1)], [], null, "cards").entries[0]?.photos, []);
  });

  it("draws a card-shaped strip on Most cards added only, with no private photos in the page", () => {
    const privateUrl = photo("author", "secret-private");
    const scored = authorRow([
      card("p1", true, at(20, 14)),
      card("p2", true, at(20, 15)),
      card("p3", true, at(20, 16)),
      card("p4", true, at(20, 17)),
      card("secret-private", false, at(20, 18)),
    ]);
    assert.ok(scored);
    const others = rows(5).map((item, index) => ({ ...item, photos: index === 3 ? [photo("u3", "slim")] : [] }));
    const withPhotos = { ...scored, contributions: [{ actorId: "fan", points: 99 }] };
    const markup = render(
      pageModel(
        snap({
          "most-cards-added": [withPhotos, ...others],
          "rising-collectors": [{ ...withPhotos }],
          "top-card-post": [{ ...withPhotos }],
        }),
      ),
    );
    assert.equal(markup.includes(privateUrl), false);
    assert.doesNotMatch(markup, /secret-private/);
    const cards = boardHtml(markup, "most-cards-added");
    const podium = items(listHtml(cards, "data-podium") ?? "");
    const strip = podium[0]!.body.slice(podium[0]!.body.indexOf("data-photo-strip"));
    assert.match(podium[0]!.body, /data-photo-strip=""[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-photo-strip=""/);
    assert.equal((strip.match(/<img /g) ?? []).length, 3);
    assert.match(strip, />\+1</);
    assert.match(strip, /width:22px;height:31px/);
    assert.match(strip, /rounded-\[3px\]/);
    assert.match(strip, /ring-1 ring-white\/10/);
    assert.match(strip, /loading="lazy"/);
    assert.match(strip, /alt=""/);
    assert.match(strip, /sizes="/);
    assert.doesNotMatch(strip, /<a /);
    assert.equal((podium[0]!.body.match(/<a /g) ?? []).length, 1, "the strip sits inside the place's one link");

    assert.doesNotMatch(podium[1]!.body, /data-photo-strip/, "no photos, no strip");
    const slim = items(listHtml(cards, "data-rank-rows") ?? "");
    const slimStrip = slim.find((item) => item.body.includes("data-photo-strip"));
    assert.ok(slimStrip, "a slim row with photos gets a strip");
    assert.match(slimStrip.body, /width:20px;height:28px/);
    assert.equal((slimStrip.body.match(/<img /g) ?? []).length, 1);

    assert.doesNotMatch(boardHtml(markup, "rising-collectors"), /data-photo-strip/);
    assert.doesNotMatch(boardHtml(markup, "top-card-post"), /data-photo-strip/);
  });

  it("adds no new read: the cards select list is unchanged", () => {
    const load = readFileSync(join(process.cwd(), "lib/leaderboard/load.ts"), "utf8");
    assert.match(load, /"id, user_id, player, year, set, parallel, image_url, is_public, created_at"/);
  });
});
