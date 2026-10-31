import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FOLLOW_PAGE_SIZE,
  followCountWithViewer,
  keepLoadedProfiles,
  loadFollowCounts,
  loadFollowPage,
  profileKeys,
} from "./profile-cache";
import type { Profile } from "./types";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const ADA = "22222222-2222-4222-8222-222222222222";
const BEA = "33333333-3333-4333-8333-333333333333";

type Call = { table: string; ops: string[] };

function fakeClient(answer: (call: Call) => { data?: unknown; count?: number }) {
  const calls: Call[] = [];
  const rpcs: string[] = [];
  const supabase = {
    rpc(fn: string) {
      rpcs.push(fn);
      return Promise.resolve({ data: [], error: null });
    },
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then") {
              return (resolve: (value: unknown) => unknown) => {
                const result = answer(call);
                return Promise.resolve({ data: result.data ?? [], count: result.count ?? null, error: null }).then(resolve);
              };
            }
            return (...args: unknown[]) => {
              call.ops.push(`${String(key)}:${args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(":")}`);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls, rpcs };
}

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

function profileRow(id: string, username: string) {
  return { id, username, display_name: username, bio: "", avatar_url: null, cover_url: null, accent: null, created_at: "2025-01-01T00:00:00.000Z" };
}

describe("profile cache", () => {
  it("keys people by id and by lowercase handle", () => {
    assert.deepEqual(profileKeys({ ids: [BEA, ADA, ADA, null], usernames: [" Ada ", "ada", "@bea"] }), [
      `id:${ADA}`,
      `id:${BEA}`,
      "user:ada",
      "user:bea",
    ]);
  });

  it("keeps people already loaded for the same viewer through a full reload", () => {
    const existing = { user: person(VIEWER, "me"), profiles: [person(VIEWER, "me"), person(ADA, "ada-old")] };
    const next = { user: person(VIEWER, "me"), profiles: [person(VIEWER, "me"), person(BEA, "bea")] };
    assert.deepEqual(keepLoadedProfiles(existing, next).profiles.map((profile) => profile.username).sort(), [
      "ada-old",
      "bea",
      "me",
    ]);
    // The reload's copy wins for someone in both.
    const renamed = { ...next, profiles: [person(ADA, "ada-new")] };
    assert.equal(keepLoadedProfiles(existing, renamed).profiles.find((profile) => profile.id === ADA)?.username, "ada-new");
    // Another viewer starts from the reload alone.
    const other = { user: person(ADA, "ada"), profiles: [person(ADA, "ada")] };
    assert.equal(keepLoadedProfiles(existing, other), other);
  });
});

describe("follow counts and lists", () => {
  it("counts followers and following with two head reads", async () => {
    const { supabase, calls } = fakeClient((call) => ({
      count: call.ops.some((op) => op.startsWith("eq:following_id")) ? 12 : 3,
    }));
    assert.deepEqual(await loadFollowCounts(supabase, ADA), { followers: 12, following: 3 });
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.table, "follows");
      assert.ok(call.ops.some((op) => op.includes('"head":true')), call.ops.join("|"));
    }
  });

  it("moves a count by the viewer's own follow since it was read", () => {
    // Read 12 while the viewer didn't follow; they follow now: 13.
    assert.equal(followCountWithViewer(12, { followedAtRead: false, followsNow: true }), 13);
    assert.equal(followCountWithViewer(12, { followedAtRead: true, followsNow: false }), 11);
    assert.equal(followCountWithViewer(12, { followedAtRead: true, followsNow: true }), 12);
    assert.equal(followCountWithViewer(0, { followedAtRead: true, followsNow: false }), 0);
  });

  it("pages one person's followers, newest first, with their profiles", async () => {
    const edges = Array.from({ length: FOLLOW_PAGE_SIZE + 1 }, (_, index) => ({
      follower_id: index === 0 ? BEA : `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
      following_id: ADA,
      created_at: `2026-10-${String(30 - (index % 28)).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const { supabase, calls, rpcs } = fakeClient((call) =>
      call.table === "follows" ? { data: edges } : { data: [profileRow(BEA, "bea")] },
    );
    const page = await loadFollowPage(supabase, { userId: ADA, kind: "followers", cursor: null, viewer: null });
    assert.deepEqual(page.profiles.map((profile) => profile.username), ["bea"]);
    assert.ok(page.next);
    const follows = calls.find((call) => call.table === "follows");
    assert.ok(follows?.ops.includes(`eq:following_id:${ADA}`));
    assert.ok(follows?.ops.some((op) => op === `limit:${FOLLOW_PAGE_SIZE + 1}`));
    const profiles = calls.find((call) => call.table === "profiles");
    assert.ok(profiles?.ops.some((op) => op.startsWith("in:id:") && op.includes(BEA)));
    // No viewer, nothing hidden to look up.
    assert.deepEqual(rpcs, []);
  });

  it("reads who someone follows by follower_id", async () => {
    const { supabase, calls } = fakeClient(() => ({ data: [] }));
    const page = await loadFollowPage(supabase, { userId: ADA, kind: "following", cursor: null, viewer: { id: VIEWER, email: "" } });
    assert.deepEqual(page, { profiles: [], next: null });
    assert.ok(calls[0].ops.includes(`eq:follower_id:${ADA}`));
  });
});
