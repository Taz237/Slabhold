import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHARED_A_CARD,
  SHARED_A_POST,
  filterConversations,
  inboxPreviewText,
  inboxConversations,
  messageLinks,
  seenMessageId,
  threadRows,
  threadTimeLabel,
  THREAD_GAP_MS,
} from "./dm-inbox";
import type { DirectMessage, Profile } from "./types";

const me = { id: "me", username: "me", displayName: "Me" } as Profile;
const ada = { id: "ada", username: "adacards", displayName: "Ada Park" } as Profile;
const sam = { id: "sam", username: "boxbreak", displayName: "Sam Ortiz" } as Profile;

const T0 = Date.parse("2026-10-20T12:00:00.000Z");

function msg(id: string, from: string, to: string, minutes: number, extra: Partial<DirectMessage> = {}): DirectMessage {
  return {
    id,
    senderId: from,
    receiverId: to,
    content: `message ${id}`,
    createdAt: new Date(T0 + minutes * 60_000).toISOString(),
    read: false,
    ...extra,
  };
}

describe("inboxConversations", () => {
  it("groups by partner, newest thread first, and counts only unread messages sent to me", () => {
    const list = inboxConversations(
      [
        msg("1", "ada", "me", 0),
        msg("2", "me", "ada", 1),
        msg("3", "ada", "me", 2),
        msg("4", "sam", "me", 10, { read: true }),
        msg("5", "me", "sam", 11),
      ],
      [me, ada, sam],
      "me",
    );
    assert.deepEqual(
      list.map((item) => [item.person.id, item.last.id, item.unread]),
      [
        ["sam", "5", 0],
        ["ada", "3", 2],
      ],
    );
  });

  it("drops threads with someone whose profile isn't loaded", () => {
    assert.deepEqual(inboxConversations([msg("1", "ghost", "me", 0)], [me], "me"), []);
  });
});

describe("filterConversations", () => {
  const list = inboxConversations(
    [msg("1", "ada", "me", 0, { content: "Is the Wemby still around?" }), msg("2", "sam", "me", 1)],
    [me, ada, sam],
    "me",
  );

  it("matches name, handle with or without @, and the last message, ignoring case", () => {
    assert.deepEqual(filterConversations(list, "ada").map((item) => item.person.id), ["ada"]);
    assert.deepEqual(filterConversations(list, "@BOXB").map((item) => item.person.id), ["sam"]);
    assert.deepEqual(filterConversations(list, "wemby").map((item) => item.person.id), ["ada"]);
  });

  it("keeps everything for a blank query", () => {
    assert.equal(filterConversations(list, "  ").length, 2);
  });
});

describe("threadRows", () => {
  it("groups back-to-back messages from one sender and marks the first and last bubble", () => {
    const rows = threadRows(
      [msg("1", "ada", "me", 0), msg("2", "ada", "me", 1), msg("3", "me", "ada", 2), msg("4", "me", "ada", 3)],
      "me",
    ).filter((row) => row.kind === "message");
    assert.deepEqual(
      rows.map((row) => [row.message.id, row.mine, row.first, row.last]),
      [
        ["1", false, true, false],
        ["2", false, false, true],
        ["3", true, true, false],
        ["4", true, false, true],
      ],
    );
  });

  it("puts a time break at the start and after a long gap, and starts a new group there", () => {
    const rows = threadRows([msg("1", "ada", "me", 0), msg("2", "ada", "me", THREAD_GAP_MS / 60_000 + 1)], "me");
    assert.deepEqual(
      rows.map((row) => (row.kind === "gap" ? "gap" : `${row.message.id}:${row.first}:${row.last}`)),
      ["gap", "1:true:true", "gap", "2:true:true"],
    );
  });

  it("returns nothing for an empty thread", () => {
    assert.deepEqual(threadRows([], "me"), []);
  });
});

describe("seenMessageId", () => {
  it("is my latest message when it is also the last in the thread and has been read", () => {
    assert.equal(seenMessageId([msg("1", "ada", "me", 0), msg("2", "me", "ada", 1, { read: true })], "me"), "2");
  });

  it("is null when the reply hasn't been read, or they wrote last", () => {
    assert.equal(seenMessageId([msg("1", "me", "ada", 0)], "me"), null);
    assert.equal(seenMessageId([msg("1", "me", "ada", 0, { read: true }), msg("2", "ada", "me", 1)], "me"), null);
    assert.equal(seenMessageId([], "me"), null);
  });
});

describe("messageLinks", () => {
  it("finds Slabhold post and card links on our own hosts", () => {
    assert.deepEqual(
      messageLinks(
        "look https://slabhold.app/posts/abc-123 and www.slabhold.app/u/adacards/cards/card-9?x=1 also https://slabhold.vercel.app/posts/def",
      ),
      [
        { kind: "post", id: "abc-123" },
        { kind: "card", username: "adacards", cardId: "card-9" },
      ],
    );
  });

  it("ignores other hosts, look-alike hosts and repeats", () => {
    assert.deepEqual(
      messageLinks("https://evil.example/posts/1 https://slabhold.app.evil.example/posts/2 https://notslabhold.app/posts/3"),
      [],
    );
    assert.deepEqual(messageLinks("slabhold.app/posts/a slabhold.app/posts/a"), [{ kind: "post", id: "a" }]);
  });

  it("returns nothing for plain text", () => {
    assert.deepEqual(messageLinks("got it, thanks"), []);
  });
});

describe("threadTimeLabel", () => {
  const now = new Date(2026, 9, 20, 18, 0);
  it("says Today or Yesterday with the time, else the date and time", () => {
    assert.equal(threadTimeLabel(new Date(2026, 9, 20, 15, 4).toISOString(), now), "Today 3:04 PM");
    assert.equal(threadTimeLabel(new Date(2026, 9, 19, 9, 30).toISOString(), now), "Yesterday 9:30 AM");
    assert.equal(threadTimeLabel(new Date(2026, 9, 2, 20, 15).toISOString(), now), "Oct 2, 8:15 PM");
    assert.equal(threadTimeLabel(new Date(2025, 0, 2, 20, 15).toISOString(), now), "Jan 2, 2025, 8:15 PM");
    assert.equal(threadTimeLabel("nope", now), "");
  });
});

describe("inbox preview for shared links", () => {
  it("reads Shared a post / Shared a card instead of the raw link", () => {
    assert.equal(SHARED_A_POST, "Shared a post");
    assert.equal(SHARED_A_CARD, "Shared a card");
    assert.equal(inboxPreviewText("https://slabhold.app/posts/abc-123"), SHARED_A_POST);
    assert.equal(inboxPreviewText("  slabhold.vercel.app/posts/abc  "), SHARED_A_POST);
    assert.equal(inboxPreviewText("https://slabhold.app/u/maya/cards/9f2c"), SHARED_A_CARD);
    assert.equal(inboxPreviewText("look at this https://slabhold.app/posts/abc"), "look at this");
    assert.equal(inboxPreviewText("https://slabhold.app/u/maya"), "https://slabhold.app/u/maya");
    assert.equal(inboxPreviewText("https://example.com/posts/abc"), "https://example.com/posts/abc");
    assert.equal(inboxPreviewText("hello"), "hello");
    assert.equal(inboxPreviewText("   "), "");
  });
});
