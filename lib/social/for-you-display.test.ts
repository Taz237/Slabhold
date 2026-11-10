import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  isReleaseNotePost,
  presentFollowingFeed,
  presentForYouFeed,
  withoutReleaseNotes,
  type ForYouSource,
} from "./for-you-display";
import { OFFICIAL_UPDATES_USER_ID, isOfficialUpdatesAccount } from "./official-updates";
import { BRAND_ACCOUNT_IDS } from "../leaderboard/brand-accounts";

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

const UPDATES = OFFICIAL_UPDATES_USER_ID;
const IMPOSTER = "11111111-1111-4111-8111-111111111111";
const BRAND = BRAND_ACCOUNT_IDS[0];

function ids(entries: { kind: string; item: ForYouSource }[]) {
  return entries.map((entry) => entry.item.post.id);
}

const lanes = [
  ["For You", presentForYouFeed],
  ["Following", presentFollowingFeed],
] as const;


describe("Home timeline display", () => {
  for (const [name, present] of lanes) {
    describe(name, () => {
      it("hides release notes and never returns a What's new entry", () => {
        const items = [
          row({ id: "note-1", authorId: UPDATES, body: "New on Slabhold: card pages open faster." }),
          row({ id: "sell", authorId: "maya", body: "Have a few of these i would sell" }),
          row({ id: "note-2", authorId: UPDATES, body: "Keep scrolling! Your feed loads older posts." }),
          row({ id: "pickup", authorId: "kyle", body: "New pickup", postType: "mail_day", card: { id: "card" } }),
          row({ id: "note-3", authorId: UPDATES, body: "The Timeline tab is now called Home." }),
          row({ id: "older", authorId: "maya", body: "Looking to sell" }),
        ];
        const before = items.map((item) => item.post.id);
        const shown = present(items);
        assert.deepEqual(items.map((item) => item.post.id), before);
        assert.ok(shown.every((entry) => entry.kind === "post"));
        assert.deepEqual(ids(shown), ["sell", "pickup", "older"]);
      });

      it("returns nothing when every row is a release note", () => {
        const shown = present([
          row({ id: "a", authorId: UPDATES, body: "New on Slabhold: one." }),
          row({ id: "b", authorId: UPDATES, body: "New on Slabhold: two." }),
        ]);
        assert.deepEqual(shown, []);
      });

      it("keeps collector posts in their exact order, duplicates included", () => {
        const items = [
          row({ id: "first", authorId: "maya", body: "Nice card" }),
          row({ id: "again", authorId: "maya", body: "Nice card" }),
          row({ id: "kyle", authorId: "kyle", body: "Nice card" }),
          row({ id: "pic-a", authorId: "maya", body: "   ", imageDataUrl: "https://example.com/a.jpg" }),
          row({ id: "pic-b", authorId: "maya", body: "", imageDataUrl: "https://example.com/b.jpg" }),
        ];
        assert.deepEqual(ids(present(items)), ["first", "again", "kyle", "pic-a", "pic-b"]);
      });

      it("shows @slabhold brand posts normally", () => {
        assert.notEqual(BRAND, UPDATES);
        const items = [
          row({ id: "brand", authorId: BRAND, body: "New on Slabhold: quote posts are live." }),
          row({ id: "note", authorId: UPDATES, body: "New on Slabhold: quote posts are live." }),
          row({ id: "maya", authorId: "maya", body: "Pickup" }),
        ];
        assert.deepEqual(ids(present(items)), ["brand", "maya"]);
      });

      it("does not hide an impostor named slabholdupdates", () => {
        const items = [
          row({ id: "note", authorId: UPDATES, body: "New on Slabhold: sharing opens the share sheet." }),
          row({ id: "copy", authorId: IMPOSTER, body: "New on Slabhold: I am slabholdupdates." }),
        ];
        assert.deepEqual(ids(present(items)), ["copy"]);
      });

      it("keeps a repost of a release note with the collector who reposted it", () => {
        const items = [
          row(
            { id: "note", authorId: UPDATES, body: "New on Slabhold: quote posts." },
            { key: "repost:maya:note", repostedBy: { id: "maya" } },
          ),
          row({ id: "note", authorId: UPDATES, body: "New on Slabhold: quote posts." }),
        ];
        const shown = present(items);
        assert.deepEqual(shown.map((entry) => entry.item.key), ["repost:maya:note"]);
      });

      it("keeps a photo or quote from the updates account", () => {
        const items = [
          row({ id: "pic", authorId: UPDATES, body: "#NewProfilePic", imageDataUrl: "https://example.com/pic.jpg" }),
          row({ id: "quote", authorId: UPDATES, body: "Look at this", quotedPostId: "post-1" }),
          row({ id: "note", authorId: UPDATES, body: "New on Slabhold: sharing opens the share sheet." }),
        ];
        assert.deepEqual(ids(present(items)), ["pic", "quote"]);
      });
    });
  }

  it("both lanes use the same filter", () => {
    const items = [
      row({ id: "note", authorId: UPDATES, body: "New on Slabhold: hello." }),
      row({ id: "maya", authorId: "maya", body: "Pickup" }),
      row({ id: "copy", authorId: IMPOSTER, body: "New on Slabhold: hello." }),
    ];
    assert.deepEqual(withoutReleaseNotes(items).map((item) => item.post.id), ["maya", "copy"]);
    assert.deepEqual(ids(presentForYouFeed(items)), ids(presentFollowingFeed(items)));
  });

  it("treats text from the updates account id as a release note", () => {
    assert.equal(UPDATES, "6d31ab97-9162-4296-876d-9e0378872fce");
    assert.equal(isReleaseNotePost({ authorId: UPDATES, body: "New on Slabhold: hello." }), true);
    assert.equal(isReleaseNotePost({ authorId: IMPOSTER, body: "New on Slabhold: hello." }), false);
    assert.equal(isReleaseNotePost({ authorId: BRAND, body: "New on Slabhold: hello." }), false);
  });

  it("does not treat a non-official uuid named slabholdupdates or grokbotreview as a release note", () => {
    const imposter = "22222222-2222-4222-8222-222222222222";
    assert.equal(isOfficialUpdatesAccount(imposter), false);
    assert.equal(isOfficialUpdatesAccount("slabholdupdates"), false);
    assert.equal(isOfficialUpdatesAccount("grokbotreview"), false);
    assert.equal(
      isReleaseNotePost({ authorId: imposter, body: "New on Slabhold: I am @slabholdupdates." }),
      false,
    );
    assert.equal(
      isReleaseNotePost({ authorId: imposter, body: "New on Slabhold: I am @grokbotreview." }),
      false,
    );
    for (const [, present] of lanes) {
      const shown = present([
        row({ id: "fake-updates", authorId: imposter, body: "New on Slabhold: I am slabholdupdates." }),
        row({ id: "fake-old", authorId: imposter, body: "New on Slabhold: I am grokbotreview." }),
      ]);
      assert.deepEqual(ids(shown), ["fake-updates", "fake-old"]);
    }
  });

  it("leaves a photo, repost, or quote from the updates account alone", () => {
    assert.equal(
      isReleaseNotePost({ authorId: UPDATES, body: "#NewProfilePic", imageUrl: "https://example.com/pic.jpg" }),
      false,
    );
    assert.equal(isReleaseNotePost({ authorId: UPDATES, body: "New on Slabhold: hi.", reposted: true }), false);
    assert.equal(
      isReleaseNotePost({ authorId: UPDATES, body: "New on Slabhold: quoting this.", quotedPostId: "post-1" }),
      false,
    );
  });

  it("removes the What's new card and filters both lanes in the feed view", () => {
    const view = read("components/feed-view.tsx");
    const loader = read("lib/social/load-feed-page.ts");
    const display = read("lib/social/for-you-display.ts");
    assert.equal(existsSync(join(process.cwd(), "components/whats-new-card.tsx")), false);
    assert.doesNotMatch(view, /WhatsNewCard|whats-new/);
    assert.doesNotMatch(display, /whats-new|whatsNewLabel|What's new/);
    assert.match(view, /lane === "foryou"\s*\?\s*presentForYouFeed\(visible\)\s*:\s*presentFollowingFeed\(visible\)/);
    assert.match(view, /showsNewPosts\(/);
    assert.match(view, /<LoadMore/);
    assert.match(view, /onLoadMore=\{activePage\.loadMore\}/);
    assert.doesNotMatch(loader, /grokbotreview|slabholdupdates/);
    assert.match(display, /isOfficialUpdatesAccount/);
    assert.doesNotMatch(display, /RELEASE_NOTE_HANDLES/);
    assert.doesNotMatch(display, /\.delete\(|delete from/i);
  });
});
