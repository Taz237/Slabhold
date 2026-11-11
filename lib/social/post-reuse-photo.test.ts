import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { remoteCreatePost } from "./remote";
import type { PublicCard } from "./types";

const STORED = "https://cdn.example/card-photos/author/abc.jpg";

function fake(storedImage: string | null) {
  const uploads: string[] = [];
  const inserted: Record<string, unknown>[] = [];
  const supabase = {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string) {
            uploads.push(`${bucket}/${path}`);
            return { error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.example/${path}` } };
          },
          async remove() {
            return { data: null, error: null };
          },
        };
      },
    },
    from(table: string) {
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        insert(row: Record<string, unknown>) {
          if (table === "posts") inserted.push(row);
          return query;
        },
        maybeSingle: async () =>
          table === "cards" ? { data: storedImage ? { image_url: storedImage } : null, error: null } : { data: null, error: null },
        single: async () => ({ data: { id: "post-1" }, error: null }),
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: [], error: null });
        },
      };
      return query;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, uploads, inserted };
}

function card(photoDataUrl: string | null): PublicCard {
  return {
    id: "card-1",
    playerName: "Fixture Player",
    year: 2024,
    setBrand: "Prizm",
    cardNumber: "1",
    sport: "Basketball",
    photoDataUrl,
    accent: "#7c5cff",
    estimatedSellPrice: 30,
  };
}

describe("the feed post after Add card reuses the card's photo", () => {
  it("attaches the photo the card already stored and uploads nothing", async () => {
    const { supabase, uploads, inserted } = fake(STORED);
    const result = await remoteCreatePost(supabase, "author", {
      body: "Just added my 2024 Prizm Fixture Player",
      imageDataUrl: null,
      images: [],
      card: card("data:image/jpeg;base64,YQ=="),
      shareOfNewCard: true,
    });
    assert.equal(result.error, undefined);
    assert.deepEqual(uploads, []);
    assert.equal((inserted[0]?.card as PublicCard).photoDataUrl, STORED);
  });

  it("keeps a photo that is already a URL as it is", async () => {
    const { supabase, uploads, inserted } = fake(STORED);
    await remoteCreatePost(supabase, "author", {
      body: "x",
      imageDataUrl: null,
      images: [],
      card: card("https://cdn.example/already.jpg"),
      shareOfNewCard: true,
    });
    assert.deepEqual(uploads, []);
    assert.equal((inserted[0]?.card as PublicCard).photoDataUrl, "https://cdn.example/already.jpg");
  });
});
