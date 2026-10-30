import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FALLBACK_ICON,
  MAX_PAYLOAD_BYTES,
  encodePayload,
  pushIcon,
  sameOriginPath,
  singlePayload,
  summaryPayload,
  testPayload,
  truncate,
  type PushActor,
} from "./payload";

const POST = "6f9a1c3e-1111-4222-8333-944455556666";
const AVATAR = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/avatars/a1/face.webp";
const jordan: PushActor = { id: "a1", displayName: "Jordan Hale", username: "jordanhale", avatarUrl: AVATAR };

function single(partial: Partial<Parameters<typeof singlePayload>[0]>) {
  return singlePayload({
    kind: "like",
    actor: jordan,
    postId: POST,
    text: "Pulled a 2018 Prizm Luka silver",
    showPreviews: true,
    badge: 3,
    ts: 1_700_000_000_000,
    ...partial,
  });
}

describe("push payload builder", () => {
  it("builds a like with the verb over the post preview", () => {
    const payload = single({});
    assert.deepEqual(payload, {
      v: 1,
      title: "Jordan Hale",
      body: "liked your post\nPulled a 2018 Prizm Luka silver",
      tag: `like:${POST}`,
      url: `/posts/${POST}`,
      kind: "like",
      badge: 3,
      renotify: true,
      ts: 1_700_000_000_000,
      icon: AVATAR,
    });
  });

  it("links each kind to the same place as the in-app list", () => {
    assert.equal(single({ kind: "follow", postId: null }).url, "/u/jordanhale");
    assert.equal(single({ kind: "follow", postId: null }).body, "followed you");
    assert.equal(single({ kind: "repost" }).url, `/posts/${POST}`);
    assert.equal(single({ kind: "comment" }).url, `/posts/${POST}`);
    assert.equal(single({ kind: "comment" }).tag, `reply:${POST}`);
    assert.equal(single({ kind: "mention" }).url, `/posts/${POST}`);
    assert.equal(single({ kind: "quote" }).url, `/posts/${POST}`);
    const dm = single({ kind: "dm", postId: null, text: "Still have the Wemby?" });
    assert.equal(dm.url, "/messages/jordanhale");
    assert.equal(dm.tag, "dm:a1");
    assert.equal(dm.body, "Still have the Wemby?");
    assert.equal(single({ kind: "dm", postId: null, messageKind: "card_preview" }).body, "Sent a card");
  });

  it("truncates previews: 80 for likes and reposts, 120 for replies, quotes, mentions and DMs", () => {
    const long = "x".repeat(300);
    const like = single({ text: long }).body.split("\n")[1]!;
    assert.equal(Array.from(like).length, 80);
    assert.ok(like.endsWith("…"));
    for (const kind of ["comment", "quote", "mention", "dm"] as const) {
      const body = single({ kind, text: long }).body;
      assert.equal(Array.from(body).length, 120, kind);
      assert.ok(body.endsWith("…"), kind);
    }
    assert.equal(truncate("  hi   there  ", 80), "hi there");
    assert.equal(Array.from(truncate("🔥".repeat(10), 5)).length, 5);
  });

  it("hides text when show previews is off", () => {
    assert.equal(single({ showPreviews: false }).body, "New like");
    assert.equal(single({ kind: "comment", showPreviews: false }).body, "New reply");
    assert.equal(single({ kind: "dm", postId: null, showPreviews: false }).body, "New message");
    assert.equal(single({ kind: "follow", postId: null, showPreviews: false }).body, "New follower");
  });

  it("keeps urls same-origin", () => {
    assert.equal(sameOriginPath("/posts/1?x=1#reply"), "/posts/1?x=1#reply");
    for (const bad of ["https://evil.test/x", "//evil.test/x", "/\\evil.test", "javascript:alert(1)", null, "posts/1"]) {
      assert.equal(sameOriginPath(bad), "/notifications", String(bad));
    }
    const sneaky = single({ kind: "follow", postId: null, actor: { ...jordan, username: "//evil.test" } });
    assert.ok(sneaky.url.startsWith("/u/"), sneaky.url);
    assert.equal(new URL(sneaky.url, "https://slabhold.app").origin, "https://slabhold.app");
  });

  it("falls back to the app icon unless the avatar is a public https image", () => {
    assert.equal(pushIcon(null), FALLBACK_ICON);
    assert.equal(pushIcon("data:image/png;base64,AAAA"), FALLBACK_ICON);
    assert.equal(pushIcon("http://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/avatars/x.png"), FALLBACK_ICON);
    assert.equal(pushIcon("https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/sign/avatars/x.png"), FALLBACK_ICON);
    assert.equal(pushIcon(AVATAR), AVATAR);
    assert.equal(single({ actor: { ...jordan, avatarUrl: null } }).icon, FALLBACK_ICON);
  });

  it("caps the encoded payload at 4 KB", () => {
    const huge = { ...single({}), body: "€".repeat(5000), title: "T".repeat(4000) };
    const json = encodePayload(huge);
    assert.ok(new TextEncoder().encode(json).length <= MAX_PAYLOAD_BYTES);
    assert.ok(MAX_PAYLOAD_BYTES <= 4096);
    const parsed = JSON.parse(json);
    assert.equal(parsed.v, 1);
    assert.equal(parsed.url, `/posts/${POST}`);
  });

  it("words summaries for 2 and N people and DM counts, as a quiet replace", () => {
    const two = summaryPayload({ kind: "like", lead: jordan, names: ["Jordan Hale", "Maya Chen"], count: 2, postId: POST, badge: 1, ts: 1 });
    assert.equal(two.title, "Slabhold");
    assert.equal(two.body, "Jordan Hale and Maya Chen liked your post");
    assert.equal(two.renotify, false);
    assert.equal(two.tag, `like:${POST}`);
    const five = summaryPayload({ kind: "like", lead: jordan, names: ["Jordan Hale", "Maya Chen"], count: 5, postId: POST, badge: 1, ts: 1 });
    assert.equal(five.body, "Jordan Hale and 4 others liked your post");
    const follows = summaryPayload({ kind: "follow", lead: jordan, names: ["Maya Chen", "Jordan Hale"], count: 3, postId: null, badge: 1, ts: 1 });
    assert.equal(follows.body, "Maya Chen and 2 others followed you");
    assert.equal(follows.url, "/u/jordanhale");
    const dms = summaryPayload({ kind: "dm", lead: jordan, names: [], count: 3, postId: null, badge: 4, ts: 1 });
    assert.equal(dms.title, "Jordan Hale");
    assert.equal(dms.body, "3 new messages from Jordan Hale");
    assert.equal(dms.url, "/messages/jordanhale");
  });

  it("has a test payload that opens notification settings", () => {
    const payload = testPayload(5);
    assert.equal(payload.title, "Push notifications are on");
    assert.equal(payload.url, "/settings/notifications");
  });
});
