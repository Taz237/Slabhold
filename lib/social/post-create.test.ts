import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicCard } from "./types";
import { postWantAlerts, remoteCreatePost } from "./remote";

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

function builder(single: { data: { id: string } | null; error: { message: string } | null }) {
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
    single: async () => single,
    then(
      resolve: (value: { data: unknown[]; error: null }) => void,
    ) {
      resolve({ data: [], error: null });
    },
  };
  return query;
}

function client(failOn: number | null = null) {
  const removed: string[] = [];
  let uploads = 0;
  const supabase = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "post-images");
        return {
          async upload() {
            uploads += 1;
            if (failOn != null && uploads === failOn) return { error: { message: "disk full" } };
            return { error: null };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl: `https://proj.supabase.co/storage/v1/object/public/post-images/${path}`,
              },
            };
          },
          async remove(paths: string[]) {
            removed.push(...paths);
            return { data: null, error: null };
          },
        };
      },
    },
    from() {
      return builder({ data: { id: "post-1" }, error: null });
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, removed };
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
});
