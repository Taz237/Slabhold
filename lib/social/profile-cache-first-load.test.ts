import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { droppedProfileKeys, keepLoadedProfiles, profileKeys } from "./profile-cache";
import { createKeyBatcher } from "./public-card-cache";
import type { Profile } from "./types";

/*
 * Signed-in first load. The first snapshot the provider shows is the signed-out
 * one (user: null), and the viewer-reads effect skips its reset the first time
 * it sees a viewer id (viewerReadsRef starts undefined). So when the first
 * signed-in snapshot lands, nothing resets people: the forgetPeople(dropped)
 * backstop is what keeps someone settled under null from reading as "ready"
 * with no profile.
 */

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function firstLoad() {
  let state: State = { user: null, profiles: [] };
  const settled = new Set<string>();
  const reads: string[][] = [];
  const forgotten: string[][] = [];
  let resets = 0;
  const db = new Map([[OWNER, person(OWNER, "slabfan")]]);
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
  // The viewer-reads effect. It waits for `ready`, which a signed-in first load
  // only reaches with the first full snapshot, and the first id it sees is only recorded.
  let viewerReads: string | null | undefined = undefined;
  const viewerEffect = () => {
    const id = state.user?.id ?? null;
    if (viewerReads === id) return;
    const before = viewerReads;
    viewerReads = id;
    if (before !== undefined) {
      resets += 1;
      batcher.reset();
      settled.clear();
    }
  };
  // What refreshRemote does when a snapshot lands.
  const land = (next: State) => {
    const before = state.profiles;
    state = keepLoadedProfiles(state, next);
    const dropped = droppedProfileKeys(before, state.profiles);
    forgotten.push(dropped);
    batcher.forget(dropped);
    dropped.forEach((key) => settled.delete(key));
    viewerEffect();
  };
  const ownerKeys = profileKeys({ ids: [OWNER], usernames: ["slabfan"] });
  const ready = () => ownerKeys.every((key) => settled.has(key));
  const owner = () => state.profiles.find((profile) => profile.id === OWNER);
  return { batcher, land, ownerKeys, ready, owner, reads, forgotten, resets: () => resets };
}

describe("signed-in first load: a person settled under the null snapshot", () => {
  it("is forgotten when the first signed-in snapshot drops them, so the screen asks again", async () => {
    const view = firstLoad();
    view.batcher.request(view.ownerKeys);
    await tick();
    assert.ok(view.ready());
    assert.equal(view.owner()?.username, "slabfan");

    // The first real snapshot: signed in, and it doesn't name the owner.
    view.land({ user: person(VIEWER, "collector"), profiles: [person(VIEWER, "collector")] });
    assert.equal(view.resets(), 0, "the first viewer id doesn't reset people");
    assert.deepEqual(view.forgotten.at(-1), view.ownerKeys, "the owner's id and handle keys are dropped");
    assert.equal(view.owner(), undefined);
    assert.equal(view.ready(), false, "not ready with nobody: no 'Profile not found'");

    view.batcher.request(view.ownerKeys);
    await tick();
    assert.deepEqual(view.reads, [view.ownerKeys, view.ownerKeys], "read again");
    assert.ok(view.ready());
    assert.equal(view.owner()?.username, "slabfan");
  });

  it("a later viewer change resets as usual", () => {
    const view = firstLoad();
    view.land({ user: person(VIEWER, "collector"), profiles: [] });
    view.land({ user: null, profiles: [] });
    assert.equal(view.resets(), 1);
  });
});

describe("social-provider keeps that wiring", () => {
  const src = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");

  it("skips the reset the first time it sees a viewer id", () => {
    assert.match(src, /const viewerReadsRef = useRef<string \| null \| undefined>\(undefined\);/);
    assert.match(src, /if \(!ready\) return;\s*const before = viewerReadsRef\.current;/);
    assert.match(src, /if \(before !== undefined\) resetViewerReads\(\);/);
  });

  it("forgets the people a snapshot dropped", () => {
    assert.match(src, /droppedProfileKeys\(/);
    assert.match(src, /forgetPeopleRef\.current\(/);
    assert.match(src, /forgetPeopleRef\.current = forgetPeople;/);
  });
});
