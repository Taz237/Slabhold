import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleCardPeople, type OwnerCandidate } from "./people";
import { peopleCounts } from "./people-counts";

/** Made-up collectors for one made-up card identity. */
const KEY = "victor wembanyama|2023-24|prizm|136|base|raw";

function owner(userId: string): OwnerCandidate {
  return {
    userId,
    activeAt: "2026-11-01T00:00:00Z",
    handle: userId,
    displayName: userId,
    avatarUrl: null,
    publiclyVisible: true,
    blocked: false,
    muted: false,
    followed: false,
    identityKey: KEY,
    cardPublic: true,
    collectionPublic: true,
  };
}

describe("peopleCounts", () => {
  it("counts other collectors, not the viewer", () => {
    const people = assembleCardPeople({
      identityKey: KEY,
      viewerId: "viewer",
      owners: [owner("viewer"), owner("ada"), owner("ben")],
      hunters: [],
      huntersReadable: true,
    });
    assert.equal(people.owners.count, 3, "the shared count still includes the viewer");
    assert.equal(people.owners.includesViewer, true);
    assert.deepEqual(peopleCounts(people), { owners: 2, hunters: 0 });
  });

  it("keeps hunters unknown when the viewer can't read want lists", () => {
    const people = assembleCardPeople({
      identityKey: KEY,
      viewerId: null,
      owners: [owner("ada")],
      hunters: [],
      huntersReadable: false,
    });
    assert.deepEqual(peopleCounts(people), { owners: 1, hunters: null });
  });

  it("is null without data", () => {
    assert.equal(peopleCounts(null), null);
  });
});

describe("respondPeopleCounts", () => {
  it("sends only the two counts, never names", async () => {
    const { respondPeopleCounts } = await import("./people-counts-respond");
    const people = assembleCardPeople({
      identityKey: KEY,
      viewerId: "viewer",
      owners: [owner("viewer"), owner("ada")],
      hunters: [],
      huntersReadable: true,
    });
    const response = await respondPeopleCounts(new Request("https://slabhold.test/api/cards/people/counts?id=card-1"), {
      access: async () => {},
      load: async () => people,
    });
    const body = await response.json();
    assert.deepEqual(body, { owners: 1, hunters: 0 });
    assert.equal(JSON.stringify(body).includes("ada"), false);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });

  it("checks access before loading and needs an id", async () => {
    const { respondPeopleCounts } = await import("./people-counts-respond");
    let loads = 0;
    const missing = await respondPeopleCounts(new Request("https://slabhold.test/api/cards/people/counts"), {
      access: async () => {},
      load: async () => (loads++, null),
    });
    assert.equal(missing.status, 400);
    await assert.rejects(
      respondPeopleCounts(new Request("https://slabhold.test/api/cards/people/counts?id=x"), {
        access: async () => {
          throw new Error("NEXT_NOT_FOUND");
        },
        load: async () => (loads++, null),
      }),
    );
    assert.equal(loads, 0);
  });
});
