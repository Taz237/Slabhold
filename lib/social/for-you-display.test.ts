import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  isReleaseNotePost,
  presentForYouFeed,
  RELEASE_NOTE_HANDLE,
  whatsNewLabel,
  type ForYouSource,
} from "./for-you-display";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function row(
  partial: Partial<ForYouSource["post"]> & Pick<ForYouSource["post"], "id" | "authorId" | "body">,
  extra: { key?: string; repostedBy?: { id: string } | null } = {},
): ForYouSource {
  return {
    key: extra.key ?? `post:${partial.id}`,
    repostedBy: extra.repostedBy ?? null,
    post: {
      imageDataUrl: null,
      card: null,
      postType: "post",
      createdAt: "2026-10-22T00:00:00.000Z",
      ...partial,
    },
  };
}

const names: Record<string, string> = {
  bot: "grokbotreview",
  updates: "slabholdupdates",
  maya: "maya",
  kyle: "kyleeshaye444",
};

describe("For You display", () => {
  it("drops duplicate text only inside release notes", () => {
    const items = [
      row({ id: "new-scroll", authorId: "bot", body: "Keep scrolling!", createdAt: "2026-10-22T02:00:00.000Z" }),
      row({ id: "maya", authorId: "maya", body: "Mail day pickup", createdAt: "2026-10-22T01:00:00.000Z" }),
      row({
        id: "old-scroll",
        authorId: "bot",
        body: "  Keep scrolling!  ",
        createdAt: "2026-10-21T02:00:00.000Z",
      }),
    ];
    const before = items.map((item) => item.post.id);
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.deepEqual(items.map((item) => item.post.id), before);
    const card = shown.find((entry) => entry.kind === "whats-new");
    assert.equal(card?.kind, "whats-new");
    if (card?.kind !== "whats-new") return;
    assert.deepEqual(
      card.items.map((item) => item.post.id),
      ["new-scroll"],
    );
    assert.equal(whatsNewLabel(card.items.length), "What's new (1)");
    assert.equal(
      shown.filter((entry) => entry.kind === "post").map((entry) => entry.item.post.id).join(),
      "maya",
    );
  });

  it("shows both collector posts with the same text", () => {
    const items = [
      row({ id: "first", authorId: "maya", body: "Nice card" }),
      row({ id: "again", authorId: "maya", body: "Nice card" }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.deepEqual(
      shown.map((entry) => (entry.kind === "post" ? entry.item.post.id : "card")),
      ["first", "again"],
    );
  });

  it("shows both Mail Days with the same caption", () => {
    const items = [
      row({ id: "mail-a", authorId: "kyle", body: "New card testing mail day", postType: "mail_day", card: { id: "a" } }),
      row({ id: "mail-b", authorId: "kyle", body: "New card testing mail day", postType: "mail_day", card: { id: "b" } }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.deepEqual(
      shown.map((entry) => (entry.kind === "post" ? entry.item.post.id : "card")),
      ["mail-a", "mail-b"],
    );
  });

  it("shows a repost and its original", () => {
    const items = [
      row(
        { id: "note", authorId: "bot", body: "New on Slabhold: quote posts." },
        { key: "repost:maya:note", repostedBy: { id: "maya" } },
      ),
      row({ id: "note", authorId: "bot", body: "New on Slabhold: quote posts." }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.equal(shown.filter((entry) => entry.kind === "post").length, 1);
    assert.equal(shown[0]?.kind, "post");
    if (shown[0]?.kind === "post") assert.equal(shown[0].item.key, "repost:maya:note");
    const card = shown.find((entry) => entry.kind === "whats-new");
    assert.equal(card?.kind, "whats-new");
    if (card?.kind === "whats-new") assert.deepEqual(card.items.map((item) => item.key), ["post:note"]);
  });

  it("keeps the same text when a different person posted it", () => {
    const items = [
      row({ id: "a", authorId: "maya", body: "Nice card" }),
      row({ id: "b", authorId: "kyle", body: "Nice card" }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.deepEqual(
      shown.map((entry) => (entry.kind === "post" ? entry.item.post.id : "card")),
      ["a", "b"],
    );
  });

  it("does not treat empty captions as duplicates", () => {
    const items = [
      row({ id: "pic-a", authorId: "maya", body: "   ", imageDataUrl: "https://example.com/a.jpg" }),
      row({ id: "pic-b", authorId: "maya", body: "", imageDataUrl: "https://example.com/b.jpg" }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.equal(shown.length, 2);
  });

  it("puts the newest collector post first and groups release notes into one card", () => {
    const items = [
      row({ id: "note-1", authorId: "bot", body: "New on Slabhold: card pages open faster." }),
      row({ id: "sell", authorId: "maya", body: "Have a few of these i would sell" }),
      row({ id: "note-2", authorId: "bot", body: "Keep scrolling! Your feed loads older posts." }),
      row({ id: "mail", authorId: "kyle", body: "New card testing mail day", postType: "mail_day", card: { id: "card" } }),
      row({ id: "note-3", authorId: "bot", body: "The Timeline tab is now called Home." }),
      row({ id: "older", authorId: "maya", body: "Looking to sell" }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.equal(shown[0]?.kind, "post");
    if (shown[0]?.kind === "post") assert.equal(shown[0].item.post.id, "sell");
    assert.equal(shown[1]?.kind, "whats-new");
    if (shown[1]?.kind === "whats-new") {
      assert.deepEqual(
        shown[1].items.map((item) => item.post.id),
        ["note-1", "note-2", "note-3"],
      );
    }
    assert.deepEqual(
      shown.slice(2).map((entry) => (entry.kind === "post" ? entry.item.post.id : entry.kind)),
      ["mail", "older"],
    );
  });

  it("treats text from the current and former updates handles as release notes", () => {
    assert.equal(RELEASE_NOTE_HANDLE, "slabholdupdates");
    assert.equal(
      isReleaseNotePost({ username: "slabholdupdates", body: "New on Slabhold: hello." }),
      true,
    );
    assert.equal(
      isReleaseNotePost({ username: "@GrokBotReview", body: "New on Slabhold: hello." }),
      true,
    );
    const items = [
      row({ id: "note", authorId: "updates", body: "New on Slabhold: sharing a post opens the share sheet." }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.equal(shown[0]?.kind, "whats-new");
  });

  it("leaves a photo post from @grokbotreview in the feed", () => {
    assert.equal(
      isReleaseNotePost({
        username: "@grokbotreview",
        body: "#NewProfilePic",
        imageUrl: "https://example.com/pic.jpg",
      }),
      false,
    );
    assert.equal(
      isReleaseNotePost({
        username: "grokbotreview",
        body: "New on Slabhold: Mail Day.",
        reposted: true,
      }),
      false,
    );
    assert.equal(
      isReleaseNotePost({
        username: "grokbotreview",
        body: "New on Slabhold: quoting this.",
        quotedPostId: "post-1",
      }),
      false,
    );
    const items = [
      row({ id: "pic", authorId: "bot", body: "#NewProfilePic", imageDataUrl: "https://example.com/pic.jpg" }),
      row({ id: "note", authorId: "bot", body: "New on Slabhold: sharing a post opens the share sheet." }),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.equal(shown[0]?.kind, "post");
    if (shown[0]?.kind === "post") assert.equal(shown[0].item.post.id, "pic");
    assert.equal(shown[1]?.kind, "whats-new");
  });

  it("keeps a repost of a release note with the collector who reposted it", () => {
    const items = [
      row(
        { id: "note", authorId: "bot", body: "New on Slabhold: quote posts." },
        { key: "repost:maya:note", repostedBy: { id: "maya" } },
      ),
    ];
    const shown = presentForYouFeed(items, (id) => names[id]);
    assert.equal(shown.length, 1);
    assert.equal(shown[0]?.kind, "post");
  });

  it("only changes how For You is drawn", () => {
    const view = read("components/feed-view.tsx");
    const loader = read("lib/social/load-feed-page.ts");
    assert.match(view, /lane === "foryou"\s*\?\s*presentForYouFeed/);
    assert.match(view, /showsNewPosts\(/);
    assert.match(view, /<LoadMore/);
    assert.match(view, /onLoadMore=\{activePage\.loadMore\}/);
    assert.doesNotMatch(loader, /grokbotreview|slabholdupdates/);
    const card = read("components/whats-new-card.tsx");
    assert.match(card, /RELEASE_NOTE_HANDLE/);
    assert.doesNotMatch(card, /grokbotreview/);
    assert.doesNotMatch(read("lib/social/for-you-display.ts"), /\.delete\(|delete from/i);
  });
});
