import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPollStore, type PollBackend } from "./poll-store";
import { localPoll, localPollBackend, LOCAL_POLLS_KEY } from "./poll-local";
import type { PollCounts, PostPoll } from "./polls";

const NOW = Date.parse("2026-11-27T12:00:00Z");

const poll: PostPoll = {
  id: "poll-1",
  endsAt: new Date(NOW + 86_400_000).toISOString(),
  options: [
    { id: "a", label: "Caleb" },
    { id: "b", label: "Jayden" },
  ],
};

function fakeBackend(start: Record<string, PollCounts> = {}) {
  const loads: string[][] = [];
  const votes: [string, string][] = [];
  let failVote: string | null = null;
  const backend: PollBackend = {
    async load(ids) {
      loads.push([...ids]);
      return new Map(ids.filter((id) => start[id]).map((id) => [id, start[id]!]));
    },
    async vote(pollId, optionId) {
      votes.push([pollId, optionId]);
      if (failVote) return { error: failVote };
      const before = start[pollId] ?? { total: 0, votes: {}, viewerChoice: null };
      const after = {
        total: before.total + 1,
        votes: { ...before.votes, [optionId]: (before.votes[optionId] ?? 0) + 1 },
        viewerChoice: optionId,
      };
      start[pollId] = after;
      return { counts: after };
    },
  };
  return {
    backend,
    loads,
    votes,
    fail(message: string | null) {
      failVote = message;
    },
  };
}

/** Runs the queued batch read at once. */
function syncStore(backend: PollBackend) {
  const queue: (() => void)[] = [];
  const store = createPollStore(backend, (run) => queue.push(run));
  return {
    store,
    async flush() {
      while (queue.length) queue.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

const voter = { signedIn: true, isAuthor: false, now: NOW };

describe("poll store", () => {
  it("reads every poll on screen in one batch", async () => {
    const fake = fakeBackend({ p1: { total: 4, votes: { a: 4 }, viewerChoice: null } });
    const { store, flush } = syncStore(fake.backend);
    store.request("p1");
    store.request("p2");
    store.request("p1");
    await flush();
    assert.deepEqual(fake.loads, [["p1", "p2"]]);
    assert.equal(store.get("p1")?.total, 4);
    assert.deepEqual(store.get("p2"), { total: 0, votes: {}, viewerChoice: null }, "no row: no votes yet");
    store.request("p1");
    await flush();
    assert.equal(fake.loads.length, 1, "loaded polls are not read again");
  });

  it("allows one vote per user", async () => {
    const fake = fakeBackend();
    const { store } = syncStore(fake.backend);
    assert.deepEqual(await store.vote(poll, "a", voter), {});
    assert.equal(store.get(poll.id)?.viewerChoice, "a");
    const second = await store.vote(poll, "b", voter);
    assert.equal(second.refusal, "already_voted");
    assert.deepEqual(fake.votes, [["poll-1", "a"]], "the second vote never leaves the device");
  });

  it("ignores a second tap while the first vote is saving", async () => {
    const fake = fakeBackend();
    const { store } = syncStore(fake.backend);
    const [first, second] = await Promise.all([store.vote(poll, "a", voter), store.vote(poll, "b", voter)]);
    assert.deepEqual(first, {});
    assert.equal(second.refusal, "busy");
    assert.equal(fake.votes.length, 1);
  });

  it("won't let the author vote", async () => {
    const fake = fakeBackend();
    const { store } = syncStore(fake.backend);
    const result = await store.vote(poll, "a", { ...voter, isAuthor: true });
    assert.equal(result.refusal, "own_poll");
    assert.equal(fake.votes.length, 0);
  });

  it("refuses a vote after the poll ends, and signed out", async () => {
    const fake = fakeBackend();
    const { store } = syncStore(fake.backend);
    assert.equal((await store.vote(poll, "a", { ...voter, now: NOW + 2 * 86_400_000 })).refusal, "poll_ended");
    assert.equal((await store.vote(poll, "a", { ...voter, signedIn: false })).refusal, "signed_out");
    assert.equal((await store.vote(poll, "zzz", voter)).refusal, "unknown_option");
    assert.equal(fake.votes.length, 0);
  });

  it("shows the vote at once and takes it back if the server refuses", async () => {
    const fake = fakeBackend({ [poll.id]: { total: 2, votes: { a: 1, b: 1 }, viewerChoice: null } });
    const { store, flush } = syncStore(fake.backend);
    store.request(poll.id);
    await flush();
    fake.fail("This poll has ended.");
    const seen: (string | null)[] = [];
    const stop = store.subscribe(() => seen.push(store.get(poll.id)?.viewerChoice ?? null));
    const result = await store.vote(poll, "a", voter);
    stop();
    assert.equal(result.error, "This poll has ended.");
    assert.deepEqual(seen, ["a", null], "shown, then rolled back");
    assert.deepEqual(store.get(poll.id), { total: 2, votes: { a: 1, b: 1 }, viewerChoice: null });
  });
});

describe("local mode polls", () => {
  function memory() {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      data,
    };
  }

  it("builds the poll a new post carries", () => {
    const made = localPoll("post-x", { options: [" Caleb ", "Jayden"], length: { days: 0, hours: 2, minutes: 0 } }, NOW);
    assert.equal(made.id, "post-x-poll");
    assert.deepEqual(made.options.map((option) => option.label), ["Caleb", "Jayden"]);
    assert.equal(Date.parse(made.endsAt) - NOW, 2 * 3_600_000);
  });

  it("keeps one vote on this device", async () => {
    const storage = memory();
    const backend = localPollBackend(storage);
    const first = await backend.vote("p", "a");
    assert.deepEqual(first.counts, { total: 1, votes: { a: 1 }, viewerChoice: "a" });
    const again = await backend.vote("p", "b");
    assert.equal(again.already, true);
    assert.deepEqual((await backend.load(["p"])).get("p"), { total: 1, votes: { a: 1 }, viewerChoice: "a" });
    assert.ok(storage.data.has(LOCAL_POLLS_KEY));
  });
});
