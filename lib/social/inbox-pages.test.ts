import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MESSAGE_PAGE_SIZE,
  NOTIFICATION_PAGE_SIZE,
  applyInboxRefresh,
  cursorsAfterRefresh,
  emptyInboxCursors,
  keepLoadedInbox,
  inboxCursorFilter,
  loadMessagePage,
  loadNotificationPage,
  loadUnreadMessages,
  loadUnreadNotifications,
  mergeNewestPage,
  settleUnread,
} from "./inbox-pages";
import { unreadGroupCount } from "./group-notifications";
import type { DirectMessage, Notification } from "./types";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const HIDDEN = "44444444-4444-4444-8444-444444444444";

type Call = { table: string; ops: string[] };

/** Records each query's filters and returns `rows` for it. */
function fakeClient(rows: (call: Call) => unknown[] = () => []) {
  const calls: Call[] = [];
  const supabase = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then") {
              return (resolve: (value: unknown) => unknown) =>
                Promise.resolve({ data: rows(call), error: null }).then(resolve);
            }
            return (...args: unknown[]) => {
              call.ops.push(`${String(key)}:${args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(":")}`);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

function note(id: string, createdAt: string, partial: Partial<Notification> = {}): Notification {
  return {
    id,
    recipientId: VIEWER,
    actorId: OTHER,
    kind: "like",
    postId: "post-1",
    preview: null,
    href: null,
    metadata: null,
    createdAt,
    read: true,
    ...partial,
  };
}

function message(id: string, createdAt: string, partial: Partial<DirectMessage> = {}): DirectMessage {
  return {
    id,
    senderId: PARTNER,
    receiverId: VIEWER,
    content: "hi",
    createdAt,
    read: true,
    ...partial,
  };
}

function noteRow(id: string, createdAt: string, read = true) {
  return {
    id,
    recipient_id: VIEWER,
    actor_id: OTHER,
    kind: "like",
    post_id: "post-1",
    preview: null,
    href: null,
    metadata: null,
    read,
    created_at: createdAt,
  };
}

describe("inbox pages", () => {
  it("pages notifications newest first with a created_at + id cursor, one row past the page", async () => {
    const rows = Array.from({ length: NOTIFICATION_PAGE_SIZE + 1 }, (_, index) =>
      noteRow(`n${String(index).padStart(3, "0")}`, `2026-10-30T12:${String(59 - (index % 60)).padStart(2, "0")}:00.000Z`),
    );
    const { supabase, calls } = fakeClient(() => rows);
    const page = await loadNotificationPage(supabase, VIEWER, { cursor: null, mutedHidden: [HIDDEN] });
    assert.equal(page.rows.length, NOTIFICATION_PAGE_SIZE);
    assert.deepEqual(page.next, {
      createdAt: page.rows[NOTIFICATION_PAGE_SIZE - 1].createdAt,
      id: page.rows[NOTIFICATION_PAGE_SIZE - 1].id,
    });
    const ops = calls[0].ops.join("|");
    assert.equal(calls[0].table, "notifications");
    assert.match(ops, new RegExp(`eq:recipient_id:${VIEWER}`));
    assert.match(ops, new RegExp(`limit:${NOTIFICATION_PAGE_SIZE + 1}`));
    assert.match(ops, /order:created_at:\{"ascending":false\}/);
    assert.match(ops, /order:id:\{"ascending":false\}/);
    // Muted actors stay out, as before.
    assert.match(ops, new RegExp(HIDDEN));

    const older = fakeClient(() => [noteRow("n900", "2026-10-29T00:00:00.000Z")]);
    const last = await loadNotificationPage(older.supabase, VIEWER, {
      cursor: { createdAt: "2026-10-30T00:00:00.000Z", id: "n050" },
      mutedHidden: [],
    });
    assert.equal(last.next, null);
    assert.ok(older.calls[0].ops.some((op) => op === `or:${inboxCursorFilter({ createdAt: "2026-10-30T00:00:00.000Z", id: "n050" })}`));
  });

  it("builds a cursor filter that also breaks created_at ties by id", () => {
    assert.equal(
      inboxCursorFilter({ createdAt: "2026-10-30T00:00:00.000Z", id: "abc" }),
      'created_at.lt."2026-10-30T00:00:00.000Z",and(created_at.eq."2026-10-30T00:00:00.000Z",id.lt."abc")',
    );
  });

  it("reads every unread notification for the bell, and only the viewer's", async () => {
    const { supabase, calls } = fakeClient(() => [noteRow("u1", "2026-01-01T00:00:00.000Z", false)]);
    const unread = await loadUnreadNotifications(supabase, VIEWER, []);
    assert.deepEqual(unread.map((item) => item.id), ["u1"]);
    const ops = calls[0].ops.join("|");
    assert.match(ops, new RegExp(`eq:recipient_id:${VIEWER}`));
    assert.match(ops, /eq:read:false/);
  });

  it("pages the inbox or one thread, and lists each page oldest first", async () => {
    const rows = [
      { id: "m2", sender_id: PARTNER, receiver_id: VIEWER, content: "two", created_at: "2026-10-30T00:00:02.000Z", read: true },
      { id: "m1", sender_id: VIEWER, receiver_id: PARTNER, content: "one", created_at: "2026-10-30T00:00:01.000Z", read: true },
    ];
    const inbox = fakeClient(() => rows);
    const page = await loadMessagePage(inbox.supabase, VIEWER, { cursor: null, blockedHidden: [] });
    assert.deepEqual(page.rows.map((row) => row.id), ["m1", "m2"]);
    assert.equal(page.next, null);
    const ops = inbox.calls[0].ops.join("|");
    assert.match(ops, new RegExp(`or:sender_id.eq.${VIEWER},receiver_id.eq.${VIEWER}`));
    assert.match(ops, new RegExp(`limit:${MESSAGE_PAGE_SIZE + 1}`));

    const thread = fakeClient(() => rows);
    await loadMessagePage(thread.supabase, VIEWER, { cursor: null, blockedHidden: [], partnerId: PARTNER });
    const threadOps = thread.calls[0].ops.join("|");
    assert.match(
      threadOps,
      new RegExp(
        `or:and\\(sender_id.eq.${VIEWER},receiver_id.eq.${PARTNER}\\),and\\(sender_id.eq.${PARTNER},receiver_id.eq.${VIEWER}\\)`,
      ),
    );
  });

  it("reads unread received messages for the message badge", async () => {
    const { supabase, calls } = fakeClient(() => []);
    await loadUnreadMessages(supabase, VIEWER, [HIDDEN]);
    const ops = calls[0].ops.join("|");
    assert.match(ops, new RegExp(`eq:receiver_id:${VIEWER}`));
    assert.match(ops, /eq:read:false/);
    assert.match(ops, new RegExp(HIDDEN));
  });
});

describe("merging pages", () => {
  const older = note("old", "2026-10-01T00:00:00.000Z");
  const kept = note("mid", "2026-10-20T00:00:00.000Z");
  const removed = note("gone", "2026-10-29T00:00:00.000Z");

  it("replaces what the newest page covers and keeps older pages", () => {
    const fresh = [note("new", "2026-10-30T00:00:00.000Z"), note("mid2", "2026-10-25T00:00:00.000Z")];
    const merged = mergeNewestPage([removed, kept, older], fresh, { complete: false, order: "newest" });
    // "gone" sat inside the new page's window and wasn't in it: deleted. Older rows stay.
    assert.deepEqual(merged.map((item) => item.id), ["new", "mid2", "mid", "old"]);
  });

  it("replaces everything when the page is the whole list", () => {
    const merged = mergeNewestPage([removed, kept, older], [note("new", "2026-10-30T00:00:00.000Z")], {
      complete: true,
      order: "newest",
    });
    assert.deepEqual(merged.map((item) => item.id), ["new"]);
  });

  it("only touches one thread's rows when the page is a thread", () => {
    const mine = message("t1", "2026-10-30T00:00:00.000Z");
    const elsewhere = message("x1", "2026-10-30T00:00:05.000Z", { senderId: OTHER });
    const merged = mergeNewestPage([mine, elsewhere], [message("t2", "2026-10-30T00:00:09.000Z")], {
      complete: true,
      order: "oldest",
      within: (item) => item.senderId === PARTNER || item.receiverId === PARTNER,
    });
    assert.deepEqual(merged.map((item) => item.id), ["x1", "t2"]);
  });

  it("marks the viewer's rows read unless the full unread set still has them", () => {
    const notes = [note("a", "2026-10-30T00:00:00.000Z", { read: false }), note("b", "2026-10-01T00:00:00.000Z", { read: false })];
    const settled = settleUnread(notes, [note("a", "2026-10-30T00:00:00.000Z", { read: false })], (item) => item.recipientId === VIEWER);
    assert.deepEqual(settled.map((item) => [item.id, item.read]), [
      ["a", false],
      ["b", true],
    ]);
  });

  it("keeps the bell equal to the grouped list: five likes on one post are one", () => {
    const likes = Array.from({ length: 5 }, (_, index) =>
      note(`like${index}`, `2026-10-30T00:0${index}:00.000Z`, { read: false, actorId: `actor-${index}` }),
    );
    assert.equal(unreadGroupCount(likes), 1);
  });
});

describe("a fresh inbox read over what is loaded", () => {
  const user = { id: VIEWER };

  it("keeps older pages, drops what was deleted, and settles read state", () => {
    const existing = {
      user,
      notifications: [
        note("deleted", "2026-10-29T00:00:00.000Z"),
        note("old-unread", "2026-09-01T00:00:00.000Z", { read: false }),
        note("old", "2026-08-01T00:00:00.000Z"),
      ],
      messages: [message("m-old", "2026-08-01T00:00:00.000Z", { read: false })],
    };
    const next = applyInboxRefresh(existing, {
      notifications: {
        // The page reaches back to Oct 28, so "deleted" (Oct 29) sat inside it.
        rows: [note("new", "2026-10-30T00:00:00.000Z", { read: false }), note("in-page", "2026-10-28T00:00:00.000Z")],
        complete: false,
        unread: [note("new", "2026-10-30T00:00:00.000Z", { read: false })],
      },
      messages: { rows: [message("m-new", "2026-10-30T00:00:00.000Z")], complete: false, unread: [] },
    });
    assert.deepEqual(next.notifications.map((item) => [item.id, item.read]), [
      ["new", false],
      ["in-page", true],
      ["old-unread", true],
      ["old", true],
    ]);
    assert.deepEqual(next.messages.map((item) => [item.id, item.read]), [
      ["m-old", true],
      ["m-new", true],
    ]);
  });

  it("brings in an unread row older than the newest page", () => {
    const next = applyInboxRefresh(
      { user, notifications: [] as Notification[], messages: [] as DirectMessage[] },
      {
        notifications: {
          rows: [note("new", "2026-10-30T00:00:00.000Z")],
          complete: false,
          unread: [note("ancient", "2026-01-01T00:00:00.000Z", { read: false })],
        },
      },
    );
    assert.deepEqual(next.notifications.map((item) => item.id), ["new", "ancient"]);
    assert.equal(next.messages.length, 0);
  });

  it("leaves a slice alone when the read didn't include it", () => {
    const existing = { user, notifications: [note("a", "2026-10-30T00:00:00.000Z")], messages: [] };
    assert.equal(applyInboxRefresh(existing, {}).notifications, existing.notifications);
  });
});

describe("Load more cursors", () => {
  const next = { createdAt: "2026-10-30T00:00:00.000Z", id: "n1" };
  const older = { createdAt: "2026-10-01T00:00:00.000Z", id: "n9" };
  const inbox = {
    notifications: { rows: [], next },
    unreadNotifications: [],
    messages: { rows: [], next: null },
    unreadMessages: [],
  };

  it("takes the snapshot's cursors until the viewer loads more", () => {
    const first = cursorsAfterRefresh(emptyInboxCursors(), inbox, VIEWER);
    assert.deepEqual(first.notifications, next);
    assert.equal(first.messages, null);
    // After a Load more, a refresh doesn't pull the cursor back to page one.
    const advanced = { ...first, notifications: older, advanced: { ...first.advanced, notifications: true } };
    assert.deepEqual(cursorsAfterRefresh(advanced, inbox, VIEWER).notifications, older);
  });

  it("starts over for another account, and has nothing to page without a session", () => {
    const mine = cursorsAfterRefresh(emptyInboxCursors(), inbox, VIEWER);
    const theirs = cursorsAfterRefresh({ ...mine, threads: { [PARTNER]: older } }, inbox, OTHER);
    assert.equal(theirs.viewerId, OTHER);
    assert.deepEqual(theirs.threads, {});
    assert.deepEqual(cursorsAfterRefresh(mine, undefined, null), emptyInboxCursors());
  });
});

describe("a full snapshot reload", () => {
  const page = (rows: Notification[]) => ({
    notifications: { rows, next: { createdAt: "x", id: "x" } },
    unreadNotifications: [] as Notification[],
    messages: { rows: [] as DirectMessage[], next: null },
    unreadMessages: [] as DirectMessage[],
  });

  it("keeps older pages the viewer loaded, for the same viewer", () => {
    const fresh = note("new", "2026-10-30T00:00:00.000Z");
    const existing = { user: { id: VIEWER }, notifications: [note("older", "2026-01-01T00:00:00.000Z")], messages: [] as DirectMessage[] };
    const next = { user: { id: VIEWER }, notifications: [fresh], messages: [] as DirectMessage[], inbox: page([fresh]) };
    assert.deepEqual(keepLoadedInbox(existing, next).notifications.map((item) => item.id), ["new", "older"]);
  });

  it("takes the new snapshot as is for another viewer, or without inbox pages", () => {
    const fresh = note("new", "2026-10-30T00:00:00.000Z");
    const existing = { user: { id: OTHER }, notifications: [note("theirs", "2026-01-01T00:00:00.000Z")], messages: [] as DirectMessage[] };
    const next = { user: { id: VIEWER }, notifications: [fresh], messages: [] as DirectMessage[], inbox: page([fresh]) };
    assert.equal(keepLoadedInbox(existing, next), next);
    const plain = { user: { id: OTHER }, notifications: [fresh], messages: [] as DirectMessage[] };
    assert.equal(keepLoadedInbox(existing, plain), plain);
  });
});
