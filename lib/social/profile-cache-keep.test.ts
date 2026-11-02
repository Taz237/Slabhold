import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { droppedProfileKeys, keepLoadedProfiles, profileKeys } from "./profile-cache";
import { createKeyBatcher } from "./public-card-cache";
import type { Profile } from "./types";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALICE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FEED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function person(id: string, username: string): Profile {
  return {
    id,
    email: "",
    username,
    displayName: username,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

type State = { user: Profile | null; profiles: Profile[] };

const names = (state: State) => state.profiles.map((profile) => profile.username).sort();
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("keepLoadedProfiles keeps people for the same viewer", () => {
  it("signed out → signed out: a snapshot that doesn't name the owner keeps the owner", () => {
    const existing: State = { user: null, profiles: [person(OWNER, "owner")] };
    const next: State = { user: null, profiles: [person(FEED, "feed")] };
    assert.deepEqual(names(keepLoadedProfiles(existing, next)), ["feed", "owner"]);
  });

  it("signed in as A → signed out drops A's people", () => {
    const existing: State = { user: person(ALICE, "alice"), profiles: [person(ALICE, "alice"), person(OWNER, "owner")] };
    const next: State = { user: null, profiles: [person(FEED, "feed")] };
    assert.equal(keepLoadedProfiles(existing, next), next);
  });

  it("signed in as A → signed in as B drops A's people", () => {
    const existing: State = { user: person(ALICE, "alice"), profiles: [person(ALICE, "alice"), person(OWNER, "owner")] };
    const next: State = { user: person(BOB, "bob"), profiles: [person(BOB, "bob")] };
    assert.equal(keepLoadedProfiles(existing, next), next);
  });

  it("signed out → signed in starts from the new snapshot", () => {
    const existing: State = { user: null, profiles: [person(OWNER, "owner")] };
    const next: State = { user: person(ALICE, "alice"), profiles: [person(ALICE, "alice")] };
    assert.equal(keepLoadedProfiles(existing, next), next);
  });

  it("same signed-in viewer: a newer snapshot merges, newer copy wins", () => {
    const existing: State = {
      user: person(ALICE, "alice"),
      profiles: [person(ALICE, "alice"), person(OWNER, "owner-old"), person(BOB, "bob")],
    };
    const next: State = { user: person(ALICE, "alice"), profiles: [person(ALICE, "alice"), person(OWNER, "owner-new")] };
    const kept = keepLoadedProfiles(existing, next);
    assert.deepEqual(names(kept), ["alice", "bob", "owner-new"]);
  });

  it("same signed-out viewer: the newer copy wins for someone in both", () => {
    const existing: State = { user: null, profiles: [person(OWNER, "owner-old")] };
    const next: State = { user: null, profiles: [person(OWNER, "owner-new")] };
    assert.deepEqual(names(keepLoadedProfiles(existing, next)), ["owner-new"]);
  });
});

describe("droppedProfileKeys", () => {
  it("names the id and handle keys of people a new list no longer has", () => {
    const before = [person(OWNER, "Owner"), person(FEED, "feed")];
    const after = [person(FEED, "feed")];
    assert.deepEqual(droppedProfileKeys(before, after), profileKeys({ ids: [OWNER], usernames: ["Owner"] }));
    assert.deepEqual(droppedProfileKeys(before, before), []);
  });
});

describe("signed-out public card page ordering", () => {
  function page() {
    let state: State = { user: null, profiles: [] };
    const settled = new Set<string>();
    const reads: string[][] = [];
    const db = new Map([[OWNER, person(OWNER, "owner")]]);
    const batcher = createKeyBatcher<Profile>(
      async (keys) => {
        reads.push([...keys]);
        return keys.flatMap((key) => (key.startsWith("id:") && db.get(key.slice(3))) || []);
      },
      (people, keys) => {
        const byId = new Map(state.profiles.map((profile) => [profile.id, profile]));
        for (const profile of people) byId.set(profile.id, profile);
        state = { ...state, profiles: [...byId.values()] };
        keys.forEach((key) => settled.add(key));
      },
      () => {},
    );
    // What the provider does when a snapshot lands.
    const land = (next: State, merge: (existing: State, next: State) => State) => {
      const before = state.profiles;
      state = merge(state, next);
      const dropped = droppedProfileKeys(before, state.profiles);
      batcher.forget(dropped);
      dropped.forEach((key) => settled.delete(key));
    };
    const ownerKeys = profileKeys({ ids: [OWNER] });
    const ready = () => ownerKeys.every((key) => settled.has(key));
    const owner = () => state.profiles.find((profile) => profile.id === OWNER);
    return { batcher, land, ownerKeys, ready, owner, reads };
  }

  it("owner settles first, then a snapshot without the owner lands: the owner stays", async () => {
    const view = page();
    view.batcher.request(view.ownerKeys);
    await tick();
    assert.ok(view.ready());
    assert.ok(view.owner());
    view.land({ user: null, profiles: [person(FEED, "feed")] }, keepLoadedProfiles);
    assert.ok(view.ready());
    assert.equal(view.owner()?.username, "owner");
  });

  it("backstop: if a snapshot does drop the owner, the batcher reads them again", async () => {
    const view = page();
    view.batcher.request(view.ownerKeys);
    await tick();
    // A merge that replaces the list outright (the old behaviour).
    view.land({ user: null, profiles: [person(FEED, "feed")] }, (_existing, next) => next);
    assert.equal(view.owner(), undefined);
    assert.equal(view.ready(), false, "not ready with nobody: no 'Profile not found'");
    view.batcher.request(view.ownerKeys);
    await tick();
    assert.deepEqual(view.reads, [view.ownerKeys, view.ownerKeys]);
    assert.ok(view.ready());
    assert.equal(view.owner()?.username, "owner");
  });

  it("forget leaves keys still on the way alone", async () => {
    const reads: string[][] = [];
    const batcher = createKeyBatcher<string>(
      async (keys) => {
        reads.push([...keys]);
        return keys;
      },
      () => {},
      () => {},
    );
    batcher.request(["id:x"]);
    batcher.forget(["id:x"]);
    batcher.request(["id:x"]);
    await tick();
    assert.deepEqual(reads, [["id:x"]]);
  });
});
