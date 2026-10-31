import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { localMarkNotificationsRead, type LocalDb } from "./local-db";
import { remoteMarkNotificationsRead } from "./remote";
import {
  groupHeadline,
  groupNotifications,
  groupStaysHighlighted,
  unreadGroupCount,
  unreadNotificationIds,
} from "./group-notifications";
import type { Notification } from "./types";

function note(partial: Partial<Notification> & Pick<Notification, "id">): Notification {
  return {
    recipientId: "me",
    actorId: "actor",
    kind: "like",
    postId: "post-1",
    preview: "Nice card",
    href: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    read: false,
    ...partial,
  };
}

describe("grouped notifications", () => {
  it("reads as DonnieTaz and 4 others liked your post", () => {
    const names = ["DonnieTaz", "Jordan", "Sam", "Maya", "Alex"];
    assert.equal(groupHeadline("like", names), "DonnieTaz and 4 others liked your post");
  });

  it("names both people when only two liked the post", () => {
    assert.equal(
      groupHeadline("like", ["DonnieTaz", "Jordan"]),
      "DonnieTaz and Jordan liked your post",
    );
  });

  it("groups likes on the same post and keeps other posts separate", () => {
    const groups = groupNotifications([
      note({ id: "n5", actorId: "a5", createdAt: "2026-10-05T12:00:00.000Z" }),
      note({ id: "n4", actorId: "a4", createdAt: "2026-10-05T10:00:00.000Z" }),
      note({
        id: "other",
        kind: "like",
        postId: "post-2",
        actorId: "a9",
        createdAt: "2026-10-05T09:00:00.000Z",
      }),
      note({ id: "n3", actorId: "a3", createdAt: "2026-10-05T08:00:00.000Z" }),
      note({ id: "n2", actorId: "a2", createdAt: "2026-10-05T06:00:00.000Z" }),
      note({ id: "n1", actorId: "a1", createdAt: "2026-10-05T04:00:00.000Z" }),
    ]);
    const main = groups.find((group) => group.postId === "post-1");
    assert.ok(main);
    assert.equal(main.notes.length, 5);
    assert.deepEqual(main.actorIds, ["a5", "a4", "a3", "a2", "a1"]);
    assert.equal(groups.length, 2);
  });

  it("counts a repeat actor once", () => {
    const groups = groupNotifications([
      note({ id: "c2", kind: "comment", actorId: "a1", createdAt: "2026-10-02T00:00:00.000Z", preview: "Second" }),
      note({ id: "c1", kind: "comment", actorId: "a1", createdAt: "2026-10-01T00:00:00.000Z", preview: "First" }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0]?.actorIds, ["a1"]);
    assert.equal(groups[0]?.preview, "Second");
    assert.equal(groupHeadline("comment", ["DonnieTaz"]), "DonnieTaz commented on your post");
  });

  it("groups follows and leaves each want alert on its own row", () => {
    const groups = groupNotifications([
      note({ id: "f2", kind: "follow", postId: null, actorId: "b", createdAt: "2026-10-02T00:00:00.000Z", preview: null }),
      note({
        id: "w2",
        kind: "want_alert",
        actorId: null,
        postId: null,
        preview: "Jordan Love sold for $40",
        href: "/cards/1",
        createdAt: "2026-10-02T00:00:00.000Z",
      }),
      note({ id: "f1", kind: "follow", postId: null, actorId: "a", createdAt: "2026-10-01T00:00:00.000Z", preview: null }),
      note({
        id: "w1",
        kind: "want_alert",
        actorId: null,
        postId: null,
        preview: "Jordan Love sold for $30",
        href: "/cards/1",
        createdAt: "2026-10-01T00:00:00.000Z",
      }),
    ]);
    const follows = groups.filter((group) => group.kind === "follow");
    const wants = groups.filter((group) => group.kind === "want_alert");
    assert.equal(follows.length, 1);
    assert.equal(follows[0]?.notes.length, 2);
    assert.equal(wants.length, 2);
  });

  it("counts three likes on one post as one unread row", () => {
    const likes = [
      note({ id: "l1", actorId: "a", createdAt: "2026-10-21T12:00:00.000Z" }),
      note({ id: "l2", actorId: "b", createdAt: "2026-10-21T12:05:00.000Z" }),
      note({ id: "l3", actorId: "c", createdAt: "2026-10-21T12:10:00.000Z" }),
    ];
    const groups = groupNotifications(likes);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.read, false);
    assert.equal(groups[0]?.notes.length, 3);
    assert.equal(unreadGroupCount(likes), 1);
  });

  it("keeps the row highlighted after those likes are marked read", () => {
    const likes = [
      note({ id: "l1", actorId: "a", createdAt: "2026-10-21T12:00:00.000Z" }),
      note({ id: "l2", actorId: "b", createdAt: "2026-10-21T12:05:00.000Z" }),
      note({ id: "l3", actorId: "c", createdAt: "2026-10-21T12:10:00.000Z" }),
    ];
    const unreadOnOpen = new Set(unreadNotificationIds(likes));
    const marked = likes.map((item) => ({ ...item, read: true }));
    const groups = groupNotifications(marked);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.read, true);
    assert.equal(unreadGroupCount(marked), 0);
    assert.equal(groupStaysHighlighted(groups[0]!, null), false);
    assert.equal(groupStaysHighlighted(groups[0]!, unreadOnOpen), true);
  });

  it("does not group notices more than 24 hours apart", () => {
    const groups = groupNotifications([
      note({ id: "now", actorId: "a", createdAt: "2026-10-21T12:00:00.000Z" }),
      note({ id: "mid", actorId: "b", createdAt: "2026-10-20T16:00:00.000Z" }),
      note({ id: "old", actorId: "c", createdAt: "2026-10-20T11:59:59.999Z" }),
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups[0]?.notes.map((item) => item.id),
      ["now", "mid"],
    );
    assert.deepEqual(
      groups[1]?.notes.map((item) => item.id),
      ["old"],
    );
    assert.equal(unreadGroupCount(groups.flatMap((group) => group.notes)), 2);
  });

  it("keeps read and unread notices in separate groups", () => {
    const notes = [
      note({ id: "u2", actorId: "a", read: false, createdAt: "2026-10-21T12:00:00.000Z" }),
      note({ id: "r1", actorId: "b", read: true, createdAt: "2026-10-21T11:30:00.000Z" }),
      note({ id: "u1", actorId: "c", read: false, createdAt: "2026-10-21T11:00:00.000Z" }),
    ];
    const groups = groupNotifications(notes);
    assert.equal(groups.length, 2);
    const unread = groups.find((group) => !group.read);
    const read = groups.find((group) => group.read);
    assert.deepEqual(
      unread?.notes.map((item) => item.id),
      ["u2", "u1"],
    );
    assert.deepEqual(
      read?.notes.map((item) => item.id),
      ["r1"],
    );
    assert.equal(unreadGroupCount(notes), 1);
  });

  it("leaves a notice that arrives after the snapshot unread", () => {
    const opened = [note({ id: "seen", actorId: "a", createdAt: "2026-10-21T12:00:00.000Z" })];
    const snapshot = unreadNotificationIds(opened);
    const db: LocalDb = {
      users: [],
      sessionUserId: "me",
      follows: [],
      posts: [],
      likes: [],
      reposts: [],
      comments: [],
      messages: [],
      collections: {},
      notifications: [
        ...opened,
        note({ id: "later", actorId: "b", createdAt: "2026-10-21T12:30:00.000Z" }),
      ],
    };
    const marked = localMarkNotificationsRead(db, snapshot);
    const seen = marked.notifications.find((item) => item.id === "seen");
    const later = marked.notifications.find((item) => item.id === "later");
    assert.equal(seen?.read, true);
    assert.equal(later?.read, false);
    assert.equal(unreadGroupCount(marked.notifications), 1);
    const saved = new Set(snapshot);
    const groups = groupNotifications(marked.notifications);
    const seenGroup = groups.find((group) => group.notes.some((item) => item.id === "seen"));
    const laterGroup = groups.find((group) => group.notes.some((item) => item.id === "later"));
    assert.equal(seenGroup?.read, true);
    assert.equal(laterGroup?.read, false);
    assert.equal(groupStaysHighlighted(seenGroup!, saved), true);
    assert.equal(groupStaysHighlighted(laterGroup!, saved), true);
  });

  it("tells the server to mark only the ids from the snapshot", async () => {
    const filters: { op: string; column: string; value: unknown }[] = [];
    const query = {
      eq(column: string, value: unknown) {
        filters.push({ op: "eq", column, value });
        return query;
      },
      in(column: string, value: unknown) {
        filters.push({ op: "in", column, value });
        return query;
      },
      then(resolve: (value: { error: null }) => unknown) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    const supabase = {
      from(table: string) {
        assert.equal(table, "notifications");
        return {
          update(patch: { read: boolean }) {
            assert.deepEqual(patch, { read: true });
            return query;
          },
        };
      },
    };
    const result = await remoteMarkNotificationsRead(supabase as never, "me", ["seen"]);
    assert.deepEqual(result, {});
    assert.deepEqual(filters, [
      { op: "eq", column: "recipient_id", value: "me" },
      { op: "eq", column: "read", value: false },
      { op: "in", column: "id", value: ["seen"] },
    ]);
  });
});

describe("notification bell wiring", () => {
  it("counts grouped rows and highlights the ones that were unread on open", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const view = readFileSync(join(process.cwd(), "components/notifications-view.tsx"), "utf8");
    assert.match(provider, /useMemo\(\(\) => unreadGroupCount\(notifications\), \[notifications\]\)/);
    assert.match(view, /groupStaysHighlighted\(/);
    assert.match(view, /bg-sky-500\/15/);
    assert.match(view, /rounded-full bg-sky-500/);
    assert.match(view, /markNotificationsRead\(\[\.\.\.ids\]\)/);
    // Opening the list reads its newest page and unread rows, then marks them read.
    const refreshAt = view.indexOf("await refreshInbox()");
    const markAt = view.indexOf("markNotificationsRead([...ids])");
    assert.ok(refreshAt !== -1 && markAt > refreshAt);
  });
});
