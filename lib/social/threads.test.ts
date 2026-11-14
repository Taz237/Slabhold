import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearComposeDraft,
  composeDraftKey,
  draftThread,
  keepComposeDraft,
  takeComposeDraft,
  threadDraftFromHome,
} from "./compose-draft";
import { localCreateThread, localDeletePost, type LocalDb } from "./local-db";
import { postExtrasFromRow } from "./post-extras";
import { remoteCreateThread } from "./remote";
import {
  addSegmentAfter,
  EMPTY_SEGMENT,
  isThreadContinuation,
  orderThread,
  postsAfterThreadDelete,
  removeSegment,
  segmentsToPost,
  THREAD_MAX,
  THREADS_UNAVAILABLE,
  threadColumnMissing,
  threadSlots,
  resetPostExtrasSupport,
  type ThreadSegment,
} from "./threads";
import { profileTimeline, publicTimeline } from "./timeline";
import type { Post, Profile } from "./types";

const ME = "me";
const THREAD = "t1";

function post(id: string, over: Partial<Post> = {}): Post {
  return {
    id,
    authorId: ME,
    body: id,
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2026-11-14T10:00:00.000Z",
    ...over,
  };
}

function threadOf(...ids: string[]): Post[] {
  return ids.map((id, index) => post(id, { threadId: THREAD, threadPosition: index }));
}

const places = (posts: Post[]) =>
  orderThread(posts, THREAD).map((item) => `${item.id}:${item.threadPosition}`).join(",");

const profile: Profile = {
  id: ME,
  email: "",
  username: "me",
  displayName: "Me",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7C3AED",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function db(over: Partial<LocalDb> = {}): LocalDb {
  return {
    users: [],
    sessionUserId: ME,
    follows: [],
    posts: [],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
    messages: [],
    collections: {},
    ...over,
  };
}

const write = (body: string) => ({ body, imageDataUrl: null, images: [], card: null });

describe("thread ordering", () => {
  it("reads a thread first to last whatever order the posts arrive in", () => {
    const [a, b, c, d] = threadOf("a", "b", "c", "d");
    const other = post("x", { threadId: "t2", threadPosition: 0 });
    assert.deepEqual(
      orderThread([d!, other, b!, post("plain"), a!, c!, b!], THREAD).map((item) => item.id),
      ["a", "b", "c", "d"],
    );
  });

  it("gives a new thread places 0, 1, 2 and leaves one post as a normal post", () => {
    assert.deepEqual(threadSlots(3, THREAD), [
      { threadId: THREAD, threadPosition: 0 },
      { threadId: THREAD, threadPosition: 1 },
      { threadId: THREAD, threadPosition: 2 },
    ]);
    assert.deepEqual(threadSlots(1, THREAD), [{ threadId: null, threadPosition: null }]);
    assert.equal(threadSlots(14, THREAD).length, THREAD_MAX);
  });

  it("saves a local thread in the order written", () => {
    const result = localCreateThread(db(), [write("first"), write("second"), write("third")]);
    assert.equal(result.error, undefined);
    assert.equal(result.postIds?.length, 3);
    const threadId = result.db.posts[0]!.threadId!;
    assert.deepEqual(
      orderThread(result.db.posts, threadId).map((item) => item.body),
      ["first", "second", "third"],
    );
    assert.deepEqual(
      result.postIds,
      orderThread(result.db.posts, threadId).map((item) => item.id),
    );
    assert.equal(new Set(result.postIds).size, 3, "each post has its own id");
  });

  it("saves nothing when one post of a local thread is refused", () => {
    const start = db();
    const result = localCreateThread(start, [write("first"), write("x".repeat(281))]);
    assert.match(result.error ?? "", /^Post 2 of 2: Keep it to 280 characters\.$/);
    assert.equal(result.db, start);
    assert.equal(localCreateThread(start, Array.from({ length: 11 }, () => write("a"))).error, "A thread can have up to 10 posts.");
  });

  it("reads thread fields from a row only when both are there", () => {
    assert.deepEqual(postExtrasFromRow({ thread_id: THREAD, thread_position: 2 }), {
      gif: null,
      threadId: THREAD,
      threadPosition: 2,
    });
    assert.deepEqual(postExtrasFromRow({ thread_id: THREAD, thread_position: null }), {
      gif: null,
      threadId: null,
      threadPosition: null,
    });
    assert.deepEqual(postExtrasFromRow({}), { gif: null, threadId: null, threadPosition: null });
  });
});

describe("a remote thread", () => {
  function client(result: { data: unknown; error: { code?: string; message: string } | null }) {
    const inserts: unknown[] = [];
    const supabase = {
      from(table: string) {
        if (table === "posts") {
          return {
            insert(rows: unknown) {
              inserts.push(rows);
              return { select: async () => result };
            },
          };
        }
        // Mention notifications: nothing stored, nothing to add.
        const chain = {
          select: () => chain,
          delete: () => chain,
          eq: () => chain,
          in: () => chain,
          is: () => chain,
          then: (resolve: (value: { data: never[]; error: null }) => unknown) => resolve({ data: [], error: null }),
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    return { supabase, inserts };
  }

  it("goes in as one insert, in order, and returns the ids first to last", async () => {
    const { supabase, inserts } = client({
      // The database may answer in any order.
      data: [
        { id: "id-c", thread_position: 2 },
        { id: "id-a", thread_position: 0 },
        { id: "id-b", thread_position: 1 },
      ],
      error: null,
    });
    const result = await remoteCreateThread(supabase, ME, [write("first"), write("second"), write("third")], () => THREAD);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.postIds, ["id-a", "id-b", "id-c"]);
    assert.equal(inserts.length, 1, "one insert: every post lands or none does");
    const rows = inserts[0] as { content: string; thread_id: string; thread_position: number; user_id: string }[];
    assert.deepEqual(
      rows.map((row) => [row.content, row.thread_id, row.thread_position, row.user_id]),
      [
        ["first", THREAD, 0, ME],
        ["second", THREAD, 1, ME],
        ["third", THREAD, 2, ME],
      ],
    );
    const keys = rows.map((row) => Object.keys(row).sort().join());
    assert.equal(new Set(keys).size, 1, "every row has the same columns");
  });

  it("stops before saving when a post is empty or too long, and names the post", async () => {
    const { supabase, inserts } = client({ data: [], error: null });
    const empty = await remoteCreateThread(supabase, ME, [write("first"), write("  ")], () => THREAD);
    assert.match(empty.error ?? "", /^Post 2 of 2: /);
    const long = await remoteCreateThread(supabase, ME, [write("x".repeat(281)), write("b")], () => THREAD);
    assert.match(long.error ?? "", /^Post 1 of 2: Keep it to 280 characters\.$/);
    const many = await remoteCreateThread(supabase, ME, Array.from({ length: 11 }, () => write("a")), () => THREAD);
    assert.equal(many.error, "A thread can have up to 10 posts.");
    assert.equal(inserts.length, 0);
  });

  it("says threads are not available on a database without the columns", async () => {
    resetPostExtrasSupport();
    const { supabase } = client({
      data: null,
      error: { code: "PGRST204", message: "Could not find the 'thread_id' column of 'posts' in the schema cache" },
    });
    const result = await remoteCreateThread(supabase, ME, [write("a"), write("b")], () => THREAD);
    assert.equal(result.error, THREADS_UNAVAILABLE);
    resetPostExtrasSupport();
    assert.equal(threadColumnMissing({ code: "42703", message: "column posts.thread_position does not exist" }), true);
    assert.equal(threadColumnMissing({ code: "42501", message: "A thread is 2 to 10 posts from one account, in order" }), false);
  });
});

describe("deleting one post in a thread", () => {
  it("leaves the others, in order, with no gap", () => {
    const posts = [...threadOf("a", "b", "c", "d"), post("plain")];
    const left = postsAfterThreadDelete(posts, "b");
    assert.equal(places(left), "a:0,c:1,d:2");
    assert.ok(left.some((item) => item.id === "plain"), "other posts are untouched");
    assert.equal(left.find((item) => item.id === "plain")?.threadId, undefined);
  });

  it("makes the next post lead when the first is deleted", () => {
    const left = postsAfterThreadDelete(threadOf("a", "b", "c"), "a");
    assert.equal(places(left), "b:0,c:1");
    assert.equal(isThreadContinuation(left.find((item) => item.id === "b")!), false);
  });

  it("leaves the earlier posts alone when the last is deleted", () => {
    assert.equal(places(postsAfterThreadDelete(threadOf("a", "b", "c"), "c")), "a:0,b:1");
  });

  it("turns the last post standing back into a normal post", () => {
    const left = postsAfterThreadDelete(threadOf("a", "b"), "a");
    assert.equal(left.length, 1);
    assert.equal(left[0]!.id, "b");
    assert.equal(left[0]!.threadId, null);
    assert.equal(left[0]!.threadPosition, null);
  });

  it("only removes the post when it is not in a thread, or is unknown", () => {
    const posts = [...threadOf("a", "b", "c"), post("plain")];
    assert.equal(places(postsAfterThreadDelete(posts, "plain")), "a:0,b:1,c:2");
    assert.equal(postsAfterThreadDelete(posts, "nope").length, 4);
  });

  it("does the same in local mode, and takes that post's replies and likes with it", () => {
    const start = db({
      posts: threadOf("a", "b", "c"),
      comments: [
        { id: "r1", postId: "b", authorId: ME, body: "on b", createdAt: "1" },
        { id: "r2", postId: "c", authorId: ME, body: "on c", createdAt: "2" },
      ],
      likes: [{ postId: "b", userId: ME, createdAt: "1" }],
    });
    const result = localDeletePost(start, "b");
    assert.equal(result.error, undefined);
    assert.equal(places(result.db.posts), "a:0,c:1");
    assert.deepEqual(result.db.comments.map((comment) => comment.id), ["r2"]);
    assert.equal(result.db.likes.length, 0);
  });

  it("is what the provider applies after a remote delete", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const remove = provider.slice(provider.indexOf("const deletePost"), provider.indexOf("const pinPost"));
    assert.match(remove, /posts: postsAfterThreadDelete\(existing\.posts, postId\)/);
    assert.match(remove, /postsAfterThreadDelete\(existing\.homePosts, postId\)/);
  });
});

describe("threads in a timeline", () => {
  it("shows the first post only", () => {
    const posts = [...threadOf("a", "b", "c"), post("plain")];
    assert.deepEqual(
      publicTimeline(posts, [], [profile]).map((item) => item.post.id).sort(),
      ["a", "plain"],
    );
    assert.deepEqual(
      profileTimeline(posts, [], [profile], ME).map((item) => item.post.id).sort(),
      ["a", "plain"],
    );
  });

  it("shows the next post once the first is deleted", () => {
    const left = postsAfterThreadDelete(threadOf("a", "b", "c"), "a");
    assert.deepEqual(publicTimeline(left, [], [profile]).map((item) => item.post.id), ["b"]);
  });

  it("still shows a later post of a thread when someone reposts it", () => {
    const posts = threadOf("a", "b");
    const items = publicTimeline(posts, [{ postId: "b", userId: ME, createdAt: "2026-11-14T11:00:00.000Z" }], [profile]);
    assert.deepEqual(items.map((item) => item.post.id).sort(), ["a", "b"]);
  });

  it("links the first post to its thread, and draws the line on the post page", () => {
    const tweet = readFileSync(join(process.cwd(), "components/tweet.tsx"), "utf8");
    assert.match(tweet, /isInThread\(post\)[\s\S]{0,400}Show thread/);
    assert.match(tweet, /data-thread-line="below"/);
    const view = readFileSync(join(process.cwd(), "components/post-view.tsx"), "utf8");
    assert.match(view, /threadPosts\(threadId\)/);
    assert.match(view, /threadBelow=\{after\.length > 0\}/);
    const loader = readFileSync(join(process.cwd(), "lib/social/load-feed-page.ts"), "utf8");
    assert.match(loader, /row\.kind === "post" && post && isThreadContinuation\(post\)/);
  });
});

describe("writing a thread in the composer", () => {
  const seg = (body: string): ThreadSegment => ({ ...EMPTY_SEGMENT, body });

  it("adds the next post after the one being written, up to 10", () => {
    assert.deepEqual(addSegmentAfter([seg("a"), seg("c")], 0).map((item) => item.body), ["a", "", "c"]);
    assert.equal(addSegmentAfter([seg("")], 0).length, 1, "an empty post cannot be followed");
    const full = Array.from({ length: THREAD_MAX }, (_, index) => seg(`p${index}`));
    assert.equal(addSegmentAfter(full, 9).length, THREAD_MAX);
  });

  it("removes a post and keeps writing a sensible one", () => {
    const list = [seg("a"), seg("b"), seg("c")];
    assert.deepEqual(removeSegment(list, 1, 1), { segments: [list[0], list[2]], active: 0 });
    assert.deepEqual(removeSegment(list, 0, 2), { segments: [list[1], list[2]], active: 1 });
    assert.deepEqual(removeSegment(list, 2, 0), { segments: [list[0], list[1]], active: 0 });
    assert.deepEqual(removeSegment([seg("a")], 0, 0), { segments: [seg("a")], active: 0 });
  });

  it("posts the first post and every later post that has something in it", () => {
    assert.deepEqual(segmentsToPost([seg("a"), seg(" "), seg("c")]).map((item) => item.body), ["a", "c"]);
    assert.deepEqual(segmentsToPost([seg("")]).map((item) => item.body), [""]);
  });

  it("has the plus button, 44px targets, and keeps the toolbar on the keyboard", () => {
    const composer = readFileSync(join(process.cwd(), "components/compose-view.tsx"), "utf8");
    assert.match(composer, /aria-label="Add another post"/);
    assert.match(composer, /aria-label="Add a GIF"/);
    assert.match(composer, /const TOOL_BUTTON =\s+"grid h-11 w-11/);
    assert.match(composer, /style=\{\{ bottom: entered \? inset : 0 \}\}/);
    assert.match(composer, /createThread\(inputs\)/);
  });
});

describe("the plus button on Home's composer", () => {
  const gif = {
    id: "abc123",
    mp4: "https://media2.giphy.com/media/abc123/200w.mp4",
    still: "https://media2.giphy.com/media/abc123/200w_s.gif",
    width: 200,
    height: 113,
  };

  it("hands what was written to the full composer as post 1, and opens on post 2", () => {
    clearComposeDraft();
    const key = composeDraftKey({ edit: null, quote: null, card: null })!;
    keepComposeDraft(key, threadDraftFromHome({ body: "First", images: [], cardId: "card-1", gif }));
    const kept = takeComposeDraft(key);
    assert.ok(kept, "the draft is kept even though post 2 is still empty");
    assert.equal(kept.cardId, "card-1");
    const held = draftThread(kept, { body: kept.body, images: kept.images });
    assert.deepEqual(held.segments, [
      { body: "First", images: [], gif },
      { body: "", images: [], gif: null },
    ]);
    assert.equal(held.active, 1);
    assert.equal(takeComposeDraft(key), null, "taken once");
  });

  it("opens an ordinary kept draft on its first post, and never past the end", () => {
    const plain = { body: "Just one", images: ["data:image/png;base64,AAAA"], cardId: "", quoteId: null };
    assert.deepEqual(draftThread(plain, plain), {
      segments: [{ body: "Just one", images: plain.images, gif: null }],
      active: 0,
    });
    assert.equal(draftThread({ ...plain, active: 7 }, plain).active, 0);
  });

  it("is on Home with the GIF button, clears the box, and stays hidden without the columns", () => {
    const feed = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    const composer = feed.slice(feed.indexOf("function Composer("), feed.indexOf("export function FeedLoadError"));
    assert.match(composer, /aria-label="Add a GIF"/);
    assert.match(composer, /aria-label="Add another post"/);
    assert.match(composer, /keepComposeDraft\(key, threadDraftFromHome\(\{ body, images, cardId, gif \}\)\);\s+clear\(\);\s+router\.push\("\/compose"\)/);
    assert.match(composer, /postsSupportGifsAndThreads\(supabase\)/);
    assert.equal(composer.match(/\{extrasOn \? \(/g)?.length, 2, "both buttons wait for the database columns");
    assert.match(composer, /disabled=\{!hasDraft \|\| overLimit \|\| readingPhoto \|\| sending\}/);
    assert.match(composer, /createPost\(\{[^}]*\bgif,/);
  });
});
