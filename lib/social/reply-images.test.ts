import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ReplyPhotos } from "@/components/reply-photos";
import { ReplyPhotoDrafts } from "@/components/compose-photo-drafts";
import { localAddComment, stateAfterReplyDelete, type LocalDb } from "./local-db";
import { remoteAddComment, remoteDeleteComment } from "./remote";
import {
  OPTIMISTIC_REPLY_PREFIX,
  REPLY_PHOTOS_UNAVAILABLE,
  imagesFromNoticeMetadata,
  isOptimisticReply,
  optimisticReply,
  replyImageColumnMissing,
  replyImagesFromValue,
  imagesForReplyNotice,
  replyNoticePreview,
  resetReplyImageSupport,
  settleOptimisticReply,
  withoutOptimisticReply,
} from "./reply-images";
import type { Post } from "./types";

const AUTHOR = "author-1";
const POST = "post-1";
const PHOTO = "data:image/jpeg;base64,YQ==";
const STORED = "https://cdn.example/post-images/author-1/pic.jpg";

afterEach(() => {
  resetReplyImageSupport();
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function localDb(postAuthor = "someone-else"): LocalDb {
  const post: Post = {
    id: POST,
    authorId: postAuthor,
    body: "Holding this",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2026-10-22T00:00:00.000Z",
  };
  return {
    users: [],
    sessionUserId: AUTHOR,
    follows: [],
    posts: [post],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
    messages: [],
    collections: {},
  };
}

function commentClient(insertError: { code?: string; message: string } | null = null) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const uploads: { bucket: string; path: string }[] = [];
  const removed: { bucket: string; paths: string[] }[] = [];
  const supabase = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({ error: table === "comments" ? insertError : null });
        },
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string) {
            uploads.push({ bucket, path });
            return { error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.example/${bucket}/${path}` } };
          },
          async remove(paths: string[]) {
            removed.push({ bucket, paths });
            return { error: null };
          },
        };
      },
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    inserts,
    uploads,
    removed,
  };
}

describe("reply photo upload", () => {
  it("stores a reply photo in the uploader's post-images folder", async () => {
    const fake = commentClient();
    const result = await remoteAddComment(fake.supabase, AUTHOR, POST, "nice", AUTHOR, [PHOTO]);
    assert.equal(result.error, undefined);
    assert.equal(fake.uploads.length, 1);
    assert.equal(fake.uploads[0]?.bucket, "post-images");
    assert.match(fake.uploads[0]?.path ?? "", new RegExp(`^${AUTHOR}/[0-9a-f-]{36}\\.jpg$`));
    const row = fake.inserts.find((item) => item.table === "comments")?.row;
    assert.equal(row?.body, "nice");
    assert.deepEqual(row?.image_urls, [`https://cdn.example/post-images/${fake.uploads[0]?.path}`]);
  });

  it("omits image_urls on a text-only reply", async () => {
    const fake = commentClient();
    const result = await remoteAddComment(fake.supabase, AUTHOR, POST, "  nice card  ", AUTHOR);
    assert.equal(result.error, undefined);
    assert.equal(fake.uploads.length, 0);
    assert.deepEqual(fake.inserts[0]?.row, {
      post_id: POST,
      user_id: AUTHOR,
      body: "nice card",
    });
    assert.equal("image_urls" in (fake.inserts[0]?.row ?? {}), false);
  });

  it("allows a photo-only reply", async () => {
    const fake = commentClient();
    const result = await remoteAddComment(fake.supabase, AUTHOR, POST, "   ", AUTHOR, [STORED]);
    assert.equal(result.error, undefined);
    assert.equal(fake.uploads.length, 0);
    assert.deepEqual(fake.inserts[0]?.row, {
      post_id: POST,
      user_id: AUTHOR,
      body: "",
      image_urls: [STORED],
    });
  });

  it("hides the failure when the image column is not there yet", async () => {
    const fake = commentClient({
      code: "PGRST204",
      message: "Could not find the 'image_urls' column of 'comments' in the schema cache",
    });
    const result = await remoteAddComment(fake.supabase, AUTHOR, POST, "", AUTHOR, [PHOTO]);
    assert.equal(result.error, REPLY_PHOTOS_UNAVAILABLE);
    assert.equal(fake.removed.length, 1);
    assert.equal(fake.removed[0]?.bucket, "post-images");
    const again = commentClient();
    const second = await remoteAddComment(again.supabase, AUTHOR, POST, "", AUTHOR, [PHOTO]);
    assert.equal(second.error, REPLY_PHOTOS_UNAVAILABLE);
    assert.equal(again.uploads.length, 0);
    assert.equal(again.inserts.length, 0);
  });
});

describe("reply photo render", () => {
  it("uses the same img grid as a post", () => {
    const html = renderToStaticMarkup(
      createElement(ReplyPhotos, { images: ["https://cdn.example/post-images/a.jpg"] }),
    );
    assert.match(html, /<img /);
    assert.match(html, /aria-label="View photo"/);
    assert.doesNotMatch(html, /next\/image/);
    const source = read("components/reply-photos.tsx");
    assert.match(source, /PostPhotoGrid/);
    assert.doesNotMatch(source, /from "next\/image"/);
    assert.doesNotMatch(read("components/post-photo-grid.tsx"), /from "next\/image"/);
  });

  it("previews and removes a photo before send", () => {
    const html = renderToStaticMarkup(
      createElement(ReplyPhotoDrafts, { images: [PHOTO], onRemove: () => undefined }),
    );
    assert.match(html, /<img /);
    assert.match(html, /aria-label="Remove photo 1"/);
    assert.match(html, /min-h-11 min-w-11/);
  });

  it("keeps the reply composer, profile replies, and notification previews", () => {
    const post = read("components/post-view.tsx");
    assert.match(post, /aria-label="Add photos"/);
    assert.match(post, /usePostPhotos\(/);
    assert.match(post, /min-h-11 min-w-11/);
    assert.match(post, /<ReplyPhotos /);
    assert.match(post, /commentsSupportReplyImages/);
    assert.match(post, /isOptimisticReply\(reply\.id\)/);
    assert.match(post, /pb-\[calc\(18rem\+env\(safe-area-inset-bottom\)\)\]/);
    assert.match(post, /pb-\[calc\(10rem\+env\(safe-area-inset-bottom\)\)\] min-\[391px\]:pb-24/);
    assert.match(post, /placeholder="Post your reply"/);
    assert.doesNotMatch(post, /14rem/);
    assert.doesNotMatch(post, /from "next\/image"/);

    const profile = read("components/profile-view.tsx");
    assert.match(profile, /tab === "replies"/);
    assert.match(profile, /<ReplyPhotos /);
    assert.match(read("lib/social/profile-tabs.ts"), /comment\.images/);

    const notes = read("components/notifications-view.tsx");
    assert.match(notes, /imagesForReplyNotice/);
    assert.match(notes, /<ReplyPhotos /);
    const feed = read("components/tweet.tsx");
    assert.match(feed, /<ReplyPhotos /);
  });
});

describe("optimistic photo replies", () => {
  it("shows one local preview and drops it without leaving a duplicate", () => {
    const local = optimisticReply({
      postId: POST,
      authorId: AUTHOR,
      body: "",
      images: [PHOTO],
    });
    assert.equal(local.body, "");
    assert.deepEqual(local.images, [PHOTO]);
    assert.equal(isOptimisticReply(local.id), true);
    assert.match(local.id, new RegExp(`^${OPTIMISTIC_REPLY_PREFIX}`));

    const saved = {
      id: "saved-1",
      postId: POST,
      authorId: AUTHOR,
      body: "",
      images: [STORED],
      createdAt: local.createdAt,
    };
    const settled = settleOptimisticReply([local, saved, saved], local.id, saved.id);
    assert.deepEqual(settled.map((comment) => comment.id), ["saved-1"]);
    assert.deepEqual(withoutOptimisticReply([local, saved], local.id), [saved]);

    const provider = read("components/social-provider.tsx");
    assert.match(provider, /optimisticReply\(/);
    assert.match(provider, /withoutOptimisticReply/);
    assert.match(provider, /const sendKey = `reply:\$\{postId\}:\$\{text\}:\$\{photos\.join\("\|"\)\}`/);
    assert.match(provider, /if \(inflight\) return inflight as Promise<AuthResult>/);
  });
});

describe("photo-only reply text", () => {
  it("uses Photo when the reply has pictures and no words", async () => {
    assert.equal(replyNoticePreview("   ", [STORED]), "Photo");
    assert.equal(replyNoticePreview("nice card", [STORED]), "nice card");
    assert.equal(replyNoticePreview("   ", []), null);
    assert.equal(replyNoticePreview("\n\t\r", []), null);
    const blank = await remoteAddComment(commentClient().supabase, AUTHOR, POST, "\n\t\r ", AUTHOR);
    assert.match(blank.error ?? "", /Write a comment/);
    const saved = localAddComment(localDb(), POST, "  ", [STORED]);
    assert.equal(saved.error, undefined);
    assert.equal(saved.db.comments[0]?.body, "");
    assert.deepEqual(saved.db.comments[0]?.images, [STORED]);
    assert.equal(saved.db.notifications[0]?.preview, "Photo");
    assert.deepEqual(saved.db.notifications[0]?.metadata, { images: [STORED] });
  });

  it("keeps only renderable notice photos", () => {
    assert.deepEqual(imagesFromNoticeMetadata({ images: [STORED, "javascript:alert(1)"] }), []);
    assert.equal(replyImageColumnMissing({ code: "42703", message: "column image_urls does not exist" }), true);
    assert.equal(replyImageColumnMissing({ code: "42501", message: "permission denied for table comments" }), false);
    assert.deepEqual(replyImagesFromValue(["nope", STORED]), []);
  });

  it("shows photos from the reply the notice belongs to", () => {
    const early = {
      authorId: AUTHOR,
      createdAt: "2026-10-23T00:00:00.000Z",
      images: ["https://cdn.example/early.jpg"],
    };
    const later = {
      authorId: AUTHOR,
      createdAt: "2026-10-23T00:05:00.000Z",
      images: ["https://cdn.example/later.jpg"],
    };
    assert.deepEqual(
      imagesForReplyNotice(
        { actorId: AUTHOR, postId: POST, createdAt: "2026-10-23T00:00:01.000Z" },
        [later, early],
      ),
      early.images,
    );
  });

  it("deletes only the newest null preview for a photo-only reply", async () => {
    const calls: string[] = [];
    const supabase = {
      from(table: string) {
        const filters: string[] = [];
        let op = "";
        const api = {
          delete() {
            op = "delete";
            return api;
          },
          select() {
            op = "select";
            return api;
          },
          eq(column: string, value: string) {
            filters.push(`${column}=${value}`);
            return api;
          },
          is(column: string, value: unknown) {
            filters.push(`${column} is ${String(value)}`);
            return api;
          },
          order() {
            return api;
          },
          limit() {
            return api;
          },
          then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            calls.push(`${table}:${op}:${filters.join(",")}`);
            const value =
              table === "comments"
                ? { data: [{ id: "c1", post_id: POST, body: "", image_urls: [STORED] }], error: null }
                : op === "select"
                  ? { data: [{ id: "note-new" }], error: null }
                  : { data: null, error: null };
            return Promise.resolve(value).then(onFulfilled, onRejected);
          },
        };
        return api;
      },
    };
    const result = await remoteDeleteComment(supabase as unknown as SupabaseClient, AUTHOR, "c1");
    assert.equal(result.error, undefined);
    assert.equal(calls.some((call) => call.includes("preview=Photo")), false);
    assert.equal(
      calls.some((call) => call.startsWith("notifications:select:") && call.includes("preview is null")),
      true,
    );
    assert.equal(calls.some((call) => call === `notifications:delete:id=note-new,actor_id=${AUTHOR}`), true);
  });

  it("drops only the newest photo-only notice when a photo reply is deleted", () => {
    const older = {
      id: "n-old",
      recipientId: "someone",
      actorId: AUTHOR,
      kind: "comment" as const,
      postId: POST,
      preview: "Photo",
      createdAt: "2026-10-23T00:00:00.000Z",
      read: false,
    };
    const newer = { ...older, id: "n-new", createdAt: "2026-10-23T00:05:00.000Z" };
    const next = stateAfterReplyDelete(
      {
        comments: [
          {
            id: "c-old",
            postId: POST,
            authorId: AUTHOR,
            body: "",
            images: [STORED],
            createdAt: older.createdAt,
          },
        ],
        likes: [],
        reposts: [],
        notifications: [older, newer],
      },
      "c-old",
      {},
    );
    assert.deepEqual(
      next.notifications.map((note) => note.id),
      ["n-old"],
    );
  });
});

describe("reply image migration", () => {
  it("adds one image_urls column and leaves comment policies alone", () => {
    const sql = read("supabase/migrations/20261023130000_reply_images.sql");
    assert.match(sql, /add column if not exists image_urls text\[\] not null default '\{\}'/);
    assert.match(sql, /cardinality\(image_urls\) between 0 and 4/);
    assert.match(sql, /cardinality\(image_urls\) between 1 and 4/);
    assert.match(sql, /create or replace function private\.reply_image_urls_ok/);
    assert.match(sql, /set search_path = ''/);
    assert.match(sql, /btrim\(body, E' \\t\\r\\n'\)/);
    assert.doesNotMatch(sql, /drop policy/i);
    assert.doesNotMatch(sql, /pg_catalog\.(coalesce|nullif|greatest|least)/);
    const verify = read("scripts/verify-reply-images.sql");
    assert.match(verify, /transaction_read_only = on/);
    assert.match(verify, /rollback;/);
    assert.doesNotMatch(verify, /^\s*(insert|update|delete)\b/im);
  });
});
