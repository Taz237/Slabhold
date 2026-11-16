import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { remoteDeleteComment, remoteDeletePost } from "./remote";
import { resetVideoSupport } from "./videos";

// Read when each check runs, so setting it here is enough.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://knuwflptobyutrauxblj.supabase.co";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const FILE = "33333333-3333-4333-8333-333333333333";
const POSTER = "44444444-4444-4444-8444-444444444444";
const BASE = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/post-videos";
const VIDEO = {
  url: `${BASE}/${AUTHOR}/${FILE}.mp4`,
  poster: `${BASE}/${AUTHOR}/${POSTER}.jpg`,
  width: 1920,
  height: 1080,
  duration: 30,
  mime: "video/mp4",
};

type Result = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A client that answers each table read or delete from `answers`, in order,
 * and records storage removes.
 */
function fakeClient(answers: { posts?: Result[]; comments?: Result[] }) {
  const ops: string[] = [];
  const removed: { bucket: string; paths: string[] }[] = [];
  const queues = { posts: [...(answers.posts ?? [])], comments: [...(answers.comments ?? [])] };
  const client = {
    from(table: "posts" | "comments" | "notifications") {
      let kind = "";
      const api = {
        select(columns: string) {
          ops.push(`${table}:${kind || "select"}:${columns}`);
          if (kind === "delete") return Promise.resolve(queues[table as "comments"].shift());
          return api;
        },
        delete() {
          kind = "delete";
          return api;
        },
        eq() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve(queues[table as "posts"].shift());
        },
        then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
          if (table === "notifications") return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          ops.push(`${table}:${kind}`);
          return Promise.resolve(queues[table as "posts"].shift() ?? { data: null, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
    storage: {
      from(bucket: string) {
        return {
          remove(paths: string[]) {
            removed.push({ bucket, paths });
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
  };
  return { supabase: client as unknown as SupabaseClient, ops, removed };
}

describe("deleting a post deletes its video", () => {
  beforeEach(() => resetVideoSupport());

  it("removes the video and its poster from storage after the post is gone", async () => {
    const { supabase, ops, removed } = fakeClient({
      posts: [
        { data: { video: VIDEO }, error: null },
        { data: null, error: null },
      ],
    });
    assert.deepEqual(await remoteDeletePost(supabase, AUTHOR, "p1"), {});
    assert.deepEqual(ops, ["posts:select:video", "posts:delete"]);
    assert.deepEqual(removed, [{ bucket: "post-videos", paths: [`${AUTHOR}/${FILE}.mp4`, `${AUTHOR}/${POSTER}.jpg`] }]);
  });

  it("keeps the video when the delete fails", async () => {
    const { supabase, removed } = fakeClient({
      posts: [
        { data: { video: VIDEO }, error: null },
        { data: null, error: { message: "nope" } },
      ],
    });
    assert.deepEqual(await remoteDeletePost(supabase, AUTHOR, "p1"), { error: "nope" });
    assert.deepEqual(removed, []);
  });

  it("touches no storage for a post without a video, or before the column exists", async () => {
    const plain = fakeClient({ posts: [{ data: { video: null }, error: null }, { data: null, error: null }] });
    assert.deepEqual(await remoteDeletePost(plain.supabase, AUTHOR, "p1"), {});
    assert.deepEqual(plain.removed, []);

    const old = fakeClient({
      posts: [
        { data: null, error: { code: "42703", message: "column posts.video does not exist" } },
        { data: null, error: null },
      ],
    });
    assert.deepEqual(await remoteDeletePost(old.supabase, AUTHOR, "p1"), {});
    assert.deepEqual(old.removed, []);
    // Known missing now: the next delete doesn't ask again.
    const next = fakeClient({ posts: [{ data: null, error: null }] });
    assert.deepEqual(await remoteDeletePost(next.supabase, AUTHOR, "p2"), {});
    assert.deepEqual(next.ops, ["posts:delete"]);
  });

  it("never removes a file outside the author's own folder", async () => {
    const foreign = { ...VIDEO, url: VIDEO.url.replace(AUTHOR, "22222222-2222-4222-8222-222222222222") };
    const { supabase, removed } = fakeClient({
      posts: [{ data: { video: foreign }, error: null }, { data: null, error: null }],
    });
    assert.deepEqual(await remoteDeletePost(supabase, AUTHOR, "p1"), {});
    assert.deepEqual(removed, []);
  });
});

describe("deleting a reply deletes its video", () => {
  beforeEach(() => resetVideoSupport());

  it("reads the video back from the delete and removes both files", async () => {
    const { supabase, ops, removed } = fakeClient({
      comments: [{ data: [{ id: "c1", post_id: "p1", body: "", image_urls: [], video: VIDEO }], error: null }],
    });
    assert.deepEqual(await remoteDeleteComment(supabase, AUTHOR, "c1"), {});
    assert.deepEqual(ops, ["comments:delete:id, post_id, body, image_urls, video"]);
    assert.deepEqual(removed, [{ bucket: "post-videos", paths: [`${AUTHOR}/${FILE}.mp4`, `${AUTHOR}/${POSTER}.jpg`] }]);
  });

  it("falls back without the video column and still deletes the reply", async () => {
    const { supabase, ops, removed } = fakeClient({
      comments: [
        { data: null, error: { code: "42703", message: "column comments.video does not exist" } },
        { data: [{ id: "c1", post_id: "p1", body: "hi", image_urls: [] }], error: null },
      ],
    });
    assert.deepEqual(await remoteDeleteComment(supabase, AUTHOR, "c1"), {});
    assert.deepEqual(ops, [
      "comments:delete:id, post_id, body, image_urls, video",
      "comments:delete:id, post_id, body, image_urls",
    ]);
    assert.deepEqual(removed, []);
  });
});
