import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownershipMatchKey } from "./card-identity";
import {
  isExcludedFromPublicOwners,
  OWNERS_PAGE_SIZE,
  publicOwnersForCard,
} from "./card-owners";
import type { Profile } from "./types";

const subject = {
  id: "card-subject",
  playerName: "Jaxson Dart",
  year: 2025,
  yearLabel: "2025",
  setBrand: "Panini Prizm",
  cardNumber: "332",
  parallel: "Base",
  grade: "Raw",
};

function profile(id: string, username: string): Profile {
  return {
    id,
    email: "",
    username,
    displayName: username,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("ownershipMatchKey", () => {
  it("matches across grades and keeps parallels distinct", () => {
    assert.equal(
      ownershipMatchKey({ ...subject, grade: "PSA 10" }),
      ownershipMatchKey({ ...subject, grade: "Raw", conditionType: "raw" }),
    );
    assert.notEqual(
      ownershipMatchKey({ ...subject, parallel: "Base" }),
      ownershipMatchKey({ ...subject, parallel: "Silver" }),
    );
  });
});

describe("publicOwnersForCard", () => {
  const profiles = new Map([
    ["u-a", profile("u-a", "alice")],
    ["u-b", profile("u-b", "bob")],
    ["u-c", profile("u-c", "cara")],
  ]);

  it("lists only public cards and skips private ones", () => {
    const cards = [
      {
        ...subject,
        id: "pub-a",
        ownerId: "u-a",
        isPublic: true,
        grade: "PSA 10",
      },
      {
        ...subject,
        id: "priv-b",
        ownerId: "u-b",
        isPublic: false,
        grade: "PSA 9",
      },
      {
        ...subject,
        id: "pub-c",
        ownerId: "u-c",
        isPublic: true,
        grade: "Raw",
      },
    ];

    const { owners, total } = publicOwnersForCard(subject, cards, profiles, {
      excludeCardId: "card-subject",
    });
    assert.equal(total, 2);
    assert.deepEqual(
      owners.map((row) => row.username).sort(),
      ["alice", "cara"],
    );
    assert.ok(owners.every((row) => row.username !== "bob"));
  });

  it("never treats want-list rows as owners", () => {
    assert.equal(isExcludedFromPublicOwners({ isPublic: true, fromWantList: true }), true);
    assert.equal(isExcludedFromPublicOwners({ isPublic: false }), true);
    assert.equal(isExcludedFromPublicOwners({ isPublic: true }), false);
  });

  it("caps at 12 and reports the full total for See all", () => {
    const cards = Array.from({ length: 15 }, (_, i) => {
      const id = `u-${i}`;
      profiles.set(id, profile(id, `user${i}`));
      return {
        ...subject,
        id: `card-${i}`,
        ownerId: id,
        isPublic: true,
        grade: i % 2 === 0 ? "Raw" : "PSA 10",
      };
    });
    const page = publicOwnersForCard(subject, cards, profiles);
    assert.equal(page.owners.length, OWNERS_PAGE_SIZE);
    assert.equal(page.total, 15);
    const all = publicOwnersForCard(subject, cards, profiles, { limit: 100 });
    assert.equal(all.owners.length, 15);
  });

  it("skips profiles without a username", () => {
    const orphan = profile("u-orphan", "");
    profiles.set("u-orphan", orphan);
    const { owners } = publicOwnersForCard(
      subject,
      [
        {
          ...subject,
          id: "c1",
          ownerId: "u-orphan",
          isPublic: true,
        },
      ],
      profiles,
    );
    assert.equal(owners.length, 0);
  });
});
