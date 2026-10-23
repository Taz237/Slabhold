import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadFeedPage } from "./load-feed-page";
import { dedupeMailDayRows } from "./mail-day";
import { olderThanCursor } from "./page-cursor";
import { loadInboxPage, loadRecentMessages, loadSupabaseSocial, loadThreadPage } from "./remote";
import {
  FOLLOW_LIST_PAGE_SIZE,
  NOTIFICATION_PAGE_SIZE,
  cardHiddenAuthorIds,
  loadFollowList,
  loadNewestFeedHead,
  loadNotificationPage,
  loadProfileSlice,
  loadSearchSlice,
  loadShellBundle,
  loadUnreadCounts,
  loadViewerShell,
  socialRoute,
} from "./scoped-reads";

type Call = { kind: "from" | "rpc" | "auth"; name: string; ops: string[] };

function client(
  session: { id: string; email?: string } | null,
  rows: Record<string, unknown[]> = {},
) {
  const calls: Call[] = [];
  function builder(table: string) {
    const ops: string[] = [];
    const record = () => {
      calls.push({ kind: "from", name: table, ops: [...ops] });
    };
    const api = {
      select(cols: string, options?: { count?: string; head?: boolean }) {
        ops.push(`select:${cols}`);
        if (options?.count) ops.push(`count:${options.count}`);
        if (options?.head) ops.push("head:true");
        return api;
      },
      eq(column: string, value: unknown) {
        ops.push(`eq:${column}:${String(value)}`);
        return api;
      },
      or(filters: string) {
        ops.push(`or:${filters}`);
        return api;
      },
      order() {
        return api;
      },
      limit(count: number) {
        ops.push(`limit:${count}`);
        return api;
      },
      in(column: string, values: readonly string[]) {
        ops.push(`in:${column}:${values.join(",")}`);
        return api;
      },
      ilike(column: string, value: string) {
        ops.push(`ilike:${column}:${value}`);
        return api;
      },
      lt(column: string, value: string) {
        ops.push(`lt:${column}:${value}`);
        return api;
      },
      not() {
        return api;
      },
      abortSignal() {
        return api;
      },
      maybeSingle() {
        record();
        const row = (rows[table] ?? [])[0] ?? null;
        return Promise.resolve({ data: row, error: null, count: 0 });
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        record();
        return Promise.resolve({ data: rows[table] ?? [], error: null, count: 3 }).then(resolve, reject);
      },
    };
    return api;
  }
  const supabase = {
    auth: {
      getSession: async () => {
        calls.push({ kind: "auth", name: "getSession", ops: [] });
        return {
          data: {
            session: session
              ? { user: { id: session.id, email: session.email ?? "ada@example.com" } }
              : null,
          },
        };
      },
    },
    rpc(fn: string) {
      calls.push({ kind: "rpc", name: fn, ops: [] });
      return Promise.resolve({ data: [], error: null });
    },
    from(table: string) {
      return builder(table);
    },
  };
  return { supabase: supabase as never, calls };
}

function fromCalls(calls: Call[]) {
  return calls.filter((call) => call.kind === "from");
}

function tables(calls: Call[]) {
  return fromCalls(calls).map((call) => call.name);
}

const VIEWER = "11111111-1111-4111-8111-111111111111";
const profileRow = {
  id: VIEWER,
  username: "ada",
  display_name: "Ada",
  bio: "",
  avatar_url: null,
  cover_url: null,
  accent: "#7c5cff",
  created_at: "2026-10-01T00:00:00.000Z",
};

describe("viewer shell", () => {
  it("reads nothing from the social tables when signed out", async () => {
    const fake = client(null);
    const snapshot = await loadViewerShell(fake.supabase);
    assert.equal(snapshot.user, null);
    assert.deepEqual(tables(fake.calls), []);
    assert.equal(fake.calls.filter((call) => call.kind === "auth").length, 1);
  });

  it("loads the viewer's shell, hidden authors, and grouped unread notifications together", async () => {
    const fake = client({ id: VIEWER }, { profiles: [profileRow] });
    const snapshot = await loadSupabaseSocial(fake.supabase);
    assert.equal(snapshot.user?.id, VIEWER);
    assert.deepEqual(snapshot.posts, []);
    assert.deepEqual(snapshot.publicCards, []);
    assert.deepEqual(snapshot.comments, []);
    assert.deepEqual(snapshot.notifications, []);
    assert.deepEqual(snapshot.messages, []);
    assert.deepEqual(snapshot.reposts, []);
    const dataTables = fromCalls(fake.calls)
      .filter((call) => !call.ops.includes("head:true"))
      .map((call) => call.name);
    assert.deepEqual(dataTables, ["profiles", "notifications", "follows", "blocks", "mutes"]);
    const starred = fake.calls.some((call) => call.ops.some((op) => op === 'select:*' || op.includes('select:"*"')));
    assert.equal(starred, false);
    const follows = fromCalls(fake.calls).find((call) => call.name === "follows");
    assert.match(follows?.ops.find((op) => op.startsWith("or:")) ?? "", new RegExp(VIEWER));
    assert.equal(fake.calls.filter((call) => call.kind === "rpc" && call.name === "hidden_author_ids").length, 1);
    assert.deepEqual(snapshot.hiddenAuthorIds, []);
    assert.deepEqual(cardHiddenAuthorIds(["blocked", "muted"], ["muted"]), ["blocked"]);
    const shellSource = readFileSync(join(process.cwd(), "lib/social/scoped-reads.ts"), "utf8");
    assert.match(shellSource, /hiddenAuthorIds: cardHiddenAuthorIds\(hiddenAuthorIds, mutedIds\)/);
    assert.match(shellSource, /hiddenAuthorIds: shell\.hiddenAuthorIds \?\? \[\]/);
    const notes = fromCalls(fake.calls).find((call) => call.name === "notifications");
    const messages = fromCalls(fake.calls).find((call) => call.name === "messages");
    assert.equal(notes?.ops.includes("head:true"), false);
    assert.ok(notes?.ops.includes("eq:read:false"));
    assert.ok(messages?.ops.includes("head:true"));
    assert.ok(messages?.ops.includes("count:exact"));
  });
});

describe("page reads", () => {
  it("loads one notification page for the recipient", async () => {
    const fake = client({ id: VIEWER });
    const page = await loadNotificationPage(fake.supabase, VIEWER, null);
    assert.deepEqual(page.notifications, []);
    assert.equal(fake.calls.filter((call) => call.kind === "rpc").length, 1);
    const notes = fromCalls(fake.calls).find((call) => call.name === "notifications");
    assert.ok(notes?.ops.includes(`eq:recipient_id:${VIEWER}`));
    assert.ok(notes?.ops.includes(`limit:${NOTIFICATION_PAGE_SIZE}`));
    assert.equal(tables(fake.calls).includes("public_cards"), false);
    assert.equal(tables(fake.calls).includes("posts"), false);
  });

  it("loads one message page with list columns, not every column", async () => {
    const fake = client({ id: VIEWER });
    await loadRecentMessages(fake.supabase, VIEWER, null);
    const messages = fromCalls(fake.calls).find((call) => call.name === "messages");
    assert.ok(messages);
    assert.equal(messages?.ops.some((op) => op.startsWith("select:*")), false);
    assert.match(messages?.ops.find((op) => op.startsWith("select:")) ?? "", /sender_id/);
    assert.ok(messages?.ops.some((op) => op.startsWith("or:") && op.includes(VIEWER)));
    assert.ok(messages?.ops.includes("limit:80"));
    assert.equal(tables(fake.calls).includes("public_cards"), false);
  });

  it("loads one profile, two follow counts, and that owner's public cards", async () => {
    const fake = client({ id: VIEWER }, { profiles: [profileRow] });
    const slice = await loadProfileSlice(fake.supabase, {
      username: "ada",
      viewerId: VIEWER,
      viewer: null,
    });
    assert.equal(slice.profile?.username, "ada");
    assert.equal(slice.counts.followers, 3);
    assert.deepEqual(
      tables(fake.calls),
      ["profiles", "follows", "follows", "public_cards"],
    );
    const cards = fromCalls(fake.calls).find((call) => call.name === "public_cards");
    assert.ok(cards?.ops.includes(`eq:user_id:${VIEWER}`));
    assert.equal(cards?.ops.some((op) => op.startsWith("select:*")), false);
    assert.match(cards?.ops.find((op) => op.startsWith("select:")) ?? "", /player/);
  });

  it("loads one direction of follows and those profiles", async () => {
    const fake = client({ id: VIEWER }, { profiles: [profileRow] });
    await loadFollowList(fake.supabase, {
      direction: "followers",
      username: "ada",
      viewer: null,
    });
    const follows = fromCalls(fake.calls).find((call) => call.name === "follows");
    assert.ok(follows?.ops.includes(`eq:following_id:${VIEWER}`));
    assert.ok(follows?.ops.includes(`limit:${FOLLOW_LIST_PAGE_SIZE}`));
    assert.equal(tables(fake.calls).includes("posts"), false);
  });

  it("searches people and posts without a site snapshot", async () => {
    const fake = client({ id: VIEWER });
    await loadSearchSlice(fake.supabase, "jordan", VIEWER);
    assert.deepEqual(tables(fake.calls).sort(), ["posts", "profiles"]);
    assert.equal(fake.calls.filter((call) => call.kind === "rpc").length, 1);
    assert.equal(tables(fake.calls).includes("public_cards"), false);
    const empty = client({ id: VIEWER });
    await loadSearchSlice(empty.supabase, "   ", VIEWER);
    assert.equal(empty.calls.length, 0);
  });

  it("peeks one post and one repost for the new-posts pill", async () => {
    const fake = client(null);
    await loadNewestFeedHead(fake.supabase, null);
    assert.deepEqual(tables(fake.calls), ["posts", "reposts"]);
    for (const call of fromCalls(fake.calls)) {
      assert.ok(call.ops.includes("limit:1"));
    }
  });
});

describe("request budgets", () => {
  it("keeps a signed-out home feed to the newest page", async () => {
    const fake = client(null);
    await loadFeedPage(fake.supabase, {
      scope: "public",
      viewerId: null,
      cursor: null,
      limit: 30,
    });
    assert.deepEqual(tables(fake.calls), ["posts", "reposts"]);
    assert.equal(fake.calls.some((call) => call.kind === "rpc"), false);
    assert.equal(tables(fake.calls).includes("public_cards"), false);
    assert.equal(tables(fake.calls).includes("notifications"), false);
    assert.equal(tables(fake.calls).includes("messages"), false);
  });

  it("keeps a signed-in home to the shell batch plus one feed page", async () => {
    const post = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: VIEWER,
      content: "hello",
      image_url: null,
      card: null,
      quoted_post_id: null,
      created_at: "2026-10-22T00:00:00.000Z",
      post_type: "post",
      show_paid: false,
      meta: null,
    };
    const fake = client({ id: VIEWER }, { profiles: [profileRow], posts: [post] });
    const bundle = await loadShellBundle(fake.supabase);
    const rpcAfterShell = fake.calls.filter((call) => call.kind === "rpc").length;
    await loadFeedPage(fake.supabase, {
      scope: "public",
      viewerId: VIEWER,
      cursor: null,
      limit: 30,
      hiddenAuthorIds: bundle.hiddenAuthorIds,
    });
    const names = tables(fake.calls);
    assert.equal(names.filter((name) => name === "public_cards").length, 0);
    assert.equal(names.filter((name) => name === "comments").length, 0);
    const fullNotes = fromCalls(fake.calls).filter(
      (call) => call.name === "notifications" && !call.ops.includes("head:true"),
    );
    const fullMessages = fromCalls(fake.calls).filter(
      (call) => call.name === "messages" && !call.ops.includes("head:true"),
    );
    assert.equal(fullNotes.length, 1);
    assert.ok(fullNotes[0]?.ops.includes("eq:read:false"));
    assert.equal(fullMessages.length, 0);
    assert.equal(rpcAfterShell, 1);
    assert.equal(fake.calls.filter((call) => call.kind === "rpc").length, 1);
  });
});

describe("unread badges", () => {
  it("counts grouped unread notifications and unread messages with a head query", async () => {
    const postId = "22222222-2222-4222-8222-222222222222";
    const fake = client(
      { id: VIEWER },
      {
        notifications: [
          {
            id: "n1",
            recipient_id: VIEWER,
            actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            kind: "like",
            post_id: postId,
            created_at: "2026-10-22T02:00:00.000Z",
            read: false,
          },
          {
            id: "n2",
            recipient_id: VIEWER,
            actor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            kind: "like",
            post_id: postId,
            created_at: "2026-10-22T01:00:00.000Z",
            read: false,
          },
          {
            id: "n3",
            recipient_id: VIEWER,
            actor_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            kind: "follow",
            post_id: null,
            created_at: "2026-10-22T00:00:00.000Z",
            read: false,
          },
        ],
      },
    );
    const counts = await loadUnreadCounts(fake.supabase, VIEWER);
    assert.equal(counts.notifications, 2);
    assert.equal(counts.messages, 3);
    const notes = fromCalls(fake.calls).find((call) => call.name === "notifications");
    const messages = fromCalls(fake.calls).find((call) => call.name === "messages");
    assert.ok(notes?.ops.includes(`eq:recipient_id:${VIEWER}`));
    assert.ok(notes?.ops.includes("eq:read:false"));
    assert.equal(notes?.ops.includes("head:true"), false);
    assert.ok(messages?.ops.includes(`eq:receiver_id:${VIEWER}`));
    assert.ok(messages?.ops.includes("eq:read:false"));
    assert.ok(messages?.ops.includes("head:true"));
    assert.equal(tables(fake.calls).includes("posts"), false);
    const reads = readFileSync(join(process.cwd(), "lib/social/scoped-reads.ts"), "utf8");
    assert.match(reads, /unreadGroupCount\(/);
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const cold = provider.slice(
      provider.indexOf("const id = postIdFromPath(path)"),
      provider.indexOf("await refreshRemote(client)"),
    );
    assert.match(cold, /loadUnreadCounts\(/);
    assert.match(provider, /previousUserId !== nextUserId/);
    assert.match(provider, /notificationCursorRef\.current = null/);
    assert.match(provider, /snapshotRef\.current\.user\?\.id !== requestedFor/);
  });

  it("refreshes those counts on focus and on the realtime inbox cadence", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(provider, /loadUnreadCounts\(/);
    assert.match(provider, /window\.addEventListener\("focus", onFocus\)/);
    assert.match(provider, /document\.addEventListener\("visibilitychange", onFocus\)/);
    assert.match(provider, /refreshUnreadRef\.current\(\)/);
    assert.match(provider, /slices\.has\("notifications"\) \|\| slices\.has\("messages"\)/);
    assert.match(provider, /mode === "supabase" \? inboxUnread\.notifications : groupedUnread/);
    assert.match(provider, /mode === "supabase" \? inboxUnread\.messages : listedUnreadMessages/);
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    assert.match(shell, /Notifications, \$\{unreadCount\} unread/);
    assert.match(shell, /tab\.href === "\/messages" \? unreadMessageCount/);
    const more = readFileSync(join(process.cwd(), "components/more-view.tsx"), "utf8");
    assert.match(more, /unreadMessageCount > 0/);
  });
});

describe("older pages", () => {
  const cursor = { createdAt: "2026-10-01T00:00:00.000Z", id: "33333333-3333-4333-8333-333333333333" };

  it("pages notifications on created_at and id", async () => {
    const fake = client({ id: VIEWER });
    await loadNotificationPage(fake.supabase, VIEWER, cursor);
    const notes = fromCalls(fake.calls).find((call) => call.name === "notifications");
    assert.equal(notes?.ops.find((op) => op.startsWith("or:")), `or:${olderThanCursor(cursor)}`);
    assert.ok(notes?.ops.includes(`limit:${NOTIFICATION_PAGE_SIZE}`));
  });

  it("pages the inbox and one DM thread on created_at and id", async () => {
    const partner = "44444444-4444-4444-8444-444444444444";
    const inbox = client({ id: VIEWER });
    await loadInboxPage(inbox.supabase, VIEWER, cursor);
    const inboxOr = fromCalls(inbox.calls)
      .find((call) => call.name === "messages")
      ?.ops.filter((op) => op.startsWith("or:"))
      .join(" ");
    assert.match(inboxOr ?? "", new RegExp(VIEWER));
    assert.match(inboxOr ?? "", /created_at\.lt/);
    assert.match(inboxOr ?? "", /id\.lt/);
    assert.ok(fromCalls(inbox.calls).some((call) => call.ops.includes("limit:80")));

    const thread = client({ id: VIEWER });
    await loadThreadPage(thread.supabase, VIEWER, partner, cursor);
    const threadOr = fromCalls(thread.calls)
      .find((call) => call.name === "messages")
      ?.ops.filter((op) => op.startsWith("or:"))
      .join(" ");
    assert.match(threadOr ?? "", new RegExp(partner));
    assert.match(threadOr ?? "", /id\.lt/);
  });

  it("pages follow lists and profile cards on created_at and id", async () => {
    const fake = client({ id: VIEWER }, { profiles: [profileRow] });
    await loadFollowList(fake.supabase, {
      direction: "followers",
      username: "ada",
      viewer: null,
      cursor,
    });
    const follows = fromCalls(fake.calls).find((call) => call.name === "follows");
    assert.match(follows?.ops.find((op) => op.startsWith("or:")) ?? "", /created_at\.lt/);
    assert.match(follows?.ops.find((op) => op.startsWith("or:")) ?? "", /follower_id\.lt/);
    assert.ok(follows?.ops.includes(`limit:${FOLLOW_LIST_PAGE_SIZE}`));

    const cards = client({ id: VIEWER }, { profiles: [profileRow] });
    await loadProfileSlice(cards.supabase, { username: "ada", viewerId: VIEWER, viewer: null });
    const cardCall = fromCalls(cards.calls).find((call) => call.name === "public_cards");
    assert.ok(cardCall?.ops.includes("limit:100"));
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(provider, /loadMoreNotifications/);
    assert.match(provider, /loadMoreMessages/);
    assert.match(provider, /loadMoreThread/);
    assert.match(provider, /loadMoreFollows/);
    assert.match(provider, /loadMoreCards/);
    const profile = readFileSync(join(process.cwd(), "components/profile-view.tsx"), "utf8");
    assert.match(profile, /onLoadMore=\{pagedPosts\.loadMore\}/);
    assert.match(profile, /loadMoreCards/);
  });

  it("runs blocks, mutes, and hidden authors in one shell batch", () => {
    const source = readFileSync(join(process.cwd(), "lib/social/scoped-reads.ts"), "utf8");
    const bundle = source.slice(
      source.indexOf("export async function loadShellBundle"),
      source.indexOf("export async function loadViewerShell"),
    );
    assert.match(bundle, /Promise\.all\(/);
    assert.match(bundle, /from\("blocks"\)/);
    assert.match(bundle, /from\("mutes"\)/);
    assert.match(bundle, /loadHiddenAuthorIds\(supabase, true\)/);
    assert.match(bundle, /loadUnreadCounts\(supabase, viewerId\)/);
    const feed = readFileSync(join(process.cwd(), "lib/social/load-feed-page.ts"), "utf8");
    assert.match(feed, /input\.hiddenAuthorIds !== undefined/);
  });
});

describe("mail day once", () => {
  it("collapses duplicate post ids before the loader runs", () => {
    const rows = dedupeMailDayRows([
      { id: "a", user_id: "u", post_type: "mail_day" },
      { id: "a", user_id: "u", post_type: "mail_day" },
      { id: "b", user_id: "u", post_type: "post" },
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["a", "b"]);
  });

  it("does not call the legacy loader from the site snapshot", () => {
    const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    const load = remote.slice(
      remote.indexOf("export async function loadSupabaseSocial"),
      remote.indexOf("export async function remoteSignUp"),
    );
    assert.equal(load.includes("loadMailDayViews("), false);
    assert.equal(load.includes('select("*")'), false);
    assert.match(remote, /dedupeMailDayRows|loadViewerShell/);
    const mail = readFileSync(join(process.cwd(), "lib/social/mail-day.ts"), "utf8");
    const fn = mail.slice(mail.indexOf("export async function loadMailDayViews"));
    assert.match(fn, /dedupeMailDayRows\(rows\)/);
  });
});

describe("social routes", () => {
  it("sends each screen to its own read", () => {
    assert.equal(socialRoute("/").kind, "home");
    assert.equal(socialRoute("/notifications").kind, "notifications");
    assert.equal(socialRoute("/messages").kind, "messages");
    assert.equal(socialRoute("/u/ada").kind, "profile");
    assert.equal(socialRoute("/u/ada/cards/1").kind, "other");
    assert.deepEqual(socialRoute("/u/ada/followers"), { kind: "followers", username: "ada" });
    assert.equal(socialRoute("/search").kind, "search");
  });
});
