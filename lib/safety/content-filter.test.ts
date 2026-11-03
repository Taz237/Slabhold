import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localSendMessage, remoteSendMessage } from "../social/dm-actions";
import { localAddComment, localCreatePost, localUpdatePost, type LocalDb } from "../social/local-db";
import {
  remoteAddComment,
  remoteCreatePost,
  remoteSignUp,
  remoteUpdatePost,
  remoteUpdateProfile,
} from "../social/remote";
import { CONTENT_PROBLEM, contentProblem, usernameProblem } from "./content-filter";

describe("contentProblem", () => {
  it("uses the plain error copy", () => {
    assert.equal(CONTENT_PROBLEM, "This includes words Slabhold doesn't allow. Edit it and try again");
  });

  const blocked: [string, string][] = [
    ["racial slur", "pulled it, what a ch1nk move"],
    ["ethnic slur", "w3tb4ck"],
    ["ethnic slur, spaced", "nice sp1c"],
    ["homophobic slur", "f4gg0t"],
    ["transphobic slur", "lol tr4nny"],
    ["ableist slur", "you r3t4rd"],
    ["explicit sexual term", "free p0rn here"],
    ["explicit sexual term, symbols", "bl0wj0b"],
    ["ethnic slur, symbols", "$p1c"],
    ["threat", "just kys"],
    ["threat, stretched", "KYYYS"],
    ["threat, phrase", "kill y0urself"],
    ["threat, phrase with extra space", "hang   yourself"],
    ["diacritics", "pórn"],
    ["zero-width characters", "p​o‍rn"],
    ["stretched double letter", "fagggot"],
  ];
  for (const [label, text] of blocked) {
    it(`blocks a ${label}`, () => {
      assert.equal(contentProblem(text), CONTENT_PROBLEM);
    });
  }

  const allowed = [
    "auto",
    "patch",
    "hit",
    "rip",
    "blaster",
    "hobby box",
    "chase",
    "case break",
    "PC",
    "slab",
    "Cockrell",
    "Dickerson",
    "Scunthorpe",
    "Sussex",
    "assist",
    "Hancock",
    "Bass Pro",
    "shiitake",
    "Mike Hunt Jr.",
    "damn",
    "hell",
    "crap",
    "Huge hit from a hobby box, patch auto /25 and a 1/1 chase",
    "Grape soda and a therapist, then a case break",
    "",
  ];
  for (const text of allowed) {
    it(`allows ${JSON.stringify(text)}`, () => {
      assert.equal(contentProblem(text), null);
    });
  }
});

describe("usernameProblem", () => {
  it("matches inside a handle", () => {
    assert.equal(usernameProblem("xx_p0rnking"), CONTENT_PROBLEM);
    assert.equal(usernameProblem("killyourself99"), CONTENT_PROBLEM);
    assert.equal(usernameProblem("big_fag"), CONTENT_PROBLEM);
  });

  it("keeps whole-word entries whole inside a handle", () => {
    for (const name of ["hancock_pc", "scunthorpe", "grapes", "cockrell", "therapist", "mike_hunt"]) {
      assert.equal(usernameProblem(name), null, name);
    }
  });
});

function stringsIn(value: unknown, out: string[]) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) stringsIn(item, out);
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith(".json") ? [path] : [];
  });
}

describe("card and player names", () => {
  it("passes every name in lib/cards/data", () => {
    const names: string[] = [];
    for (const file of jsonFiles(join(process.cwd(), "lib/cards/data"))) {
      stringsIn(JSON.parse(readFileSync(file, "utf8")), names);
    }
    assert.ok(names.length > 0);
    const caught = names.filter((name) => contentProblem(name) !== null);
    assert.deepEqual(caught, []);
  });

  it("passes every player and team in the player directory, as text and as a handle", () => {
    const players = JSON.parse(
      readFileSync(join(process.cwd(), "lib/players/directory.json"), "utf8"),
    ) as { name: string; team?: string }[];
    assert.ok(players.length > 1000);
    const caught: string[] = [];
    for (const player of players) {
      if (contentProblem(player.name)) caught.push(player.name);
      if (player.team && contentProblem(player.team)) caught.push(player.team);
      const handle = player.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (usernameProblem(handle)) caught.push(`@${handle}`);
    }
    assert.deepEqual(caught, []);
  });
});

/** Records every client call. A blocked write must make none. */
function recordingClient() {
  const calls: string[] = [];
  const record = (name: string) => () => {
    calls.push(name);
    throw new Error(`unexpected ${name}`);
  };
  const supabase = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      throw new Error(`unexpected from(${table})`);
    },
    rpc: record("rpc"),
    storage: { from: record("storage.from") },
    auth: { signUp: record("auth.signUp"), getSession: record("auth.getSession") },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

const BAD = "free p0rn here";

describe("write paths stop before any request", () => {
  it("remoteCreatePost", async () => {
    const { supabase, calls } = recordingClient();
    const result = await remoteCreatePost(supabase, "user-1", { body: BAD, imageDataUrl: null, card: null });
    assert.equal(result.error, CONTENT_PROBLEM);
    assert.deepEqual(calls, []);
  });

  it("remoteUpdatePost", async () => {
    const { supabase, calls } = recordingClient();
    const result = await remoteUpdatePost(supabase, "user-1", "post-1", { body: BAD, imageDataUrl: null });
    assert.equal(result.error, CONTENT_PROBLEM);
    assert.deepEqual(calls, []);
  });

  it("remoteAddComment", async () => {
    const { supabase, calls } = recordingClient();
    const result = await remoteAddComment(supabase, "user-1", "post-1", BAD, "user-2");
    assert.equal(result.error, CONTENT_PROBLEM);
    assert.deepEqual(calls, []);
  });

  it("remoteSendMessage", async () => {
    const { supabase, calls } = recordingClient();
    const result = await remoteSendMessage(supabase, "user-1", "user-2", BAD);
    assert.equal(result.error, CONTENT_PROBLEM);
    assert.deepEqual(calls, []);
  });

  it("remoteSendMessage lets a card-only offer with no text through the filter", async () => {
    const { supabase, calls } = recordingClient();
    await assert.rejects(
      remoteSendMessage(supabase, "user-1", "user-2", "", { cardId: "11111111-1111-4111-8111-111111111111" }),
    );
    assert.ok(calls.length > 0);
  });

  it("remoteSignUp checks the username and the display name", async () => {
    const base = { email: "ada@example.com", password: "secret1", username: "wax_room", displayName: "Ada" };
    for (const input of [
      { ...base, username: "p0rn_breaks" },
      { ...base, displayName: BAD },
    ]) {
      const { supabase, calls } = recordingClient();
      const result = await remoteSignUp(supabase, input);
      assert.equal(result.error, CONTENT_PROBLEM);
      assert.deepEqual(calls, []);
    }
  });

  it("remoteUpdateProfile checks the username, display name and bio", async () => {
    const base = {
      username: "wax_room",
      displayName: "Ada",
      bio: "PC: Bills",
      avatarDataUrl: null,
      coverDataUrl: null,
    };
    for (const patch of [
      { ...base, username: "kys_cards" },
      { ...base, displayName: BAD },
      { ...base, bio: BAD },
    ]) {
      const { supabase, calls } = recordingClient();
      const result = await remoteUpdateProfile(supabase, "user-1", patch);
      assert.equal(result.error, CONTENT_PROBLEM);
      assert.deepEqual(calls, []);
    }
  });
});

describe("demo (local) write paths use the same filter", () => {
  const db = { sessionUserId: "user-1", users: [], posts: [] } as unknown as LocalDb;

  it("blocks posts, edits, replies and messages", () => {
    assert.equal(localCreatePost(db, { body: BAD, imageDataUrl: null, card: null }).error, CONTENT_PROBLEM);
    assert.equal(localSendMessage(db, "user-2", BAD).error, CONTENT_PROBLEM);
    const withPost = {
      ...db,
      posts: [{ id: "post-1", authorId: "user-1", card: null }],
    } as unknown as LocalDb;
    assert.equal(localUpdatePost(withPost, "post-1", { body: BAD, imageDataUrl: null }).error, CONTENT_PROBLEM);
    assert.equal(localAddComment(withPost, "post-1", BAD).error, CONTENT_PROBLEM);
  });
});
