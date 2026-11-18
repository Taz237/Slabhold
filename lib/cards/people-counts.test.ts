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
