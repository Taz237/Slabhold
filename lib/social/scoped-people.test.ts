import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadVisibleProfiles, peopleIlikeOr, searchPeople } from "./remote";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const BLOCKED = "22222222-2222-4222-8222-222222222222";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

type Call = { table: string; ops: string[] };

function fakeClient(viewer: string | null) {
  const calls: Call[] = [];
  const rpcs: string[] = [];
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: viewer ? { user: { id: viewer, email: "me@example.com" } } : null } }),
    },
    rpc(fn: string) {
      rpcs.push(fn);
      return Promise.resolve({ data: [BLOCKED], error: null });
    },
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then") {
              return (resolve: (value: unknown) => unknown) =>
                Promise.resolve({ data: [], error: null }).then(resolve);
            }
            return (...args: unknown[]) => {
              call.ops.push(`${String(key)}:${args.map((arg) => (Array.isArray(arg) ? arg.join(",") : String(arg))).join(":")}`);
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

describe("people, read for what a screen shows", () => {
  it("searches the longest word, keeps accents, and can't add filters", () => {
    assert.equal(peopleIlikeOr(["ja", "Dončić"]), "username.ilike.%Dončić%,display_name.ilike.%Dončić%");
    assert.equal(peopleIlikeOr(["@ada"]), "username.ilike.%ada%,display_name.ilike.%ada%");
    // Commas, parentheses and dots are dropped, so the text stays one filter value.
    assert.equal(peopleIlikeOr(["a,b)or(id.eq.1"]), "username.ilike.%aborideq1%,display_name.ilike.%aborideq1%");
    assert.equal(peopleIlikeOr(["50%_off"]), "username.ilike.%50\\%\\_off%,display_name.ilike.%50\\%\\_off%");
    assert.equal(peopleIlikeOr(["", "  "]), null);
  });

  it("searches people on the server, limited, with blocked people left out", async () => {
    const { supabase, calls, rpcs } = fakeClient(VIEWER);
    await searchPeople(supabase, ["victor"]);
    assert.equal(calls.length, 1);
    const ops = calls[0].ops.join("|");
    assert.equal(calls[0].table, "profiles");
    assert.match(ops, /or:username\.ilike\.%victor%,display_name\.ilike\.%victor%/);
    assert.match(ops, /limit:40/);
    assert.match(ops, new RegExp(BLOCKED));
    assert.deepEqual(rpcs, ["hidden_author_ids"]);
  });

  it("reads people by id or handle, in chunks, with the same block filter", async () => {
    const { supabase, calls } = fakeClient(VIEWER);
    const ids = Array.from({ length: 200 }, (_, index) => `id-${index}`);
    await loadVisibleProfiles(supabase, { ids, usernames: [" Ada ", "ada"] }, { id: VIEWER, email: "" }, [BLOCKED]);
    assert.equal(calls.length, 3);
    assert.ok(calls.some((call) => call.ops.some((op) => op === "in:username:ada")));
    for (const call of calls) assert.ok(call.ops.join("|").includes(BLOCKED), call.ops.join("|"));
    const empty = fakeClient(null);
    assert.deepEqual(await loadVisibleProfiles(empty.supabase, {}, null, []), []);
    assert.equal(empty.calls.length, 0);
  });

  it("never reads the whole profiles table or everyone's follows in the snapshot", () => {
    const remote = read("lib/social/remote.ts");
    const start = remote.indexOf("export async function loadSocialSnapshot");
    const loader = remote.slice(start, remote.indexOf("\nexport ", start + 10));
    // The only profiles read left is by id (block and mute list accounts); never the whole table.
    assert.doesNotMatch(loader, /from\("profiles"\)\.select<string, ProfileRow>\(columns\)\.order/);
    assert.match(loader, /from\("profiles"\)\.select<string, ProfileRow>\(columns\)\.in\("id", missingSafety\)/);
    assert.match(loader, /loadVisibleProfiles\(/);
    assert.doesNotMatch(loader, /from\("follows"\)\.select\("\*"\),/);
    assert.match(loader, /or\(`follower_id\.eq\.\$\{viewerId\},following_id\.eq\.\$\{viewerId\}`\)/);
  });

  it("is wired into every screen that looked people up in the full list", () => {
    assert.match(read("components/search-view.tsx"), /usePeopleSearch\(mode === "supabase" \? typed : ""\)/);
    assert.match(read("components/new-message-sheet.tsx"), /usePeopleSearch\(mode === "supabase" \? query : ""\)/);
    const profile = read("components/profile-view.tsx");
    assert.match(profile, /useProfiles\(username && !profile \? \{ usernames: \[username\] \} : null\)/);
    assert.match(profile, /useFollowCounts\(profile\?\.id \?\? null\)/);
    assert.match(profile, /if \(!profile && !profileRead\.ready\) return <ProfileSkeleton \/>;/);
    const list = read("components/follow-list.tsx");
    assert.match(list, /useFollowPage\(!own && profile \? profile\.id : null, kind\)/);
    assert.match(list, /<LoadMore hasMore=\{paged\.hasMore\}/);
    assert.match(read("components/message-thread.tsx"), /useProfiles\(partner \? null : \{ usernames: \[username\] \}\)/);
    assert.match(read("components/public-card-view.tsx"), /\(!profile && !ownerRead\.ready\)/);
    // Anyone named by rows that arrive later (older pages, realtime) is read too.
    assert.match(read("components/social-provider.tsx"), /requestProfiles\(missingPeopleKey\.split/);
  });
});
