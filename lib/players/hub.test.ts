import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  dedupeSoldPrices,
  postMentionsPlayer,
  RECENT_SOLD_PRICES_LABEL,
  selectOfferOwners,
  selectPlayerCards,
  selectPlayerPosts,
  textMentionsPlayer,
  type HubCardInput,
  type HubPostInput,
  type HubProfileInput,
} from "./hub";

const PLAYER = { name: "C.J. Stroud", sport: "Football" };
const WILL_BASEBALL = { name: "Will Smith", sport: "Baseball" };

const ADA: HubProfileInput = { id: "ada", username: "ada", displayName: "Ada" };
const TEST: HubProfileInput = { id: "qa", username: "qa_alpha", displayName: "QA" };
const FLAGGED: HubProfileInput = { id: "flag", username: "realcollector", displayName: "Flagged", isTest: true };

function card(partial: Partial<HubCardInput> & Pick<HubCardInput, "id" | "ownerId">): HubCardInput {
  return {
    playerName: "C.J. Stroud",
    sport: "Football",
    yearLabel: "2023",
    setName: "Prizm",
    grade: "PSA 10",
    parallel: "Base",
    imageUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-10-01T00:00:00.000Z",
    openToOffers: false,
    isPublic: true,
    ...partial,
  };
}

describe("player hub mentions", () => {
  it("matches dotted and joined names in post text", () => {
    assert.equal(textMentionsPlayer("Pulled a C.J. Stroud Prizm", "C.J. Stroud"), true);
    assert.equal(textMentionsPlayer("CJ Stroud to the moon", "C.J. Stroud"), true);
    assert.equal(textMentionsPlayer("just stroud", "C.J. Stroud"), false);
    assert.equal(textMentionsPlayer("Will Smith homered", "Will Smith"), true);
  });

  it("keeps a hockey card off the baseball page", () => {
    const post: HubPostInput = {
      id: "p1",
      authorId: "ada",
      body: "new card",
      createdAt: "2026-10-02T00:00:00.000Z",
      attached: { playerName: "Will Smith", sport: "Hockey" },
      metaCards: [],
    };
    assert.equal(postMentionsPlayer(post, WILL_BASEBALL), false);
    assert.equal(
      postMentionsPlayer({ ...post, body: "Will Smith rookie" }, WILL_BASEBALL),
      true,
    );
  });
});

describe("player hub dedupe", () => {
  it("drops private cards, test accounts, and duplicate rows", () => {
    const cards = [
      card({ id: "pub", ownerId: "ada", createdAt: "2026-10-02T00:00:00.000Z" }),
      card({ id: "pub", ownerId: "ada", createdAt: "2026-10-03T00:00:00.000Z", setName: "Duplicate" }),
      card({ id: "secret", ownerId: "ada", isPublic: false }),
      card({ id: "qa-card", ownerId: "qa" }),
      card({ id: "flag-card", ownerId: "flag" }),
      card({ id: "hockey", ownerId: "ada", playerName: "Will Smith", sport: "Hockey" }),
      card({ id: "older", ownerId: "ada", createdAt: "2026-09-01T00:00:00.000Z", setName: "Select" }),
    ];
    const shown = selectPlayerCards(cards, PLAYER, [ADA, TEST, FLAGGED]);
    assert.deepEqual(
      shown.map((row) => row.id),
      ["pub", "older"],
    );
    assert.equal(shown[0]?.href, "/u/ada/cards/pub");
    assert.equal(shown.some((row) => row.id === "secret"), false);
  });

  it("lists each open-to-offers owner once and hides the section when the flag is absent", () => {
    const open = [
      card({ id: "a", ownerId: "ada", openToOffers: true }),
      card({ id: "b", ownerId: "ada", openToOffers: true, createdAt: "2026-10-04T00:00:00.000Z" }),
      card({ id: "c", ownerId: "qa", openToOffers: true }),
      card({ id: "d", ownerId: "flag", openToOffers: true }),
      card({ id: "e", ownerId: "ada", isPublic: false, openToOffers: true }),
    ];
    const owners = selectOfferOwners(open, PLAYER, [ADA, TEST, FLAGGED]);
    assert.deepEqual(owners?.map((owner) => owner.username), ["ada"]);

    const missing = selectOfferOwners(
      [card({ id: "a", ownerId: "ada", openToOffers: null })],
      PLAYER,
      [ADA],
    );
    assert.equal(missing, null);

    const none = selectOfferOwners([card({ id: "a", ownerId: "ada", openToOffers: false })], PLAYER, [ADA]);
    assert.deepEqual(none, []);
  });

  it("dedupes sold prices and never labels them as a marketplace", () => {
    const sales = dedupeSoldPrices([
      { priceCents: 1250, soldAt: "2026-10-02", grade: "PSA 10" },
      { priceCents: 1250, soldAt: "2026-10-02T18:00:00.000Z", grade: "psa 10" },
      { priceCents: 900, soldAt: "2026-10-01", grade: "Raw" },
      { priceCents: 0, soldAt: "2026-10-03", grade: "PSA 9" },
    ]);
    assert.deepEqual(
      sales.map((sale) => sale.priceLabel),
      ["$12.50", "$9.00"],
    );
    assert.equal(sales[0]?.soldLabel, "Oct 2, 2026");
    assert.equal(JSON.stringify(sales).includes("eBay"), false);
    assert.equal(RECENT_SOLD_PRICES_LABEL, "Recent sold prices");
    assert.equal(RECENT_SOLD_PRICES_LABEL.toLowerCase().includes("ebay"), false);
  });

  it("drops posts from test accounts and duplicate ids", () => {
    const posts: HubPostInput[] = [
      {
        id: "new",
        authorId: "ada",
        body: "C.J. Stroud",
        createdAt: "2026-10-03T00:00:00.000Z",
        attached: null,
        metaCards: [],
      },
      {
        id: "new",
        authorId: "ada",
        body: "C.J. Stroud again",
        createdAt: "2026-10-04T00:00:00.000Z",
        attached: null,
        metaCards: [],
      },
      {
        id: "qa",
        authorId: "qa",
        body: "CJ Stroud",
        createdAt: "2026-10-05T00:00:00.000Z",
        attached: null,
        metaCards: [],
      },
      {
        id: "other",
        authorId: "ada",
        body: "different player",
        createdAt: "2026-10-01T00:00:00.000Z",
        attached: null,
        metaCards: [],
      },
    ];
    const shown = selectPlayerPosts(posts, PLAYER, [ADA, TEST]);
    assert.deepEqual(
      shown.map((post) => post.id),
      ["new"],
    );
    assert.equal(shown[0]?.href, "/posts/new");
  });
});

describe("player page reads", () => {
  it("uses the public comps path and does not read private cards with a service role", () => {
    const root = process.cwd();
    const load = readFileSync(join(root, "lib/players/load-hub.ts"), "utf8");
    const page = readFileSync(join(root, "components/player-hub.tsx"), "utf8");
    const og = readFileSync(join(root, "app/p/[player]/opengraph-image.tsx"), "utf8");
    assert.match(load, /getPublicCardComps/);
    assert.match(load, /from\("public_cards"\)/);
    assert.doesNotMatch(load, /createSupabaseAdmin|service_role|SUPABASE_SERVICE/);
    assert.doesNotMatch(load, /\.from\("cards"\)/);
    assert.match(page, /RECENT_SOLD_PRICES_LABEL/);
    assert.doesNotMatch(page, /eBay|ebay/);
    assert.doesNotMatch(load, /eBay|ebay/);
    assert.match(og, /renderOg\(/);
    assert.doesNotMatch(og, /logo|team/i);
  });
});
