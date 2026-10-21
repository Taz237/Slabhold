import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { groupHeadline, groupNotifications } from "./group-notifications";
import { mentionUsernames } from "./mentions";
import { remoteAddComment } from "./remote";
import { allowReplyMention, replyMentionCandidates } from "./reply-mentions";
import type { Notification } from "./types";

const ACTOR = "actor-1";
const AUTHOR = "author-1";
const SAM = "sam-1";
const JULES = "jules-1";

describe("reply mention parse", () => {
  it("dedupes handles and ignores emails and unknown fragments", () => {
    assert.deepEqual(mentionUsernames("hey @Sam @sam and @Sam, email a@bc.com"), ["sam"]);
    assert.deepEqual(mentionUsernames("@sam @jules @sam"), ["sam", "jules"]);
    assert.deepEqual(mentionUsernames("no handles here"), []);
  });

  it("keeps one id per handle and drops unknown handles", () => {
    const ids = replyMentionCandidates({
      actorId: ACTOR,
      body: "@sam @sam @Sam @ghost",
      profiles: [
        { id: SAM, username: "sam" },
        { id: SAM, username: "Sam" },
        { id: JULES, username: "jules" },
      ],
    });
    assert.deepEqual(ids, [SAM]);
  });
});

describe("reply mention recipients", () => {
  const profiles = [
    { id: ACTOR, username: "me" },
    { id: AUTHOR, username: "author" },
    { id: SAM, username: "sam" },
  ];

  it("never includes the author", () => {
    assert.deepEqual(
      replyMentionCandidates({
        actorId: ACTOR,
        body: "@me @sam",
        profiles,
      }),
      [SAM],
    );
  });

  it("skips the post author who already gets the reply notification", () => {
    assert.deepEqual(
      replyMentionCandidates({
        actorId: ACTOR,
        body: "@author @sam",
        profiles,
        skipRecipientId: AUTHOR,
      }),
      [SAM],
    );
  });
});

type Row = Record<string, unknown>;

function replyClient(options: {
  profiles: { id: string; username: string }[];
  mutes?: { muter_id: string; muted_id: string }[];
  blocked?: string[];
  profileThrows?: boolean;
  mentionInsertError?: { code?: string; message: string };
  mentionInsertThrows?: boolean;
}) {
  const inserts: { table: string; row: Row }[] = [];
  const rpcOthers: string[] = [];
  const blocked = new Set(options.blocked ?? []);
  const supabase = {
    async rpc(fn: string, args?: Record<string, unknown>) {
      if (fn === "can_interact") rpcOthers.push(String(args?.other ?? ""));
      const other = String(args?.other ?? "");
      return { data: !blocked.has(other), error: null };
    },
    from(table: string) {
      const filters: Record<string, string> = {};
      let names: string[] = [];
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return builder;
        },
        in(_column: string, list: string[]) {
          names = list;
          return builder;
        },
        limit() {
          return builder;
        },
        insert(row: Row) {
          if (table === "notifications" && row.kind === "mention" && options.mentionInsertThrows) {
            throw new Error("mention insert failed");
          }
          inserts.push({ table, row });
          if (table === "notifications" && row.kind === "mention" && options.mentionInsertError) {
            return Promise.resolve({ error: options.mentionInsertError });
          }
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        then(
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const run = () => {
            if (options.profileThrows && table === "profiles") throw new Error("profiles down");
            if (table === "profiles") {
              const wanted = new Set(names);
              return {
                data: options.profiles.filter((row) => wanted.has(row.username)),
                error: null,
              };
            }
            if (table === "mutes") {
              return {
                data: (options.mutes ?? []).filter(
                  (row) => row.muter_id === filters.muter_id && row.muted_id === filters.muted_id,
                ),
                error: null,
              };
            }
            return { data: [], error: null };
          };
          return Promise.resolve().then(run).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    inserts,
    rpcOthers,
  };
}

function mentions(inserts: { table: string; row: Row }[]) {
  return inserts.filter((entry) => entry.table === "notifications" && entry.row.kind === "mention");
}

function comments(inserts: { table: string; row: Row }[]) {
  return inserts.filter((entry) => entry.table === "comments");
}

describe("remoteAddComment reply mentions", () => {
  const profiles = [
    { id: ACTOR, username: "me" },
    { id: AUTHOR, username: "author" },
    { id: SAM, username: "sam" },
    { id: JULES, username: "jules" },
  ];

  it("notifies each mentioned user once, using the post mention shape", async () => {
    const fake = replyClient({ profiles });
    const result = await remoteAddComment(
      fake.supabase,
      ACTOR,
      "post-1",
      "  @sam @jules @sam  ",
      AUTHOR,
    );
    assert.equal(result.error, undefined);
    assert.equal(comments(fake.inserts).length, 1);
    const notes = mentions(fake.inserts);
    assert.equal(notes.length, 2);
    assert.deepEqual(
      notes.map((entry) => entry.row.recipient_id),
      [SAM, JULES],
    );
    assert.equal(notes[0]?.row.kind, "mention");
    assert.equal(notes[0]?.row.actor_id, ACTOR);
    assert.equal(notes[0]?.row.post_id, "post-1");
    assert.equal(notes[0]?.row.preview, "@sam @jules @sam");
    const rendered = groupNotifications([
      {
        id: "n1",
        recipientId: SAM,
        actorId: ACTOR,
        kind: "mention",
        postId: "post-1",
        preview: "@sam @jules @sam",
        href: null,
        createdAt: "2026-10-21T00:00:00.000Z",
        read: false,
      } satisfies Notification,
    ]);
    assert.equal(rendered[0]?.postId, "post-1");
    assert.equal(groupHeadline("mention", ["Sam"]), "Sam mentioned you");
  });

  it("does not notify the author and does not ask can_interact about them", async () => {
    const fake = replyClient({ profiles });
    const result = await remoteAddComment(fake.supabase, ACTOR, "post-1", "@me @sam", AUTHOR);
    assert.equal(result.error, undefined);
    assert.deepEqual(
      mentions(fake.inserts).map((entry) => entry.row.recipient_id),
      [SAM],
    );
    assert.equal(fake.rpcOthers.includes(ACTOR), false);
  });

  it("skips a mentioned user who blocked the author", async () => {
    const fake = replyClient({ profiles, blocked: [SAM] });
    const result = await remoteAddComment(fake.supabase, ACTOR, "post-1", "@sam @jules", AUTHOR);
    assert.equal(result.error, undefined);
    assert.deepEqual(
      mentions(fake.inserts).map((entry) => entry.row.recipient_id),
      [JULES],
    );
  });

  it("skips a mentioned user who muted the author", async () => {
    const fake = replyClient({
      profiles,
      mutes: [{ muter_id: SAM, muted_id: ACTOR }],
    });
    const result = await remoteAddComment(fake.supabase, ACTOR, "post-1", "@sam @jules", AUTHOR);
    assert.equal(result.error, undefined);
    assert.deepEqual(
      mentions(fake.inserts).map((entry) => entry.row.recipient_id),
      [JULES],
    );
  });

  it("does not also mention the post author who gets the reply notification", async () => {
    const fake = replyClient({ profiles });
    const result = await remoteAddComment(fake.supabase, ACTOR, "post-1", "@author @sam", AUTHOR);
    assert.equal(result.error, undefined);
    const replyNotes = fake.inserts.filter(
      (entry) => entry.table === "notifications" && entry.row.kind === "comment",
    );
    assert.equal(replyNotes.length, 1);
    assert.equal(replyNotes[0]?.row.recipient_id, AUTHOR);
    assert.deepEqual(
      mentions(fake.inserts).map((entry) => entry.row.recipient_id),
      [SAM],
    );
  });

  it("still mentions people when the reply is on your own post", async () => {
    const fake = replyClient({ profiles });
    const result = await remoteAddComment(fake.supabase, ACTOR, "post-1", "@sam", ACTOR);
    assert.equal(result.error, undefined);
    assert.equal(
      fake.inserts.some((entry) => entry.row.kind === "comment"),
      false,
    );
    assert.deepEqual(
      mentions(fake.inserts).map((entry) => entry.row.recipient_id),
      [SAM],
    );
    assert.equal(fake.rpcOthers.includes(ACTOR), false);
  });

  it("saves the reply when mention lookup or insert fails", async () => {
    const thrown = replyClient({ profiles, profileThrows: true });
    const thrownResult = await remoteAddComment(thrown.supabase, ACTOR, "post-1", "@sam", AUTHOR);
    assert.equal(thrownResult.error, undefined);
    assert.equal(comments(thrown.inserts).length, 1);
    assert.equal(mentions(thrown.inserts).length, 0);

    const rejected = replyClient({
      profiles,
      mentionInsertError: { code: "42501", message: "row-level security" },
    });
    const rejectedResult = await remoteAddComment(
      rejected.supabase,
      ACTOR,
      "post-1",
      "@sam",
      AUTHOR,
    );
    assert.equal(rejectedResult.error, undefined);
    assert.equal(rejectedResult.notice, undefined);
    assert.equal(comments(rejected.inserts).length, 1);

    const exploded = replyClient({ profiles, mentionInsertThrows: true });
    const explodedResult = await remoteAddComment(
      exploded.supabase,
      ACTOR,
      "post-1",
      "@sam",
      AUTHOR,
    );
    assert.equal(explodedResult.error, undefined);
    assert.equal(comments(exploded.inserts).length, 1);
  });
});

describe("allowReplyMention", () => {
  it("returns false for self without calling can_interact", async () => {
    let calls = 0;
    const supabase = {
      async rpc() {
        calls += 1;
        return { data: false, error: null };
      },
      from() {
        throw new Error("mutes should not be read for self");
      },
    };
    assert.equal(
      await allowReplyMention(supabase as unknown as SupabaseClient, ACTOR, ACTOR),
      false,
    );
    assert.equal(calls, 0);
  });
});
