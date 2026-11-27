import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localCreatePost, type LocalDb } from "./local-db";
import { remotePollBackend } from "./poll-remote";
import { POLL_CHOICE_TOO_LONG, POLL_QUESTION_REQUIRED, POLLS_UNAVAILABLE, type PollDraft } from "./poll-draft";
import { remoteCreatePost } from "./remote";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const poll = (options: string[], minutes = 0, days = 1): PollDraft => ({ options, length: { days, hours: 0, minutes } });

type Call = { name: string; args: unknown };

function client(answer: (name: string, args: unknown) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const inserts: unknown[] = [];
  const supabase = {
    rpc(name: string, args?: unknown) {
      calls.push({ name, args });
      return Promise.resolve(answer(name, args));
    },
    from() {
      // Only the mention sync reads here; a poll never inserts into posts directly.
      const chain = {
        insert(row: unknown) {
          inserts.push(row);
          return chain;
        },
        select: () => chain,
        delete: () => chain,
        update: () => chain,
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        or: () => chain,
        filter: () => chain,
        limit: () => chain,
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
      };
      return chain;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, calls, inserts };
}

const post = (body: string, draft: PollDraft) => ({ body, imageDataUrl: null, images: [], card: null, poll: draft });

describe("creating a poll", () => {
  it("saves the question and poll in one call to create_poll_post", async () => {
    const { supabase, calls, inserts } = client(() => ({ data: "post-1", error: null }));
    const result = await remoteCreatePost(supabase, AUTHOR, post("  Best rookie of 2024?  ", poll([" Caleb ", "Jayden", "Drake"], 30, 0)));
    assert.equal(result.error, undefined);
    assert.equal(result.postId, "post-1");
    assert.deepEqual(calls[0], {
      name: "create_poll_post",
      args: { p_content: "Best rookie of 2024?", p_options: ["Caleb", "Jayden", "Drake"], p_duration_minutes: 30 },
    });
    assert.equal(inserts.length, 0, "no separate posts insert");
  });

  it("checks the limits before asking the server", async () => {
    const { supabase, calls } = client(() => ({ data: "post-1", error: null }));
    assert.equal((await remoteCreatePost(supabase, AUTHOR, post("Q", poll(["a", "x".repeat(26)])))).error, POLL_CHOICE_TOO_LONG);
    assert.equal((await remoteCreatePost(supabase, AUTHOR, post("  ", poll(["a", "b"])))).error, POLL_QUESTION_REQUIRED);
    assert.match((await remoteCreatePost(supabase, AUTHOR, post("Q", poll(["a"])))).error ?? "", /2 to 4/);
    assert.match((await remoteCreatePost(supabase, AUTHOR, post("Q", poll(["a", "b", "c", "d", "e"])))).error ?? "", /2 to 4/);
    assert.equal(calls.length, 0);
  });

  it("shows the server's reason, and says when polls aren't set up yet", async () => {
    const refused = client(() => ({ data: null, error: { message: "Each choice needs to be different", hint: "poll_choice_repeat" } }));
    assert.equal((await remoteCreatePost(refused.supabase, AUTHOR, post("Q", poll(["a", "b"])))).error, "Each choice needs to be different.");
    const missing = client(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.create_poll_post" } }));
    assert.equal((await remoteCreatePost(missing.supabase, AUTHOR, post("Q", poll(["a", "b"])))).error, POLLS_UNAVAILABLE);
  });
});

describe("voting through the server", () => {
  it("sends one vote and reads back the counts", async () => {
    const { supabase, calls } = client(() => ({
      data: [{ poll_id: "p1", total_votes: 5, options: [{ id: "o1", votes: 5 }], viewer_option_id: "o1" }],
      error: null,
    }));
    const result = await remotePollBackend(supabase).vote("p1", "o1");
    assert.deepEqual(calls, [{ name: "vote_in_poll", args: { p_option_id: "o1" } }]);
    assert.deepEqual(result.counts, { total: 5, votes: { o1: 5 }, viewerChoice: "o1" });
  });

  it("passes on a refused vote: own poll, ended, or a second vote", async () => {
    for (const [hint, words] of [
      ["own_poll", "You can't vote in your own poll."],
      ["poll_ended", "This poll has ended."],
      ["already_voted", "You already voted in this poll."],
    ] as const) {
      const { supabase } = client(() => ({ data: null, error: { message: "x", hint } }));
      const result = await remotePollBackend(supabase).vote("p1", "o1");
      assert.equal(result.error, words);
      assert.equal(result.already, hint === "already_voted");
    }
  });

  it("reads only real poll ids, and nothing breaks before the migration", async () => {
    const { supabase, calls } = client(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));
    const backend = remotePollBackend(supabase);
    assert.equal((await backend.load(["post-1-poll"])).size, 0);
    assert.equal(calls.length, 0, "a local id never reaches the server");
    assert.equal((await backend.load(["11111111-1111-4111-8111-111111111111"])).size, 0);
  });
});

describe("creating a poll in local mode", () => {
  const db: LocalDb = {
    users: [],
    sessionUserId: AUTHOR,
    follows: [],
    posts: [],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
    messages: [],
    collections: {},
  };

  it("puts a text-only poll on the new post", () => {
    const result = localCreatePost(db, {
      ...post("Best rookie?", poll(["Caleb", "Jayden"])),
      images: ["data:image/png;base64,AAAA"],
      imageDataUrl: "data:image/png;base64,AAAA",
    });
    assert.equal(result.error, undefined);
    const saved = result.db.posts[0]!;
    assert.deepEqual(saved.poll?.options.map((option) => option.label), ["Caleb", "Jayden"]);
    assert.deepEqual(saved.images, [], "a poll post has no photos");
    assert.equal(saved.imageDataUrl, null);
  });

  it("refuses a poll over the limits", () => {
    assert.equal(localCreatePost(db, post("Q", poll(["a", "x".repeat(26)]))).error, POLL_CHOICE_TOO_LONG);
    assert.equal(localCreatePost(db, post("", poll(["a", "b"]))).error, POLL_QUESTION_REQUIRED);
  });
});
