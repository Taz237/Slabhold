import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { remoteCreatePost, remoteUpdatePost, videoPostImageUrl } from "./remote";
import { resetVideoSupport, type PostVideo } from "./videos";

// Read when each check runs, so setting it here is enough.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://knuwflptobyutrauxblj.supabase.co";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const BASE = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/post-videos";
const VIDEO: PostVideo = {
  url: `${BASE}/${AUTHOR}/33333333-3333-4333-8333-333333333333.mov`,
  poster: `${BASE}/${AUTHOR}/44444444-4444-4444-8444-444444444444.jpg`,
  width: 1080,
  height: 1920,
  duration: 12.4,
  mime: "video/quicktime",
};

/**
 * Records every insert and update row. `stored` is what a read of
 * posts.video returns for the post being edited.
 */
function recorder(stored: unknown) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const supabase = {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string) {
            uploads.push(path);
            return { error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
          },
          async remove() {
            return { data: null, error: null };
          },
        };
      },
    },
    from() {
      let columns = "";
      const query = {
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          return query;
        },
        update(row: Record<string, unknown>) {
          updates.push(row);
          return query;
        },
        select(cols: string) {
          columns = cols;
          return query;
        },
        eq: () => query,
        is: () => query,
        in: () => query,
        delete: () => query,
        maybeSingle: async () =>
          columns === "video" ? { data: { video: stored }, error: null } : { data: { meta: null }, error: null },
        single: async () => ({ data: { id: "post-1" }, error: null }),
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: async () => ({ data: true, error: null }),
  } as unknown as SupabaseClient;
  return { supabase, inserts, updates, uploads };
}

describe("a video post's image_url", () => {
  beforeEach(() => resetVideoSupport());

  it("is exactly the video's poster when the post is created", async () => {
    const { supabase, inserts } = recorder(null);
    const result = await remoteCreatePost(supabase, AUTHOR, { body: "pull", imageDataUrl: null, card: null, video: VIDEO });
    assert.equal(result.error, undefined);
    const row = inserts[0]!;
    assert.equal(row.image_url, VIDEO.poster);
    assert.equal((row.video as PostVideo).poster, row.image_url);
  });

  it("stays exactly the stored poster when the text is edited, and gains no photo", async () => {
    // Stored with a poster spelled as the database has it, even if the composer passed nothing.
    const { supabase, updates, uploads } = recorder(VIDEO);
    const result = await remoteUpdatePost(supabase, AUTHOR, "post-1", {
      body: "new words",
      imageDataUrl: "data:image/jpeg;base64,YQ==",
      images: ["data:image/jpeg;base64,YQ=="],
    });
    assert.equal(result.error, undefined);
    assert.equal(updates.length, 1);
    assert.equal(updates[0]!.image_url, VIDEO.poster);
    assert.deepEqual(uploads, []);
    assert.equal(updates[0]!.meta, null);
  });

  it("keeps a stored poster even when this browser's URL check would reject it", async () => {
    const elsewhere = { ...VIDEO, poster: "https://cdn.example.com/p.jpg" };
    const { supabase, updates } = recorder(elsewhere);
    await remoteUpdatePost(supabase, AUTHOR, "post-1", { body: "edit", imageDataUrl: null });
    assert.equal(updates[0]!.image_url, "https://cdn.example.com/p.jpg");
  });

  it("leaves photo posts as they were", async () => {
    const { supabase, updates, uploads } = recorder(null);
    await remoteUpdatePost(supabase, AUTHOR, "post-1", {
      body: "edit",
      imageDataUrl: "data:image/jpeg;base64,YQ==",
      images: ["data:image/jpeg;base64,YQ=="],
    });
    assert.equal(uploads.length, 1);
    assert.match(String(updates[0]!.image_url), /\/post-images\//);
  });

  it("reads the stored video as poster, null, or no video at all", () => {
    assert.equal(videoPostImageUrl(VIDEO), VIDEO.poster);
    assert.equal(videoPostImageUrl({ url: VIDEO.url }), null);
    assert.equal(videoPostImageUrl(null), undefined);
    assert.equal(videoPostImageUrl(undefined), undefined);
    assert.equal(videoPostImageUrl("video"), undefined);
  });
});
