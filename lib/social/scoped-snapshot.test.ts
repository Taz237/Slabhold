import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function body(source: string, start: string) {
  const at = source.indexOf(start);
  assert.ok(at > -1, start);
  return source.slice(at, source.indexOf("\nexport ", at + start.length));
}

function callbackBody(source: string, name: string) {
  const at = source.indexOf(`const ${name} = useCallback(`);
  assert.ok(at > -1, name);
  // Up to the next top-level statement in the provider (a declaration, an effect, or a comment).
  const rest = source.slice(at + 10);
  const end = rest.search(/\n  (const |useEffect\(|\/\/)/);
  return source.slice(at, end === -1 ? undefined : at + 10 + end);
}

describe("the snapshot, with every read bounded", () => {
  it("replaces the old full loader", () => {
    const remote = read("lib/social/remote.ts");
    assert.doesNotMatch(remote, /loadSupabaseSocial/);
    assert.match(read("components/social-provider.tsx"), /loadSocialSnapshot\(client\)/);
  });

  it("reads the newest posts and reposts, and replies and reposts for those posts only", () => {
    const loader = body(read("lib/social/remote.ts"), "export async function loadSocialSnapshot");
    assert.doesNotMatch(loader, /from\("comments"\)/);
    assert.doesNotMatch(loader, /from\("public_cards"\)|from\("notifications"\)|from\("messages"\)/);
    for (const read of loader.matchAll(/from\("(posts|reposts)"\)\.select\("\*"\)\.order\([^)]*\)[^,\n]*/g)) {
      assert.match(read[0], /\.limit\(/, read[0]);
    }
    assert.match(loader, /loadPostEngagement\(/);
  });
});

describe("changes update in place", () => {
  const provider = read("components/social-provider.tsx");

  it("never reloads the whole snapshot after a change", () => {
    for (const name of [
      "updateProfile",
      "toggleFollow",
      "followMany",
      "createPost",
      "updatePost",
      "deletePost",
      "pinPost",
      "unpinPost",
      "deleteComment",
      "toggleRepost",
      "addComment",
      "sendMessage",
    ]) {
      assert.doesNotMatch(callbackBody(provider, name), /refreshRemote\(/, name);
    }
  });

  it("re-reads only what changed", () => {
    assert.match(callbackBody(provider, "updateProfile"), /rereadPeople\(client, \[snapshot\.user\.id\]\)/);
    assert.match(callbackBody(provider, "createPost"), /loadPostById\(client, result\.postId/);
    assert.match(callbackBody(provider, "addComment"), /rereadPost\(client, postId\)/);
    assert.match(callbackBody(provider, "toggleRepost"), /rereadPost\(client, postId\)/);
    assert.match(callbackBody(provider, "sendMessage"), /refreshThread\(client, current\.user\.id, receiverId\)/);
  });

  it("opens the inbox screens with their own pages, not the whole snapshot", () => {
    assert.match(read("components/notifications-view.tsx"), /await refreshInbox\(\)/);
    assert.match(read("components/messages-view.tsx"), /void refreshInbox\(\)/);
    assert.match(read("components/message-thread.tsx"), /void refreshInbox\(\)/);
    assert.match(read("components/push/push-manager.tsx"), /void refreshInbox\(\)/);
    // Block and mute already took the person off in place; only undoing them reads again.
    assert.match(read("components/safety-menu.tsx"), /if \(type === "unblock" \|\| type === "unmute"\) await refresh\(\);/);
  });

  it("reads replies and reposts for posts loaded after the snapshot", () => {
    assert.match(callbackBody(provider, "rememberPosts"), /engagementBatcher\.request\(engagementKeys\(/);
    assert.match(read("components/profile-view.tsx"), /loadRepliesBy\(replyAuthorId\)/);
  });
});

describe("on-device accounts stay off hosted screens' first load", () => {
  it("loads local-db only when that mode needs it", () => {
    const provider = read("components/social-provider.tsx");
    assert.doesNotMatch(provider, /import \{[^}]*\} from "@\/lib\/social\/local-db";/);
    assert.match(provider, /import\("@\/lib\/social\/local-db"\)/);
    for (const path of ["lib/social/remote.ts", "components/profile-view.tsx", "components/post-view.tsx"]) {
      assert.doesNotMatch(read(path), /from "(@\/lib\/social|\.)\/local-db"/, path);
    }
    // The shared helpers moved out, and local-db still offers them.
    const local = read("lib/social/local-db.ts");
    assert.match(local, /export \{ canDeleteReply, stateAfterReplyDelete \} from "\.\/reply-delete";/);
    assert.match(local, /normalizeUsername,\n[\s\S]*\} from "\.\/usernames";/);
  });
});

describe("the hosted reads and writes stay off the first load", () => {
  it("loads remote with the Supabase client, never as a static import on the provider's path", () => {
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /const loadRemote = \(\) => import\("@\/lib\/social\/remote"\);/);
    assert.match(provider, /void loadRemote\(\)\.catch\(\(\) => \{\}\);\n      return loadSupabaseBrowser\(\);/);
    for (const path of [
      "components/social-provider.tsx",
      "lib/social/profile-cache.ts",
      "lib/social/use-people-search.ts",
    ]) {
      assert.doesNotMatch(read(path), /^import [^;]* from "(@\/lib\/social|\.)\/remote";/m, path);
    }
  });
});
