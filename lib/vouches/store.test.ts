import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCAL_VOUCHES_KEY, localVouchBackend, sampleVouches, type LocalVouchPerson } from "./local";
import { remoteVouchBackend, statusFromRows, summariesFromRows, vouchRowsFromRows } from "./remote";
import { emptySummary, percentPositive, trustLine, VOUCH_COPY, type VouchSummary } from "./rules";
import { createVouchStore, summaryAfter } from "./store";
import type { VouchBackend, VouchStatus, VouchWriteResult } from "./types";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BOB = uuid(2);
const CAROL = uuid(3);

const counts = (userId: string, positive: number, neutral = 0, negative = 0): VouchSummary => ({
  ...emptySummary(userId),
  total: positive + neutral + negative,
  positive,
  neutral,
  negative,
  lastVouchAt: "2026-11-20T00:00:00.000Z",
});

function fakeBackend(start: Record<string, VouchSummary> = {}, statuses: Record<string, VouchStatus> = {}) {
  const loads: string[][] = [];
  const writes: unknown[][] = [];
  let next: VouchWriteResult | "throw" | null = null;
  let hold: Promise<void> | null = null;
  const backend: VouchBackend = {
    async summaries(ids) {
      loads.push([...ids]);
      return new Map(ids.filter((id) => start[id]).map((id) => [id, start[id]!]));
    },
    async list() {
      return { rows: [], next: null };
    },
    async status(subjectId) {
      return statuses[subjectId] ?? { canVouch: true, reason: null, mine: null };
    },
    async upsert(subjectId, rating, note) {
      writes.push(["upsert", subjectId, rating, note]);
      if (hold) await hold;
      if (next === "throw") throw new Error("offline");
      if (next) return next;
      const before = statuses[subjectId]?.mine ?? null;
      start[subjectId] = summaryAfter(start[subjectId] ?? emptySummary(subjectId), before?.rating ?? null, rating, "2026-11-28T12:00:00.000Z");
      statuses[subjectId] = { canVouch: true, reason: null, mine: { id: "v-real", rating, note } };
      return { ok: true, id: "v-real" };
    },
    async remove(subjectId) {
      writes.push(["remove", subjectId]);
      if (next === "throw") throw new Error("offline");
      if (next) return next;
      const before = statuses[subjectId]?.mine ?? null;
      start[subjectId] = summaryAfter(start[subjectId] ?? emptySummary(subjectId), before?.rating ?? null, null, "");
      statuses[subjectId] = { canVouch: true, reason: null, mine: null };
      return { ok: true };
    },
    async reply(vouchId, text) {
      writes.push(["reply", vouchId, text]);
      if (hold) await hold;
      return next && next !== "throw" ? next : { ok: true };
    },
  };
  return {
    backend,
    loads,
    writes,
    answer(result: VouchWriteResult | "throw" | null) {
      next = result;
    },
    /** Makes the next writes wait until the returned function is called. */
    pause() {
      let release = () => {};
      hold = new Promise<void>((resolve) => {
        release = () => {
          hold = null;
          resolve();
        };
      });
      return release;
    },
  };
}

/** Runs the queued batch read at once. */
function syncStore(backend: VouchBackend) {
  const queue: (() => void)[] = [];
  const store = createVouchStore(backend, (run) => queue.push(run));
  return {
    store,
    async flush() {
      while (queue.length) queue.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe("vouch store: one batched read per screen", () => {
  it("asks for every profile on screen in one call, each id once", async () => {
    const fake = fakeBackend({ [BOB]: counts(BOB, 14) });
    const { store, flush } = syncStore(fake.backend);
    assert.equal(store.summary(BOB), null, "null until it loads");
    for (const id of [BOB, CAROL, BOB, CAROL, BOB]) store.request(id);
    store.request("");
    await flush();
    assert.deepEqual(fake.loads, [[BOB, CAROL]]);
    assert.equal(trustLine(store.summary(BOB)), "✓ 14 vouches · 100% positive");
    assert.deepEqual(store.summary(CAROL), emptySummary(CAROL), "no row: no vouches yet");
  });

  it("keeps answers for the session", async () => {
    const fake = fakeBackend({ [BOB]: counts(BOB, 2) });
    const { store, flush } = syncStore(fake.backend);
    store.request(BOB);
    await flush();
    store.request(BOB);
    store.request(BOB);
    await flush();
    assert.equal(fake.loads.length, 1);
  });

  it("splits a long screen into calls of 50, the most the database takes", async () => {
    const fake = fakeBackend();
    const { store, flush } = syncStore(fake.backend);
    for (let n = 1; n <= 120; n += 1) store.request(uuid(n));
    await flush();
    assert.deepEqual(fake.loads.map((batch) => batch.length), [50, 50, 20]);
  });

  it("tells listeners when counts land, and tries again after a failed read", async () => {
    let fail = true;
    const loads: string[][] = [];
    const backend: VouchBackend = {
      ...fakeBackend().backend,
      async summaries(ids) {
        loads.push([...ids]);
        if (fail) throw new Error("offline");
        return new Map([[BOB, counts(BOB, 1)]]);
      },
    };
    const { store, flush } = syncStore(backend);
    let told = 0;
    const stop = store.subscribe(() => (told += 1));
    store.request(BOB);
    await flush();
    assert.equal(store.summary(BOB), null, "a failed read shows nothing, not zero");
    assert.ok(told >= 1);
    fail = false;
    store.request(BOB);
    await flush();
    assert.equal(store.summary(BOB)?.total, 1);
    stop();
    assert.equal(loads.length, 2);
  });
});

describe("vouch store: saving", () => {
  it("shows a new vouch at once, then reads the real counts again", async () => {
    const fake = fakeBackend({ [BOB]: counts(BOB, 2) });
    const { store, flush } = syncStore(fake.backend);
    store.request(BOB);
    store.requestStatus(BOB);
    await flush();
    const release = fake.pause();
    const saving = store.upsert(BOB, "positive", "  Shipped fast.\r\nCard as shown.  ");
    assert.equal(store.summary(BOB)?.total, 3, "counted before the server answers");
    assert.equal(store.summary(BOB)?.positive, 3);
    assert.equal(store.status(BOB)?.mine?.rating, "positive");
    assert.equal(store.isSaving(BOB), true);
    release();
    assert.deepEqual(await saving, { ok: true, id: "v-real" });
    await flush();
    assert.deepEqual(fake.writes, [["upsert", BOB, "positive", "Shipped fast.\nCard as shown."]], "sent trimmed, CRLF as one line break");
    assert.equal(store.isSaving(BOB), false);
    assert.equal(store.summary(BOB)?.total, 3);
    assert.equal(store.status(BOB)?.mine?.id, "v-real", "the real id replaces the guess");
    assert.equal(fake.loads.length, 2, "the profile was read again after the write");
  });

  it("moves the count when a vouch changes rating, and takes it away when removed", async () => {
    const fake = fakeBackend({ [BOB]: counts(BOB, 3, 0, 1) }, { [BOB]: { canVouch: true, reason: null, mine: { id: "v1", rating: "positive", note: "" } } });
    const { store, flush } = syncStore(fake.backend);
    store.request(BOB);
    store.requestStatus(BOB);
    await flush();
    assert.equal(percentPositive(store.summary(BOB)!), 75);
    await store.upsert(BOB, "negative", "Card had a corner ding.");
    await flush();
    assert.deepEqual([store.summary(BOB)?.total, store.summary(BOB)?.positive, store.summary(BOB)?.negative], [4, 2, 2]);
    await store.remove(BOB);
    await flush();
    assert.deepEqual([store.summary(BOB)?.total, store.summary(BOB)?.positive, store.summary(BOB)?.negative], [3, 2, 1]);
    assert.equal(store.status(BOB)?.mine, null);
  });

  it("rolls back when the server refuses, and says why in plain words", async () => {
    const fake = fakeBackend({ [BOB]: counts(BOB, 2) });
    const { store, flush } = syncStore(fake.backend);
    store.request(BOB);
    store.requestStatus(BOB);
    await flush();
    fake.answer({ ok: false, error: "You've left a lot of vouches today. Try again tomorrow.", hint: "vouch_rate_limited" });
    const result = await store.upsert(BOB, "positive", "");
    assert.deepEqual(result, { ok: false, error: "You've left a lot of vouches today. Try again tomorrow.", hint: "vouch_rate_limited" });
    assert.equal(store.summary(BOB)?.total, 2, "the count is back where it was");
    assert.equal(store.status(BOB)?.mine, null);
    assert.equal(store.isSaving(BOB), false);
  });

  it("rolls back when the request never arrives", async () => {
    const fake = fakeBackend({ [BOB]: counts(BOB, 2) }, { [BOB]: { canVouch: true, reason: null, mine: { id: "v1", rating: "positive", note: "Good." } } });
    const { store, flush } = syncStore(fake.backend);
    store.request(BOB);
    store.requestStatus(BOB);
    await flush();
    fake.answer("throw");
    assert.deepEqual(await store.remove(BOB), { ok: false, error: VOUCH_COPY.failed, hint: null });
    assert.equal(store.summary(BOB)?.total, 2);
    assert.equal(store.status(BOB)?.mine?.note, "Good.");
  });

  it("ignores a double tap: one save goes out", async () => {
    const fake = fakeBackend({ [BOB]: counts(BOB, 0) });
    const { store, flush } = syncStore(fake.backend);
    store.request(BOB);
    await flush();
    const release = fake.pause();
    const first = store.upsert(BOB, "positive", "");
    const second = await store.upsert(BOB, "positive", "");
    const third = await store.remove(BOB);
    assert.deepEqual(second, { ok: false, error: VOUCH_COPY.busy, hint: null });
    assert.deepEqual(third, { ok: false, error: VOUCH_COPY.busy, hint: null });
    assert.equal(store.summary(BOB)?.total, 1, "counted once");
    release();
    assert.equal((await first).ok, true);
    assert.equal(fake.writes.length, 1);
  });

  it("never sends a note the database would refuse", async () => {
    const fake = fakeBackend();
    const { store } = syncStore(fake.backend);
    assert.equal((await store.upsert(BOB, "negative", "short")).ok, false);
    assert.deepEqual(await store.upsert(BOB, "neutral", ""), { ok: false, error: "Add a short reason so others know what happened.", hint: "vouch_note_required" });
    assert.equal((await store.upsert(BOB, "positive", "x".repeat(281)) as { hint: string }).hint, "vouch_note_too_long");
    assert.equal((await store.upsert(BOB, "positive", "tab\there") as { hint: string }).hint, "vouch_note_chars");
    assert.equal((await store.upsert(BOB, "positive", "a badword", (text) => text.includes("badword")) as { hint: string }).hint, "vouch_word_filter");
    assert.equal((await store.reply("v1", "x".repeat(281)) as { hint: string }).hint, "vouch_note_too_long");
    assert.deepEqual(fake.writes, []);
  });

  it("a read that started before a save can't put the old count back", async () => {
    const start = { [BOB]: counts(BOB, 2) };
    const fake = fakeBackend(start);
    let releaseRead = () => {};
    const slow: VouchBackend = {
      ...fake.backend,
      async summaries(ids) {
        const stale = new Map(ids.map((id) => [id, { ...start[id]! }]));
        await new Promise<void>((resolve) => (releaseRead = resolve));
        return stale;
      },
    };
    const queue: (() => void)[] = [];
    const store = createVouchStore(slow, (run) => queue.push(run));
    store.request(BOB);
    queue.shift()!();
    const saved = store.upsert(BOB, "positive", "");
    await saved;
    releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The stale read (2) is dropped, and the profile is asked for again.
    assert.equal(store.summary(BOB), null);
    assert.equal(queue.length, 1, "a fresh read is queued");
    queue.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(store.summary(BOB)?.total, 3, "the count after the save");
  });

  it("replies go out once, trimmed, and an empty reply removes it", async () => {
    const fake = fakeBackend();
    const { store } = syncStore(fake.backend);
    const release = fake.pause();
    const first = store.reply("v1", "  Thanks, easy deal.  ");
    assert.deepEqual(await store.reply("v1", "again"), { ok: false, error: VOUCH_COPY.busy, hint: null });
    release();
    assert.deepEqual(await first, { ok: true });
    assert.deepEqual(await store.reply("v1", "   "), { ok: true });
    assert.deepEqual(fake.writes, [["reply", "v1", "Thanks, easy deal."], ["reply", "v1", ""]]);
  });

  it("works out the counts after a change without going below zero", () => {
    const now = "2026-11-28T12:00:00.000Z";
    assert.deepEqual(summaryAfter(counts(BOB, 1), null, "negative", now), { ...counts(BOB, 1, 0, 1), lastVouchAt: now });
    assert.deepEqual(summaryAfter(counts(BOB, 1), "positive", "neutral", now), counts(BOB, 0, 1));
    assert.deepEqual(summaryAfter(counts(BOB, 1), "positive", null, now), counts(BOB, 0));
    assert.equal(summaryAfter(emptySummary(BOB), "negative", null, now).total, 0);
    assert.equal(summaryAfter(emptySummary(BOB), "negative", null, now).negative, 0);
  });
});

describe("remote backend: only the vouch functions, read defensively", () => {
  function rpcClient(answers: Record<string, { data?: unknown; error?: { code?: string; message?: string; hint?: string } | null }>) {
    const calls: [string, Record<string, unknown>][] = [];
    return {
      calls,
      client: {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push([name, args]);
          return Promise.resolve({ data: null, error: null, ...answers[name] });
        },
      } as never,
    };
  }

  it("reads summaries, with zeros for a profile the database sent no row for, and skips ids that aren't ids", async () => {
    const db = rpcClient({
      vouch_summaries: {
        data: [
          { user_id: BOB, total: 5, positive: "3", neutral: 1, negative: 1, last_vouch_at: "2026-11-27T00:00:00Z", followed_count: 2, followed_sample_username: "kev" },
          { nope: true },
          null,
        ],
      },
    });
    const found = await remoteVouchBackend(db.client).summaries([BOB, CAROL, BOB, "user-maya", ""]);
    assert.deepEqual(db.calls, [["vouch_summaries", { p_user_ids: [BOB, CAROL] }]]);
    assert.deepEqual(found.get(BOB), { userId: BOB, total: 5, positive: 3, neutral: 1, negative: 1, lastVouchAt: "2026-11-27T00:00:00Z", followedCount: 2, followedSampleUsername: "kev" });
    assert.deepEqual(found.get(CAROL), emptySummary(CAROL));
    assert.equal(found.size, 2);
  });

  it("never sends more than 50 ids in one call, and no call at all for nothing", async () => {
    const db = rpcClient({ vouch_summaries: { data: [] } });
    await remoteVouchBackend(db.client).summaries(Array.from({ length: 101 }, (_, n) => uuid(n + 1)));
    assert.deepEqual(db.calls.map(([, args]) => (args.p_user_ids as string[]).length), [50, 50, 1]);
    const none = rpcClient({});
    assert.equal((await remoteVouchBackend(none.client).summaries([])).size, 0);
    assert.equal(none.calls.length, 0);
  });

  it("shows nothing when the migration isn't there, and throws on a real failure so the store tries again", async () => {
    const missing = rpcClient({
      vouch_summaries: { error: { code: "PGRST202", message: "Could not find the function" } },
      list_vouches: { error: { code: "PGRST202", message: "Could not find the function" } },
      vouch_status: { error: { code: "PGRST202", message: "Could not find the function" } },
    });
    const backend = remoteVouchBackend(missing.client);
    assert.equal((await backend.summaries([BOB])).size, 0);
    assert.deepEqual(await backend.list(BOB), { rows: [], next: null });
    assert.deepEqual(await backend.status(BOB), { canVouch: false, reason: null, mine: null });
    const down = rpcClient({ vouch_summaries: { error: { code: "57014", message: "timeout" } } });
    await assert.rejects(remoteVouchBackend(down.client).summaries([BOB]), /timeout/);
  });

  const listRow = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    rating: "positive",
    note: "Shipped fast.",
    created_at: "2026-11-27T10:00:00Z",
    edited_at: null,
    reply: null,
    reply_at: null,
    reply_edited_at: null,
    voucher_id: CAROL,
    voucher_username: "carol",
    voucher_display_name: "Carol",
    voucher_avatar_url: null,
    voucher_accent: "#7c5cff",
    voucher_created_at: "2026-10-01T00:00:00Z",
    voucher_vouch_total: 8,
    has_logged_deal: false,
    ...extra,
  });

  it("reads a page of vouches and hands back where the next page starts", async () => {
    const db = rpcClient({
      list_vouches: {
        data: [
          listRow("v3", { reply: "Thanks.", reply_at: "2026-11-27T11:00:00Z", has_logged_deal: true, edited_at: "2026-11-27T10:30:00Z" }),
          listRow("v2", { rating: "negative", note: "Corner ding." }),
        ],
      },
    });
    const page = await remoteVouchBackend(db.client).list(BOB, { rating: "negative", before: { createdAt: "2026-11-28T00:00:00Z", id: "v9" }, limit: 2 });
    assert.deepEqual(db.calls[0], ["list_vouches", { p_subject: BOB, p_rating: "negative", p_before_created: "2026-11-28T00:00:00Z", p_before_id: "v9", p_limit: 2 }]);
    assert.equal(page.rows.length, 2);
    assert.deepEqual(page.rows[0]?.voucher, { id: CAROL, username: "carol", displayName: "Carol", avatarUrl: null, accent: "#7c5cff", createdAt: "2026-10-01T00:00:00Z", vouchTotal: 8 });
    assert.equal(page.rows[0]?.hasLoggedDeal, true);
    assert.equal(page.rows[0]?.reply, "Thanks.");
    assert.equal(page.rows[0]?.editedAt, "2026-11-27T10:30:00Z");
    assert.deepEqual(page.next, { createdAt: "2026-11-27T10:00:00Z", id: "v2" });
    assert.ok(!JSON.stringify(page).includes("price"), "no price anywhere");
  });

  it("a short page is the last page, and the page size stays between 1 and 50", async () => {
    const db = rpcClient({ list_vouches: { data: [listRow("v1")] } });
    const backend = remoteVouchBackend(db.client);
    assert.equal((await backend.list(BOB)).next, null);
    await backend.list(BOB, { limit: 500 });
    await backend.list(BOB, { limit: 0 });
    assert.deepEqual(db.calls.map(([, args]) => args.p_limit), [20, 50, 1]);
    assert.deepEqual(db.calls[0]?.[1], { p_subject: BOB, p_rating: null, p_before_created: null, p_before_id: null, p_limit: 20 });
  });

  it("skips a row it can't read (a voucher who is gone, a rating it doesn't know) instead of crashing", () => {
    const rows = vouchRowsFromRows([
      listRow("v1"),
      listRow("v2", { voucher_username: null }),
      listRow("v3", { rating: "great" }),
      listRow("v4", { voucher_id: null }),
      { id: "v5" },
      null,
      "junk",
      listRow("v6", { reply: null, reply_at: "2026-11-27T11:00:00Z", voucher_display_name: null, note: null }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["v1", "v6"]);
    assert.equal(rows[1]?.replyAt, null, "a hidden reply has no time either");
    assert.equal(rows[1]?.voucher.displayName, "carol");
    assert.equal(rows[1]?.note, "");
    assert.deepEqual(vouchRowsFromRows(null), []);
    assert.deepEqual(vouchRowsFromRows({}), []);
    assert.equal(summariesFromRows("junk").size, 0);
  });

  it("still pages on when the last row of a full page couldn't be read", async () => {
    const db = rpcClient({ list_vouches: { data: [listRow("v2"), listRow("v1", { voucher_username: null, created_at: "2026-11-26T00:00:00Z" })] } });
    const page = await remoteVouchBackend(db.client).list(BOB, { limit: 2 });
    assert.deepEqual(page.rows.map((row) => row.id), ["v2"]);
    assert.deepEqual(page.next, { createdAt: "2026-11-26T00:00:00Z", id: "v1" });
  });

  it("reads the status row, whatever shape it comes back in", () => {
    assert.deepEqual(statusFromRows([{ can_vouch: true, reason: null, my_vouch_id: null, my_rating: null, my_note: null }]), { canVouch: true, reason: null, mine: null });
    assert.deepEqual(statusFromRows([{ can_vouch: false, reason: "vouch_conversation_too_new", my_vouch_id: null }]), { canVouch: false, reason: "vouch_conversation_too_new", mine: null });
    assert.deepEqual(statusFromRows({ can_vouch: true, reason: null, my_vouch_id: "v1", my_rating: "neutral", my_note: "Slow to ship." }), {
      canVouch: true,
      reason: null,
      mine: { id: "v1", rating: "neutral", note: "Slow to ship." },
    });
    assert.deepEqual(statusFromRows([{ can_vouch: false, reason: "made_up_reason" }]), { canVouch: false, reason: null, mine: null });
    assert.deepEqual(statusFromRows([]), { canVouch: false, reason: null, mine: null });
    assert.deepEqual(statusFromRows(null), { canVouch: false, reason: null, mine: null });
  });

  it("turns each refusal into its friendly line, and never passes the raw message on", async () => {
    const refusal = (hint: string | undefined, message = 'new row violates check constraint "vouches_note"') =>
      remoteVouchBackend(rpcClient({ upsert_vouch: { error: { code: "42501", message, hint } } }).client).upsert(BOB, "positive", "");
    assert.deepEqual(await refusal("vouch_conversation_too_new"), { ok: false, error: "You can vouch 24 hours after you've both messaged.", hint: "vouch_conversation_too_new" });
    assert.deepEqual(await refusal("vouch_note_chars"), { ok: false, error: "Remove the special characters and try again.", hint: "vouch_note_chars" });
    assert.deepEqual(await refusal("vouch_rating"), { ok: false, error: "Pick positive, neutral or negative.", hint: "vouch_rating" });
    assert.deepEqual(await refusal(undefined), { ok: false, error: VOUCH_COPY.failed, hint: null });
  });

  it("sends writes through the three write functions", async () => {
    const db = rpcClient({ upsert_vouch: { data: "v-new" } });
    const backend = remoteVouchBackend(db.client);
    assert.deepEqual(await backend.upsert(BOB, "neutral", "  Slow to ship,\r\nbut fine.  "), { ok: true, id: "v-new" });
    assert.deepEqual(await backend.remove(BOB), { ok: true });
    assert.deepEqual(await backend.reply("v-new", " Thanks. "), { ok: true });
    assert.deepEqual(db.calls, [
      ["upsert_vouch", { p_subject: BOB, p_rating: "neutral", p_note: "Slow to ship,\nbut fine." }],
      ["delete_vouch", { p_subject: BOB }],
      ["reply_to_vouch", { p_vouch_id: "v-new", p_reply: "Thanks." }],
    ]);
  });

  it("removing a vouch that is already gone is not an error", async () => {
    const gone = rpcClient({ delete_vouch: { error: { code: "P0002", message: "That vouch is unavailable", hint: "vouch_not_found" } } });
    assert.deepEqual(await remoteVouchBackend(gone.client).remove(BOB), { ok: true });
    const blocked = rpcClient({ delete_vouch: { error: { code: "42501", message: "nope", hint: "vouch_signed_out" } } });
    assert.equal((await remoteVouchBackend(blocked.client).remove(BOB)).ok, false);
  });
});

describe("local mode: sample vouches on this device", () => {
  const MAYA: LocalVouchPerson = { id: "user-maya", username: "waxroom", displayName: "Maya Chen" };
  const JORDAN: LocalVouchPerson = { id: "user-jordan", username: "jordanhale", displayName: "Jordan Hale" };
  const SAM: LocalVouchPerson = { id: "user-sam", username: "boxbreak", displayName: "Sam Ortiz" };
  const ME: LocalVouchPerson = { id: "user-me", username: "donnie", displayName: "Me" };
  const people = [MAYA, JORDAN, SAM];

  function memoryStorage(start: Record<string, string> = {}) {
    const data = { ...start };
    return { data, getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => void (data[key] = value) };
  }
  const local = (viewer: LocalVouchPerson | null, storage = memoryStorage(), following: string[] = []) =>
    localVouchBackend({ storage, viewer, people, following, now: () => NOW });

  it("starts with a mix of ratings, a reply, an edited vouch and a logged deal", async () => {
    const samples = sampleVouches(NOW);
    assert.deepEqual([...new Set(samples.map((vouch) => vouch.rating))].sort(), ["negative", "neutral", "positive"]);
    assert.ok(samples.some((vouch) => vouch.reply));
    assert.ok(samples.some((vouch) => vouch.editedAt));
    assert.ok(samples.some((vouch) => vouch.hasLoggedDeal));
    const backend = local(null);
    const summary = (await backend.summaries(["user-maya"])).get("user-maya")!;
    assert.deepEqual([summary.total, summary.positive, summary.neutral, summary.negative], [5, 3, 1, 1]);
    assert.equal(trustLine(summary), "✓ 5 vouches · 75% positive");
    const page = await backend.list("user-maya");
    assert.equal(page.rows.length, 5);
    assert.equal(page.next, null);
    assert.deepEqual(page.rows.map((row) => row.createdAt), [...page.rows.map((row) => row.createdAt)].sort().reverse(), "newest first");
    assert.equal(page.rows[0]?.voucher.displayName, "Jordan Hale");
    assert.equal(page.rows[0]?.hasLoggedDeal, true);
    assert.equal(page.rows[0]?.voucher.vouchTotal, 2, "the voucher's own count rides along");
  });

  it("filters and pages the same way the database does", async () => {
    const backend = local(null);
    assert.equal((await backend.list("user-maya", { rating: "negative" })).rows.length, 1);
    assert.equal((await backend.list("user-maya", { rating: "neutral" })).rows[0]?.editedAt !== null, true);
    const first = await backend.list("user-maya", { limit: 2 });
    assert.equal(first.rows.length, 2);
    assert.ok(first.next);
    const second = await backend.list("user-maya", { limit: 2, before: first.next });
    const third = await backend.list("user-maya", { limit: 2, before: second.next });
    const seen = [...first.rows, ...second.rows, ...third.rows].map((row) => row.id);
    assert.equal(new Set(seen).size, 5);
    assert.equal(third.next, null);
    assert.equal((await backend.list("nobody")).rows.length, 0);
  });

  it("counts the vouchers the viewer follows, newest first", async () => {
    const backend = local(ME, memoryStorage(), ["user-sam", "sample-rio", "user-nobody"]);
    const summary = (await backend.summaries(["user-maya"])).get("user-maya")!;
    assert.equal(summary.followedCount, 2);
    assert.equal(summary.followedSampleUsername, "boxbreak");
  });

  it("leaves, edits and removes a vouch, and keeps it across reloads", async () => {
    const storage = memoryStorage();
    const backend = local(ME, storage);
    assert.deepEqual(await backend.status("user-maya"), { canVouch: true, reason: null, mine: null });
    const made = await backend.upsert("user-maya", "positive", "  Shipped fast.\r\nCard as shown. ");
    assert.equal(made.ok, true);
    assert.ok(storage.data[LOCAL_VOUCHES_KEY]);
    const again = local(ME, storage);
    assert.deepEqual((await again.status("user-maya")).mine?.note, "Shipped fast.\nCard as shown.");
    assert.equal((await again.summaries(["user-maya"])).get("user-maya")?.total, 6);
    assert.equal((await again.list("user-maya")).rows[0]?.voucher.username, "donnie");
    assert.equal((await again.list("user-maya")).rows[0]?.editedAt, null);
    await again.upsert("user-maya", "neutral", "Slow to ship, but it arrived.");
    const edited = (await again.list("user-maya")).rows.find((row) => row.voucher.id === ME.id);
    assert.equal(edited?.rating, "neutral");
    assert.ok(edited?.editedAt);
    assert.equal((await again.summaries(["user-maya"])).get("user-maya")?.total, 6, "still one vouch for the pair");
    assert.deepEqual(await again.remove("user-maya"), { ok: true });
    assert.equal((await again.summaries(["user-maya"])).get("user-maya")?.total, 5);
    assert.deepEqual(await again.remove("user-maya"), { ok: true }, "removing twice is fine");
  });

  it("holds notes to the same rules, and refuses yourself and signed-out readers", async () => {
    const backend = local(ME);
    assert.equal((await backend.upsert("user-maya", "negative", "short") as { hint: string }).hint, "vouch_note_required");
    assert.equal((await backend.upsert("user-maya", "positive", "x".repeat(281)) as { hint: string }).hint, "vouch_note_too_long");
    assert.equal((await backend.upsert("user-maya", "positive", "tab\tinside") as { hint: string }).hint, "vouch_note_chars");
    assert.equal((await backend.upsert("user-me", "positive", "") as { hint: string }).hint, "vouch_self");
    assert.deepEqual(await backend.status("user-me"), { canVouch: false, reason: "vouch_self", mine: null });
    assert.deepEqual(await local(null).status("user-maya"), { canVouch: false, reason: "vouch_signed_out", mine: null });
    assert.equal((await local(null).upsert("user-maya", "positive", "") as { hint: string }).hint, "vouch_signed_out");
  });

  it("lets only the subject reply, once, and edit or remove it", async () => {
    const storage = memoryStorage();
    const maya = local(MAYA, storage);
    assert.equal((await local(JORDAN, storage).reply("sample-vouch-1", "Not mine") as { hint: string }).hint, "vouch_not_yours");
    assert.equal((await maya.reply("no-such-vouch", "Hello") as { hint: string }).hint, "vouch_not_found");
    assert.equal((await maya.reply("sample-vouch-1", "Thanks Jordan.")).ok, true);
    let row = (await maya.list("user-maya")).rows.find((item) => item.id === "sample-vouch-1");
    assert.equal(row?.reply, "Thanks Jordan.");
    assert.equal(row?.replyEditedAt, null);
    await maya.reply("sample-vouch-1", "Thanks Jordan. Any time.");
    row = (await maya.list("user-maya")).rows.find((item) => item.id === "sample-vouch-1");
    assert.ok(row?.replyEditedAt);
    await maya.reply("sample-vouch-1", "  ");
    row = (await maya.list("user-maya")).rows.find((item) => item.id === "sample-vouch-1");
    assert.deepEqual([row?.reply, row?.replyAt, row?.replyEditedAt], [null, null, null]);
  });

  it("leaves out vouches from someone this device no longer knows, and survives junk in storage", async () => {
    const unknown = localVouchBackend({ storage: memoryStorage(), viewer: null, people: [MAYA], now: () => NOW });
    const page = await unknown.list("user-maya");
    assert.ok(page.rows.every((row) => row.voucher.username));
    assert.equal(page.rows.length, 3, "only the vouchers still known: the three extra sample collectors");
    assert.equal((await unknown.summaries(["user-maya"])).get("user-maya")?.total, 3);
    for (const junk of ["not json", "[]", '{"vouches":"nope"}', '{"vouches":[{"id":1},null]}']) {
      const backend = localVouchBackend({ storage: memoryStorage({ [LOCAL_VOUCHES_KEY]: junk }), viewer: ME, people, now: () => NOW });
      assert.ok((await backend.summaries(["user-maya"])).get("user-maya"));
      assert.ok(Array.isArray((await backend.list("user-maya")).rows), junk);
    }
  });

  it("works with no storage at all (private browsing)", async () => {
    const backend = localVouchBackend({ storage: null, viewer: ME, people, now: () => NOW });
    assert.equal((await backend.upsert("user-maya", "positive", "")).ok, true);
    assert.equal((await backend.summaries(["user-maya"])).get("user-maya")?.total, 6);
  });

  it("drives the store end to end", async () => {
    const queue: (() => void)[] = [];
    const store = createVouchStore(local(ME), (run) => queue.push(run));
    const flush = async () => {
      while (queue.length) queue.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    store.request("user-maya");
    store.requestStatus("user-maya");
    await flush();
    assert.equal(trustLine(store.summary("user-maya")), "✓ 5 vouches · 75% positive");
    assert.equal((await store.upsert("user-maya", "positive", "Great deal.")).ok, true);
    await flush();
    assert.equal(trustLine(store.summary("user-maya")), "✓ 6 vouches · 80% positive");
    assert.equal(store.status("user-maya")?.mine?.note, "Great deal.");
  });
});

describe("the summary and the list are never compared", () => {
  it("a reader who blocked a voucher sees fewer rows than the count, and nothing breaks", async () => {
    // The counts are everyone's; the list leaves out people in a block with the reader.
    const backend: VouchBackend = {
      ...fakeBackend({ [BOB]: counts(BOB, 5) }).backend,
      async list() {
        return { rows: [], next: null };
      },
    };
    const queue: (() => void)[] = [];
    const store = createVouchStore(backend, (run) => queue.push(run));
    store.request(BOB);
    queue.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const page = await store.list(BOB);
    assert.equal(store.summary(BOB)?.total, 5);
    assert.equal(page.rows.length, 0);
    assert.equal(trustLine(store.summary(BOB)), "✓ 5 vouches · 100% positive");
  });
});
