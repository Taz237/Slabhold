import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetMultiPhotoSupport } from "./post-photos";
import type { PublicCard } from "./types";
import { postWantAlerts, remoteCreatePost, remoteUpdatePost } from "./remote";

function card(): PublicCard {
  return {
    id: "card-1",
    playerName: "Jordan Love",
    year: 2020,
    setBrand: "Select",
    cardNumber: "47",
    sport: "Football",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 30,
  };
}

function client(
  failOn: number | null = null,
  options?: {
    failInsert?: boolean;
    failCardPhoto?: boolean;
    failUpdate?: boolean;
    metaMissingOnce?: boolean;
  },
) {
  const removed: string[] = [];
  const removedBuckets: string[] = [];
  let uploads = 0;
  let inserts = 0;
  const supabase = {
    storage: {
      from(bucket: string) {
        return {
          async upload() {
            if (options?.failCardPhoto && bucket === "card-photos") {
              return { error: { message: "card photo failed" } };
            }
            uploads += 1;
            if (failOn != null && uploads === failOn) return { error: { message: "disk full" } };
            return { error: null };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}`,
              },
            };
          },
          async remove(paths: string[]) {
            removed.push(...paths);
            for (const path of paths) removedBuckets.push(`${bucket}:${path}`);
            return { data: null, error: null };
          },
        };
      },
    },
    from() {
      const query = {
        insert() {
          return query;
        },
        select() {
          return query;
        },
        eq() {
          return query;
        },
        is() {
          return query;
        },
        in() {
          return query;
        },
        delete() {
          return query;
        },
        maybeSingle: async () => ({ data: { meta: null }, error: null }),
        single: async () => {
          inserts += 1;
          if (options?.metaMissingOnce && inserts === 1) {
            return {
              data: null,
              error: {
                code: "PGRST204",
                message: "Could not find the 'meta' column of 'posts' in the schema cache",
              },
            };
          }
          if (options?.failInsert) return { data: null, error: { message: "insert failed" } };
          return { data: { id: "post-1" }, error: null };
        },
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: [], error: null });
        },
        update() {
          const pending = {
            eq() {
              return pending;
            },
            then(resolve: (value: { error: { message: string } | null }) => void) {
              resolve(options?.failUpdate ? { error: { message: "could not update" } } : { error: null });
            },
          };
          return pending;
        },
      };
      return query;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, removed, removedBuckets };
}

describe("remoteCreatePost", () => {
  it("does not ping a want match when the post shares a card that was just added", async () => {
    const calls: Array<[string, string]> = [];
    const original = postWantAlerts.ping;
    postWantAlerts.ping = (type, id) => {
      calls.push([type, id]);
    };
    try {
      const { supabase } = client();
      const shared = await remoteCreatePost(supabase, "author", {
        body: "Shared",
        imageDataUrl: null,
        images: [],
        card: card(),
        shareOfNewCard: true,
      });
      assert.equal(shared.error, undefined);
      assert.equal(shared.postId, "post-1");
      assert.deepEqual(calls, []);

      const later = await remoteCreatePost(supabase, "author", {
        body: "Later",
        imageDataUrl: null,
        images: [],
        card: card(),
      });
      assert.equal(later.postId, "post-1");
      assert.deepEqual(calls, [["post", "post-1"]]);
    } finally {
      postWantAlerts.ping = original;
    }
  });

  it("deletes photos already uploaded when a later photo in the batch fails", async () => {
    const { supabase, removed } = client(2);
    const result = await remoteCreatePost(supabase, "author", {
      body: "Photos",
      imageDataUrl: "data:image/jpeg;base64,YQ==",
      images: ["data:image/jpeg;base64,YQ==", "data:image/jpeg;base64,Yg=="],
      card: null,
    });
    assert.equal(result.error, "disk full");
    assert.equal(result.postId, undefined);
    assert.equal(removed.length, 1);
    assert.match(removed[0], /^author\//);
  });

  it("removes uploaded photos when the card photo or the post insert fails", async () => {
    const cardPhoto = client(null, { failCardPhoto: true });
    const withCard = {
      ...card(),
      photoDataUrl: "data:image/jpeg;base64,Yg==",
    };
    const cardResult = await remoteCreatePost(cardPhoto.supabase, "author", {
      body: "Shared",
      imageDataUrl: "data:image/jpeg;base64,YQ==",
      images: ["data:image/jpeg;base64,YQ=="],
      card: withCard,
    });
    assert.equal(cardResult.error, "card photo failed");
    assert.equal(cardResult.postId, undefined);
    assert.equal(cardPhoto.removed.length, 1);

    const inserted = client(null, { failInsert: true });
    const insertResult = await remoteCreatePost(inserted.supabase, "author", {
      body: "Photos",
      imageDataUrl: "data:image/jpeg;base64,YQ==",
      images: ["data:image/jpeg;base64,YQ=="],
      card: null,
    });
    assert.equal(insertResult.error, "insert failed");
    assert.equal(inserted.removed.length, 1);
  });

  it("removes the card photo as well when the post insert fails", async () => {
    const { supabase, removedBuckets } = client(null, { failInsert: true });
    const result = await remoteCreatePost(supabase, "author", {
      body: "Both",
      imageDataUrl: "data:image/jpeg;base64,YQ==",
      images: ["data:image/jpeg;base64,YQ=="],
      card: { ...card(), photoDataUrl: "data:image/jpeg;base64,Yg==" },
    });
    assert.equal(result.error, "insert failed");
    assert.equal(result.postId, undefined);
    const buckets = removedBuckets.map((item) => item.split(":")[0]);
    assert.deepEqual(buckets.sort(), ["card-photos", "post-images"]);
  });

  it("keeps uploaded photos when a missing meta column is saved on retry", async () => {
    try {
      const { supabase, removed } = client(null, { metaMissingOnce: true });
      const result = await remoteCreatePost(supabase, "author", {
        body: "Photos",
        imageDataUrl: "data:image/jpeg;base64,YQ==",
        images: ["data:image/jpeg;base64,YQ==", "data:image/jpeg;base64,Yg=="],
        card: null,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.postId, "post-1");
      assert.deepEqual(removed, []);
    } finally {
      resetMultiPhotoSupport();
    }
  });

  it("removes uploaded photos when a post update fails", async () => {
    const { supabase, removed } = client(null, { failUpdate: true });
    const result = await remoteUpdatePost(supabase, "author", "post-1", {
      body: "Edit",
      imageDataUrl: "data:image/jpeg;base64,YQ==",
      images: ["data:image/jpeg;base64,YQ=="],
    });
    assert.equal(result.error, "could not update");
    assert.equal(removed.length, 1);
    assert.match(removed[0], /^author\//);
  });
});
