import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { droppedProfileKeys, keepLoadedProfiles, profileKeys } from "./profile-cache";
import { createKeyBatcher } from "./public-card-cache";
import type { Profile } from "./types";

// Fixtures only: no real people.
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALICE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const POSTER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

describe("keepLoadedProfiles for the same viewer", () => {
  it("keeps the card owner when a signed-out snapshot doesn't name them", () => {
    const existing: State = { user: null, profiles: [person(OWNER, "owner")] };
    const next: State = { user: null, profiles: [person(POSTER, "poster")] };
    assert.deepEqual(names(keepLoadedProfiles(existing, next)), ["owner", "poster"]);
  });

  it("merges a newer snapshot for the same signed-in viewer, newer copy winning", () => {
    const alice = person(ALICE, "alice");
    const existing: State = { user: alice, profiles: [alice, person(OWNER, "owner-old"), person(BOB, "bob")] };
    const next: State = { user: alice, profiles: [alice, person(OWNER, "owner-new")] };
    const kept = keepLoadedProfiles(existing, next);
    assert.deepEqual(names(kept), ["alice", "bob", "owner-new"]);
    assert.equal(kept.user, alice);
  });
});

describe("keepLoadedProfiles when the viewer changes", () => {
  it("drops A's people when A signs out", () => {
    const alice = person(ALICE, "alice");
    const existing: State = { user: alice, profiles: [alice, person(BOB, "bob")] };
    const next: State = { user: null, profiles: [person(POSTER, "poster")] };
    assert.equal(keepLoadedProfiles(existing, next), next);
  });

  it("drops A's people when the account switches to B", () => {
    const alice = person(ALICE, "alice");
    const bob = person(BOB, "bob");
    const existing: State = { user: alice, profiles: [alice, person(OWNER, "owner")] };
    const next: State = { user: bob, profiles: [bob] };
    assert.equal(keepLoadedProfiles(existing, next), next);
  });

  it("starts from the snapshot alone when a signed-out viewer signs in", () => {
    const existing: State = { user: null, profiles: [person(OWNER, "owner")] };
    const alice = person(ALICE, "alice");
    const next: State = { user: alice, profiles: [alice] };
    assert.equal(keepLoadedProfiles(existing, next), next);
  });
});

describe("droppedProfileKeys", () => {
  it("names the id and handle keys of everyone the new list left out", () => {
    const before = [person(OWNER, "Owner"), person(POSTER, "poster")];
    const after = [person(POSTER, "poster")];
    assert.deepEqual(droppedProfileKeys(before, after), profileKeys({ ids: [OWNER], usernames: ["Owner"] }));
    assert.deepEqual(droppedProfileKeys(before, before), []);
  });
});

describe("signed-out public card page: owner read, then the snapshot", () => {
  function setup() {
    let state: State = { user: null, profiles: [] };
    const settled = new Set<string>();
    const reads: string[][] = [];
    const batcher = createKeyBatcher<Profile>(
      async (keys) => {
        reads.push([...keys]);
        return [person(OWNER, "owner")];
      },
      (people, keys) => {
        const byId = new Map(state.profiles.map((profile) => [profile.id, profile]));
        for (const profile of people) byId.set(profile.id, profile);
        state = { ...state, profiles: [...byId.values()] };
        keys.forEach((key) => settled.add(key));
      },
      () => {},
    );
    return {
      batcher,
      settled,
      reads,
      get state() {
        return state;
      },
      set state(value: State) {
        state = value;
      },
    };
  }

  it("keeps the owner after a later signed-out snapshot that doesn't name them", async () => {
    const page = setup();
    const ownerKeys = profileKeys({ usernames: ["owner"] });
    page.batcher.request(ownerKeys);
    await tick();
    assert.ok(ownerKeys.every((key) => page.settled.has(key)));
    // The snapshot lands later and names only someone else.
    page.state = keepLoadedProfiles<State>(page.state, { user: null, profiles: [person(POSTER, "poster")] });
    assert.ok(page.state.profiles.some((profile) => profile.username === "owner"));
  });

  it("reads the owner again if a snapshot does drop them", async () => {
    const page = setup();
    const ownerKeys = profileKeys({ usernames: ["owner"] });
    page.batcher.request(ownerKeys);
    await tick();
    const before = page.state.profiles;
    // A replacement that leaves the owner out (the backstop case).
    page.state = { user: null, profiles: [person(POSTER, "poster")] };
    const dropped = droppedProfileKeys(before, page.state.profiles);
    page.batcher.forget(dropped);
    dropped.forEach((key) => page.settled.delete(key));
    assert.ok(!ownerKeys.every((key) => page.settled.has(key)), "not ready with nobody there");
    page.batcher.request(ownerKeys);
    await tick();
    assert.deepEqual(page.reads, [["user:owner"], ["user:owner"]]);
    assert.ok(page.state.profiles.some((profile) => profile.username === "owner"));
    assert.ok(ownerKeys.every((key) => page.settled.has(key)));
  });

  it("forget leaves keys on the way alone, so one read is never doubled", async () => {
    const page = setup();
    page.batcher.request(["user:owner"]);
    page.batcher.forget(["user:owner"]);
    page.batcher.request(["user:owner"]);
    await tick();
    assert.deepEqual(page.reads, [["user:owner"]]);
  });
});

describe("social provider wiring", () => {
  const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");

  it("forgets dropped people in the batcher and the read list, and asks screens again", () => {
    const at = provider.indexOf("const forgetPeople = useCallback(");
    assert.ok(at > -1, "forgetPeople");
    const body = provider.slice(at, provider.indexOf("\n  const ", at + 10));
    assert.match(body, /profileBatcher\.forget\(keys\);/);
    assert.match(body, /setProfileSettled\(\(current\) => withoutKeys\(current, keys\)\);/);
    assert.match(body, /setPeopleGeneration\(/);
    assert.match(provider, /droppedProfileKeys\(/);
  });
});
