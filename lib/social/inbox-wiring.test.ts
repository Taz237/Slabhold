import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("paged notifications and messages, wired in", () => {
  it("never reads the viewer's whole notification or message history", () => {
    const remote = read("lib/social/remote.ts");
    const start = remote.indexOf("export async function loadSupabaseSocial");
    const loader = remote.slice(start, remote.indexOf("\nexport ", start + 10));
    assert.doesNotMatch(loader, /from\("notifications"\)/);
    assert.doesNotMatch(loader, /from\("messages"\)/);
    assert.match(loader, /loadNotificationPage\(/);
    assert.match(loader, /loadUnreadNotifications\(/);
    assert.match(loader, /loadMessagePage\(/);
    assert.match(loader, /loadUnreadMessages\(/);
    const realtime = read("lib/social/realtime-slices.ts");
    assert.doesNotMatch(realtime, /from\("notifications"\)|from\("messages"\)/);
  });

  it("counts the bell from grouped rows, the same grouping the list draws", () => {
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /const unreadCount = useMemo\(\(\) => unreadGroupCount\(notifications\), \[notifications\]\);/);
    const list = read("components/notifications-view.tsx");
    assert.match(list, /const groups = groupNotifications\(notifications\);/);
  });

  it("keeps loaded pages through a full reload and keeps the viewer's place", () => {
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /setRemote\(\(existing\) => keepLoadedInbox\(existing, merged\)\);/);
    assert.match(provider, /cursorsAfterRefresh\(current, snapshot\.inbox/);
  });

  it("offers Load more on the notifications list and the inbox", () => {
    assert.match(read("components/notifications-view.tsx"), /<LoadMore\s+hasMore=\{inboxMore\.notifications\}/);
    assert.match(read("components/messages-view.tsx"), /<LoadMore\s+hasMore=\{inboxMore\.messages\}/);
  });

  it("reads a thread's own newest page on open, and older ones above without jumping", () => {
    const thread = read("components/message-thread.tsx");
    assert.match(thread, /void loadThreadMessages\(partnerId\)/);
    assert.match(thread, /threadMore\(partnerId\)/);
    assert.match(thread, /Load older messages/);
    // Scrolling to the newest message follows the newest id, not the length.
    assert.match(thread, /\}, \[newestId, partner\?\.id, reduceMotion\]\);/);
    assert.doesNotMatch(thread, /\[shownThread\.length, partner\?\.id, reduceMotion\]/);
    assert.match(thread, /node\.scrollTop = node\.scrollHeight - hold;/);
  });
});
