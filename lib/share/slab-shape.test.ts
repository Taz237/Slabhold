import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reachableShare } from "../../components/og-frame";
import { slabHeight, slabPhotoHeight } from "../../components/og-share";
import { homeShareImage, shareSlab, type ShareImage } from "../social/share-image";
import { jpegHead, pngHead, webpLossy } from "./image-size-fixtures";

const ORIGIN = "https://project.supabase.co";
const photo = (name: string) => `${ORIGIN}/storage/v1/object/public/card-photos/user/${name}`;

process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;

function modelWith(srcs: string[]): ShareImage {
  return {
    ...homeShareImage(),
    kind: "collection",
    slabs: srcs.map((src) => shareSlab(src, { player: "Fixture Player", grade: "10", grader: "PSA", conditionType: "graded" })),
  };
}

async function withPhotos<T>(bodies: Record<string, Uint8Array | null>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = bodies[url];
    if (body === undefined) return new Response(null, { status: 404 });
    return new Response(body ? new Uint8Array(body) : null, { status: 200, headers: { "content-type": "image/jpeg" } });
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

describe("share slab shape", () => {
  it("marks a wide photo landscape and a tall one portrait", async () => {
    const shared = await withPhotos(
      {
        [photo("wide.jpg")]: jpegHead(1400, 1000),
        [photo("tall.png")]: pngHead(1000, 1400),
        [photo("wide.webp")]: webpLossy(700, 500),
      },
      () => reachableShare(modelWith([photo("wide.jpg"), photo("tall.png"), photo("wide.webp")])),
    );
    assert.deepEqual(
      shared.slabs.map((slab) => slab.shape),
      ["landscape", "portrait", "landscape"],
    );
  });

  it("leaves a slab unchanged when its size is unknown, and still drops unreachable photos", async () => {
    const model = modelWith([photo("mystery.jpg"), photo("gone.jpg"), photo("square.jpg")]);
    const shared = await withPhotos(
      {
        [photo("mystery.jpg")]: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
        [photo("square.jpg")]: jpegHead(1000, 1050),
      },
      () => reachableShare(model),
    );
    assert.equal(shared.slabs.length, 2);
    assert.deepEqual(shared.slabs[0], model.slabs[0]);
    assert.equal("shape" in shared.slabs[0]!, false);
    assert.equal(shared.slabs[1]?.shape, "portrait");
  });

  it("draws a landscape slab 7:5 and keeps the portrait slab as it was", () => {
    assert.equal(slabPhotoHeight(280, "landscape"), 200);
    assert.equal(slabPhotoHeight(280, "portrait"), 392);
    assert.equal(slabPhotoHeight(280, undefined), 392);
    const [slab] = modelWith([photo("a.jpg")]).slabs;
    assert.ok(slab);
    const portrait = slabHeight(slab, 300);
    assert.equal(slabHeight({ ...slab, shape: "portrait" }, 300), portrait);
    assert.equal(portrait - slabHeight({ ...slab, shape: "landscape" }, 300), 378 - 193);
  });
});
