import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { clearComposeDraft, takeComposeDraft } from "./compose-draft";
import { inlinePollButton, POLL_COMPOSE_HREF, startPollInComposer } from "./inline-poll";

const plain = { pollsOn: true, quoting: false, posts: 1, photos: 0, gif: false, video: false, card: false };

describe("the home feed's poll button", () => {
  it("shows on a plain new post once polls are on", () => {
    assert.equal(inlinePollButton(plain), "on");
  });

  it("hides until the database has polls, while quoting, and on a thread", () => {
    assert.equal(inlinePollButton({ ...plain, pollsOn: false }), "hidden");
    assert.equal(inlinePollButton({ ...plain, quoting: true }), "hidden");
    assert.equal(inlinePollButton({ ...plain, posts: 2 }), "hidden");
  });

  it("rests while a photo, GIF, video or card is attached", () => {
    assert.equal(inlinePollButton({ ...plain, photos: 1 }), "disabled");
    assert.equal(inlinePollButton({ ...plain, gif: true }), "disabled");
    assert.equal(inlinePollButton({ ...plain, video: true }), "disabled");
    assert.equal(inlinePollButton({ ...plain, card: true }), "disabled");
  });

  it("hands the typed text to /compose and opens the poll editor there", () => {
    clearComposeDraft();
    const pushed: string[] = [];
    startPollInComposer("Best rookie of 2024?", (href) => pushed.push(href));
    assert.deepEqual(pushed, ["/compose?poll=1"]);
    assert.equal(POLL_COMPOSE_HREF, "/compose?poll=1");
    const draft = takeComposeDraft("new");
    assert.equal(draft?.body, "Best rookie of 2024?");
    assert.deepEqual(draft?.images, []);
  });

  it("is wired into the home feed's box by those rules, with the support check loaded lazily", () => {
    const feed = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    assert.match(feed, /<InlinePollButton state=\{/);
    assert.match(feed, /inlinePollButton\(\{\s*pollsOn,\s*quoting: false,\s*posts: 1,\s*photos: images\.length,\s*gif: Boolean\(gif\),\s*video: video\.active,\s*card: Boolean\(cardId\),/);
    assert.match(feed, /import\("@\/lib\/social\/poll-support"\)/);
    assert.doesNotMatch(feed, /from "@\/lib\/social\/poll-support"/, "never a static import");
    assert.doesNotMatch(feed, /ComposePoll/, "the poll editor lives on /compose only");
    assert.match(feed, /startPollInComposer\(body,/);
  });
});
