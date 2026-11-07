import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messageLinks } from "@/lib/social/dm-inbox";
import {
  askPriceDraft,
  askPriceHref,
  canAskPrice,
  canSendPost,
  dealCardFromThread,
  handleQuery,
  postLink,
  RECENT_PARTNER_LIMIT,
  sendPostCandidates,
  sharedPostMessage,
} from "@/lib/social/send-post";
import { MESSAGE_LIMIT, type DirectMessage, type Post, type Profile } from "@/lib/social/types";

function person(id: string, username: string, displayName = username): Profile {
  return {
    id,
    username,
    displayName,
    bio: "",
    avatarDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-01-01T00:00:00Z",
  } as Profile;
}

function dm(id: string, senderId: string, receiverId: string, at: string, content = "hi"): DirectMessage {
  return { id, senderId, receiverId, content, createdAt: at, read: true, kind: "text", cardPreview: null };
}

const me = person("me", "sam");
const ana = person("ana", "ana", "Ana");
const ben = person("ben", "ben", "Ben");
const cal = person("cal", "cal", "Cal");
const dee = person("dee", "dee", "Dee");
const eve = person("eve", "eve", "Eve");

const POST_ID = "11111111-2222-4333-8444-555555555555";

describe("send sheet candidates", () => {
  const base = {
    viewerId: me.id,
    blockedIds: [] as string[],
    safetyAccounts: [] as Profile[],
    profiles: [me, ana, ben, cal, dee, eve],
    following: [dee, cal],
    query: "",
  };

  it("lists recent DM partners first, newest thread first, each once", () => {
    const messages = [
      dm("1", me.id, ana.id, "2026-10-01T10:00:00Z"),
      dm("2", ben.id, me.id, "2026-10-03T10:00:00Z"),
      dm("3", me.id, ana.id, "2026-10-02T10:00:00Z"),
      dm("4", cal.id, me.id, "2026-09-01T10:00:00Z"),
    ];
    const { recent, others } = sendPostCandidates({ ...base, messages });
    assert.deepEqual(recent.map((p) => p.username), ["ben", "ana", "cal"]);
    // Cal is a recent partner, so Following shows only Dee.
    assert.deepEqual(others.map((p) => p.username), ["dee"]);
  });

  it("caps recent partners", () => {
    const people = Array.from({ length: 12 }, (_, i) => person(`p${i}`, `p${i}`));
    const messages = people.map((p, i) => dm(`m${i}`, p.id, me.id, `2026-10-${String(i + 10)}T10:00:00Z`));
    const { recent } = sendPostCandidates({ ...base, profiles: [me, ...people], following: [], messages });
    assert.equal(recent.length, RECENT_PARTNER_LIMIT);
    assert.equal(recent[0].username, "p11");
  });

  it("hides blocked and safety accounts, and yourself", () => {
    const messages = [
      dm("1", me.id, ana.id, "2026-10-01T10:00:00Z"),
      dm("2", ben.id, me.id, "2026-10-03T10:00:00Z"),
      dm("3", me.id, me.id, "2026-10-04T10:00:00Z"),
    ];
    const { recent, others } = sendPostCandidates({
      ...base,
      messages,
      blockedIds: [ben.id],
      safetyAccounts: [dee],
      query: "",
    });
    assert.deepEqual(recent.map((p) => p.username), ["ana"]);
    assert.deepEqual(others.map((p) => p.username), ["cal"]);
    const searched = sendPostCandidates({ ...base, messages, blockedIds: [ben.id], safetyAccounts: [dee], query: "e" });
    const names = [...searched.recent, ...searched.others].map((p) => p.username);
    assert.ok(!names.includes("ben"));
    assert.ok(!names.includes("dee"));
    assert.ok(!names.includes("sam"));
    assert.ok(names.includes("eve"));
  });

  it("searches by name or handle, with or without @", () => {
    const { recent, others } = sendPostCandidates({ ...base, messages: [], query: "@Ev" });
    assert.deepEqual([...recent, ...others].map((p) => p.username), ["eve"]);
  });

  it("only reads a search from the server when it looks like a handle", () => {
    assert.equal(handleQuery("@Ana_1"), "ana_1");
    assert.equal(handleQuery("a"), null);
    assert.equal(handleQuery("two words"), null);
  });
});

describe("shared post message", () => {
  function postLinks(text: string) {
    return messageLinks(text).filter((link) => link.kind === "post");
  }

  it("is the note, a new line, then exactly one post link", () => {
    const text = sharedPostMessage(POST_ID, "  Look at this one  ");
    assert.equal(text, `Look at this one\n${postLink(POST_ID)}`);
    assert.deepEqual(postLinks(text), [{ kind: "post", id: POST_ID }]);
  });

  it("is just the link with no note", () => {
    assert.equal(sharedPostMessage(POST_ID, "   "), `https://slabhold.app/posts/${POST_ID}`);
  });

  it("drops other post links typed in the note", () => {
    const text = sharedPostMessage(POST_ID, "also slabhold.app/posts/abc and https://slabhold.app/posts/def");
    assert.deepEqual(postLinks(text), [{ kind: "post", id: POST_ID }]);
    assert.equal(text.match(/\/posts\//g)?.length, 1);
  });

  it("cuts a long note so the link still fits the message limit", () => {
    const text = sharedPostMessage(POST_ID, "x".repeat(MESSAGE_LIMIT * 2));
    assert.ok(text.length <= MESSAGE_LIMIT);
    assert.ok(text.endsWith(postLink(POST_ID)));
    assert.equal(postLinks(text).length, 1);
  });
});

describe("Ask price", () => {
  it("drafts How much? and the post link", () => {
    assert.equal(askPriceDraft(POST_ID), `How much?\nhttps://slabhold.app/posts/${POST_ID}`);
  });

  it("goes to the author's thread with the post named", () => {
    assert.equal(askPriceHref("@ana", POST_ID), `/messages/ana?post=${POST_ID}`);
  });

  it("shows on someone else's card post only", () => {
    const card = { id: "card-1" } as Post["card"];
    assert.equal(canAskPrice({ authorId: ana.id, card, hiddenAt: null }, me.id), true);
    assert.equal(canAskPrice({ authorId: me.id, card, hiddenAt: null }, me.id), false);
    assert.equal(canAskPrice({ authorId: ana.id, card: null, hiddenAt: null }, me.id), false);
    assert.equal(canAskPrice({ authorId: ana.id, card, hiddenAt: null }, null), false);
  });

  it("Send needs a login and a post that isn't hidden", () => {
    assert.equal(canSendPost({ hiddenAt: null }, me.id), true);
    assert.equal(canSendPost({ hiddenAt: null }, null), false);
    assert.equal(canSendPost({ hiddenAt: "2026-10-01T00:00:00Z" }, me.id), false);
  });
});

describe("deal sheet card from the thread", () => {
  const posts = new Map<string, Post>([
    ["p-old", { id: "p-old", card: { id: "card-held" } } as Post],
    ["p-new", { id: "p-new", card: { id: "card-sold" } } as Post],
    ["p-theirs", { id: "p-theirs", card: { id: "card-not-mine" } } as Post],
  ]);
  const findPost = (id: string) => posts.get(id);
  const cards = [
    { id: "card-held", sellPrice: null, sellDate: null },
    { id: "card-sold", sellPrice: 100, sellDate: "2026-10-01" },
    { id: "card-other", sellPrice: null, sellDate: null },
  ];

  it("picks the newest linked post whose card you still hold", () => {
    const thread = [
      dm("1", ana.id, me.id, "2026-10-01T10:00:00Z", `${postLink("p-old")}`),
      dm("2", ana.id, me.id, "2026-10-02T10:00:00Z", `How much?\n${postLink("p-new")}`),
      dm("3", ana.id, me.id, "2026-10-03T10:00:00Z", `${postLink("p-theirs")}`),
    ];
    assert.equal(dealCardFromThread(thread, findPost, cards), "card-held");
  });

  it("is null with no owned unsold card", () => {
    const thread = [dm("1", ana.id, me.id, "2026-10-02T10:00:00Z", postLink("p-new"))];
    assert.equal(dealCardFromThread(thread, findPost, cards), null);
    assert.equal(dealCardFromThread([], findPost, cards), null);
  });
});

describe("messageLinks is unchanged", () => {
  it("still reads post and card links the same way", () => {
    assert.deepEqual(messageLinks(`How much?\nhttps://slabhold.app/posts/${POST_ID}`), [
      { kind: "post", id: POST_ID },
    ]);
    assert.deepEqual(messageLinks("slabhold.app/u/ana/cards/c-1 and https://www.slabhold.vercel.app/posts/abc."), [
      { kind: "card", username: "ana", cardId: "c-1" },
      { kind: "post", id: "abc" },
    ]);
    assert.deepEqual(messageLinks("notslabhold.app/posts/abc"), []);
  });
});
