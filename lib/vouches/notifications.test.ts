import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupNotifications, noticeCanShow, notificationGroupKey, unreadGroupCount } from "@/lib/social/group-notifications";
import { groupHeadline, notificationAction } from "@/lib/social/notification-copy";
import { groupHref, notificationHref } from "@/lib/social/notification-href";
import type { Notification, Profile } from "@/lib/social/types";

const VOUCH = "00000000-0000-4000-8000-000000000050";

function note(partial: Partial<Notification>): Notification {
  return {
    id: "n1",
    recipientId: "me",
    actorId: "kev",
    kind: "vouch",
    postId: null,
    preview: null,
    href: "/u/donnie/vouches",
    metadata: { vouch_id: VOUCH, rating: "positive" },
    createdAt: "2026-11-28T12:00:00.000Z",
    read: false,
    ...partial,
  };
}

const authors = new Map<string, Profile>([
  ["kev", { id: "kev", username: "kev", displayName: "Kev Marlow" } as Profile],
  ["sam", { id: "sam", username: "sam", displayName: "Sam Ortiz" } as Profile],
]);

describe("vouch notification links", () => {
  it("opens the stored vouches page first, at the vouch when its id is known", () => {
    assert.equal(notificationHref({ kind: "vouch", postId: null, storedHref: "/u/donnie/vouches", vouchId: VOUCH }), `/u/donnie/vouches#vouch-${VOUCH}`);
    assert.equal(notificationHref({ kind: "vouch_reply", postId: null, storedHref: "/u/sam/vouches", vouchId: VOUCH }), `/u/sam/vouches#vouch-${VOUCH}`);
    assert.equal(notificationHref({ kind: "vouch", postId: null, storedHref: "/u/donnie/vouches" }), "/u/donnie/vouches");
  });

  it("without a stored link: your own page for a vouch, the replier's page for a reply", () => {
    assert.equal(notificationHref({ kind: "vouch", postId: null, actorUsername: "kev", viewerUsername: "donnie" }), "/u/donnie/vouches");
    assert.equal(notificationHref({ kind: "vouch_reply", postId: null, actorUsername: "@sam", viewerUsername: "donnie" }), "/u/sam/vouches");
  });

  it("never follows a stored link that isn't a vouches page", () => {
    for (const bad of ["https://evil.example/u/x/vouches", "//evil.example", "/admin/reports", "/u/donnie/vouches/../../admin", "javascript:alert(1)", ""]) {
      assert.equal(notificationHref({ kind: "vouch", postId: null, storedHref: bad, viewerUsername: "donnie" }), "/u/donnie/vouches", bad);
    }
  });

  it("falls back to your profile when nobody is left to point at", () => {
    assert.equal(notificationHref({ kind: "vouch", postId: null }), "/profile");
    assert.equal(notificationHref({ kind: "vouch_reply", postId: null, viewerUsername: "donnie" }), "/profile");
    assert.equal(notificationHref({ kind: "vouch_reply", postId: null, vouchId: VOUCH }), "/profile");
  });

  it("a row's link uses the newest notice", () => {
    const [group] = groupNotifications([note({})]);
    assert.equal(groupHref(group!, authors, "donnie"), `/u/donnie/vouches#vouch-${VOUCH}`);
    const [reply] = groupNotifications([note({ kind: "vouch_reply", actorId: "sam", href: null })]);
    assert.equal(groupHref(reply!, authors, "donnie"), `/u/sam/vouches#vouch-${VOUCH}`);
    // The replier's profile hasn't loaded and nothing is stored: still a safe place, never a crash.
    assert.equal(groupHref(reply!, new Map(), "donnie"), "/profile");
  });

  it("leaves every other kind where it was", () => {
    assert.equal(notificationHref({ kind: "follow", postId: null, actorUsername: "kev" }), "/u/kev");
    assert.equal(notificationHref({ kind: "like", postId: "p1" }), "/posts/p1");
    assert.equal(notificationHref({ kind: "dm_reaction", postId: null, actorUsername: "kev" }), "/messages/kev");
    assert.equal(notificationHref({ kind: "like", postId: null, storedHref: "/u/donnie/vouches" }), "/");
  });
});

describe("vouch notification rows", () => {
  it("says who vouched and who replied", () => {
    assert.equal(notificationAction("vouch"), "vouched for you");
    assert.equal(notificationAction("vouch_reply"), "replied to your vouch");
    assert.equal(groupHeadline("vouch", ["@kev"]), "@kev vouched for you");
    assert.equal(groupHeadline("vouch_reply", ["@sam"]), "@sam replied to your vouch");
    assert.equal(notificationAction("follow"), "followed you");
  });

  it("groups vouches together like follows, not by post", () => {
    const groups = groupNotifications([
      note({ id: "n1", actorId: "kev", createdAt: "2026-11-28T12:00:00.000Z" }),
      note({ id: "n2", actorId: "sam", createdAt: "2026-11-28T09:00:00.000Z", metadata: { vouch_id: "00000000-0000-4000-8000-000000000051", rating: "neutral" } }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0]?.actorIds, ["kev", "sam"]);
    assert.equal(groupHeadline("vouch", ["@kev", "@sam"]), "@kev and @sam vouched for you");
    assert.equal(notificationGroupKey(note({})), "vouch");
    assert.equal(notificationGroupKey(note({ postId: "p1" })), "vouch", "never keyed by a post");
  });

  it("keeps each reply to your vouch as its own row, since each opens a different page", () => {
    const groups = groupNotifications([
      note({ id: "n1", kind: "vouch_reply", actorId: "kev", href: "/u/kev/vouches" }),
      note({ id: "n2", kind: "vouch_reply", actorId: "sam", href: "/u/sam/vouches", createdAt: "2026-11-28T11:00:00.000Z" }),
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => groupHref(group, authors, "donnie")), [`/u/kev/vouches#vouch-${VOUCH}`, `/u/sam/vouches#vouch-${VOUCH}`]);
  });

  it("doesn't mix vouches into the follows row", () => {
    const groups = groupNotifications([note({ id: "n1" }), note({ id: "n2", kind: "follow", href: null, metadata: null })]);
    assert.deepEqual(groups.map((group) => group.kind).sort(), ["follow", "vouch"]);
  });
});

describe("a vouch notice whose sender or vouch is gone", () => {
  const orphans = [
    note({ id: "o1", actorId: null }),
    note({ id: "o2", metadata: null }),
    note({ id: "o3", metadata: {} }),
    note({ id: "o4", metadata: { vouch_id: "" } }),
    note({ id: "o5", metadata: { vouch_id: null } }),
    note({ id: "o6", kind: "vouch_reply", actorId: null }),
    note({ id: "o7", kind: "vouch_reply", metadata: undefined }),
  ];

  it("is skipped quietly: no row, no crash, and it doesn't light up the bell", () => {
    for (const orphan of orphans) assert.equal(noticeCanShow(orphan), false, orphan.id);
    assert.deepEqual(groupNotifications(orphans), []);
    assert.equal(unreadGroupCount(orphans), 0);
    const mixed = groupNotifications([...orphans, note({ id: "ok" }), note({ id: "like", kind: "like", postId: "p1", href: null, metadata: null })]);
    assert.deepEqual(mixed.map((group) => group.kind).sort(), ["like", "vouch"]);
    assert.deepEqual(mixed.find((group) => group.kind === "vouch")?.notes.map((item) => item.id), ["ok"]);
    assert.equal(unreadGroupCount([...orphans, note({ id: "ok" })]), 1);
  });

  it("never hides any other kind, with or without an actor", () => {
    for (const kind of ["like", "comment", "follow", "repost", "mention", "quote", "want_alert", "deal_confirm", "dm_reaction", "poll_ended"] as const) {
      assert.equal(noticeCanShow(note({ kind, actorId: null, metadata: null })), true, kind);
    }
    assert.equal(groupNotifications([note({ kind: "poll_ended", actorId: null, metadata: null, postId: "p1" })]).length, 1);
  });

  it("a sender whose profile hasn't loaded still makes a row that opens somewhere safe", () => {
    const [group] = groupNotifications([note({ actorId: "ghost" })]);
    assert.ok(group);
    assert.equal(groupHref(group, new Map(), "donnie"), `/u/donnie/vouches#vouch-${VOUCH}`);
    assert.equal(groupHref(group, new Map()), `/u/donnie/vouches#vouch-${VOUCH}`, "the stored link is enough");
    const [bare] = groupNotifications([note({ actorId: "ghost", href: null })]);
    assert.equal(groupHref(bare!, new Map()), "/profile");
  });
});
