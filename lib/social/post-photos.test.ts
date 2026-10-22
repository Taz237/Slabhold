import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { ComposePhotoDrafts } from "@/components/compose-photo-drafts";
import { LightboxNav } from "@/components/image-lightbox";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { PostPhotoGrid } from "@/components/post-photo-grid";
import {
  MAX_POST_PHOTOS,
  POST_PHOTO_LIMIT_ERROR,
  appendPostPhotos,
  imagesFromRow,
  isRenderablePostPhoto,
  metaColumnMissing,
  photosBesideCard,
  postPhotoGridClass,
  postPhotoLimit,
} from "./post-photos";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ref = { current: null };

describe("post photos", () => {
  it("keeps four photos and rejects a fifth", () => {
    const incoming = ["a", "b", "c", "d", "e"];
    const added = appendPostPhotos([], incoming);
    assert.equal(MAX_POST_PHOTOS, 4);
    assert.deepEqual(added.photos, ["a", "b", "c", "d"]);
    assert.equal(added.rejected, 1);
    assert.equal(POST_PHOTO_LIMIT_ERROR, "You can add up to 4 photos.");

    const oneMore = appendPostPhotos(added.photos, ["f"]);
    assert.deepEqual(oneMore.photos, added.photos);
    assert.equal(oneMore.rejected, 1);
  });

  it("turns extra photos off when posts.meta is missing", () => {
    assert.equal(postPhotoLimit(true), 4);
    assert.equal(postPhotoLimit(false), 1);
    assert.equal(
      metaColumnMissing({
        code: "PGRST204",
        message: "Could not find the 'meta' column of 'posts' in the schema cache",
      }),
      true,
    );
    assert.equal(metaColumnMissing({ code: "23505", message: "duplicate key" }), false);
    const capped = appendPostPhotos(["one"], ["two"], postPhotoLimit(false));
    assert.deepEqual(capped.photos, ["one"]);
    assert.equal(capped.rejected, 1);
  });

  it("reads extra photos from meta.images and leaves Mail Day photos alone", () => {
    const base = "https://proj.supabase.co";
    const postPhoto = `${base}/storage/v1/object/public/post-images/user/a.jpg`;
    const second = `${base}/storage/v1/object/public/post-images/user/b.jpg`;
    const cardPhoto = `${base}/storage/v1/object/public/card-photos/user/c.jpg`;
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = base;
    try {
      assert.deepEqual(
        imagesFromRow({
          image_url: postPhoto,
          post_type: "post",
          meta: { images: [postPhoto, second] },
        }),
        [postPhoto, second],
      );
      assert.deepEqual(
        imagesFromRow({
          image_url: cardPhoto,
          post_type: "mail_day",
          meta: {
            photos: [cardPhoto, second],
            images: [`${base}/storage/v1/object/public/post-images/user/nope.jpg`],
          },
        }),
        [cardPhoto],
      );
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("drops external and javascript photo URLs and keeps at most four", () => {
    const base = "https://proj.supabase.co";
    const own = (name: string) => `${base}/storage/v1/object/public/post-images/user/${name}.jpg`;
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = base;
    try {
      assert.equal(isRenderablePostPhoto("javascript:alert(1)"), false);
      assert.equal(isRenderablePostPhoto("https://evil.example/photo.jpg"), false);
      assert.equal(isRenderablePostPhoto(`${base}/storage/v1/object/public/avatars/a.jpg`), false);
      assert.equal(isRenderablePostPhoto("data:image/jpeg;base64,abc"), false);
      assert.equal(isRenderablePostPhoto("data:image/jpeg;base64,YQ=="), true);
      assert.deepEqual(
        imagesFromRow({
          image_url: "https://evil.example/photo.jpg",
          meta: {
            images: [
              own("1"),
              "javascript:alert(1)",
              "https://evil.example/photo.jpg",
              own("2"),
              own("3"),
              own("4"),
              own("5"),
              "data:image/png;base64,abc",
            ],
          },
        }),
        [own("1"), own("2"), own("3"), own("4")],
      );
      assert.deepEqual(
        imagesFromRow({ image_url: "javascript:alert(1)" }),
        [],
      );
      assert.deepEqual(imagesFromRow({ image_url: own("only") }), [own("only")]);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("rejects traversal and limits data URLs to the same rules as cleanImageUrl", () => {
    const base = "https://proj.supabase.co";
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = base;
    try {
      assert.equal(isRenderablePostPhoto(`${base}/storage/v1/object/public/post-images/user/a.jpg`), true);
      assert.equal(isRenderablePostPhoto(`${base}/storage/v1/object/public/card-photos/user/a.jpg`), true);
      assert.equal(
        isRenderablePostPhoto(`${base}/storage/v1/object/public/post-images/user/../a.jpg`),
        false,
      );
      assert.equal(
        isRenderablePostPhoto(`${base}/storage/v1/object/public/post-images/%2e%2e/a.jpg`),
        false,
      );
      assert.equal(
        isRenderablePostPhoto(`${base}/storage/v1/object/public/post-images/%2E%2E/a.jpg`),
        false,
      );
      assert.equal(
        isRenderablePostPhoto(`${base}/storage/v1/object/public/post-images%2Fuser/a.jpg`),
        false,
      );
      assert.equal(
        isRenderablePostPhoto(`${base}/storage/v1/object/public/post-images/%2Fuser/a.jpg`),
        false,
      );
      assert.equal(
        isRenderablePostPhoto(`${base}/storage/v1/object/public/post-images/user/%25.jpg`),
        false,
      );
      assert.equal(
        isRenderablePostPhoto(
          "https://user:pass@proj.supabase.co/storage/v1/object/public/post-images/user/a.jpg",
        ),
        false,
      );
      assert.equal(isRenderablePostPhoto("data:image/png;base64,YQ=="), true);
      assert.equal(isRenderablePostPhoto("data:image/webp;base64,YQ=="), true);
      assert.equal(isRenderablePostPhoto("data:image/gif;base64,YQ=="), true);
      assert.equal(isRenderablePostPhoto("data:image/svg+xml,<svg></svg>"), false);
      assert.equal(
        isRenderablePostPhoto(`data:image/jpeg;base64,${"A".repeat(2_796_204)}`),
        false,
      );
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("allows any data:image while the app is in local mode", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      assert.equal(isRenderablePostPhoto("data:image/svg+xml,<svg></svg>"), true);
      assert.equal(isRenderablePostPhoto("data:text/plain,hi"), false);
      assert.equal(
        isRenderablePostPhoto("https://proj.supabase.co/storage/v1/object/public/post-images/a.jpg"),
        false,
      );
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("does not show the attached card photo a second time", () => {
    const photo = "https://proj.supabase.co/storage/v1/object/public/card-photos/user/a.jpg";
    assert.deepEqual(photosBesideCard([photo, `${photo}-2`], photo), [`${photo}-2`]);
    assert.deepEqual(photosBesideCard([photo], photo), []);
    assert.deepEqual(photosBesideCard([photo], null), [photo]);
  });

  it("renders a photo grid and opens each photo", () => {
    const photos = ["one", "two", "three", "four", "five"];
    const html = renderToStaticMarkup(
      createElement(PostPhotoGrid, { images: photos, onOpen: () => undefined }),
    );
    assert.equal(postPhotoGridClass(4), "grid grid-cols-2 gap-0.5");
    assert.match(html, /data-photo-grid="4"/);
    assert.match(html, /grid-cols-2/);
    assert.equal(html.match(/View photo \d/g)?.length, 4);
    assert.doesNotMatch(html, /five/);
    assert.match(html, /src="one"/);
    assert.match(html, /src="four"/);

    const three = renderToStaticMarkup(
      createElement(PostPhotoGrid, {
        images: ["one", "two", "three"],
        onOpen: () => undefined,
      }),
    );
    assert.match(three, /data-photo-grid="3"/);
    assert.match(three, /grid-rows-2/);
    assert.match(three, /row-span-2/);
    assert.equal(three.match(/View photo \d/g)?.length, 3);

    const single = renderToStaticMarkup(
      createElement(PostPhotoGrid, { images: ["only"], onOpen: () => undefined }),
    );
    assert.match(single, /aria-label="View photo"/);
    assert.doesNotMatch(single, /data-photo-grid/);
  });

  it("lets the library pick many photos and keeps capture on the camera input", () => {
    const html = renderToStaticMarkup(
      createElement(PhotoFileInputs, {
        cameraRef: ref,
        libraryRef: ref,
        libraryMultiple: true,
        onPick: () => undefined,
        onPickMany: () => undefined,
      }),
    );
    const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
    const camera = inputs.find((input) => input.includes('data-photo-input="camera"'));
    const library = inputs.find((input) => input.includes('data-photo-input="library"'));
    assert.ok(camera);
    assert.ok(library);
    assert.match(camera, /capture="environment"/);
    assert.doesNotMatch(camera, /\bmultiple\b/);
    assert.doesNotMatch(library, /\bcapture\b/);
    assert.match(library, /\bmultiple\b/);
  });

  it("drops a stale composer read the same way Add card does", () => {
    const hook = read("components/use-post-photos.ts");
    const remove = hook.slice(hook.indexOf("const removePhoto"), hook.indexOf("const addFiles"));
    const batch = hook.slice(hook.indexOf("const addFiles"));
    assert.match(hook, /readFile\(file, 960\)/);
    assert.match(hook, /readPhotoFile/);
    assert.doesNotMatch(remove, /photoReadId/);
    assert.match(batch, /const requestId = \+\+photoReadId\.current/);
    assert.match(batch, /if \(photoReadId\.current !== requestId\) return;/);
    assert.match(batch, /if \(photoReadId\.current === requestId\) setReadingPhoto\(false\)/);

    const compose = read("components/compose-view.tsx");
    assert.match(compose, /usePostPhotos\(/);
    assert.match(compose, /libraryMultiple/);
    assert.match(compose, /PhotoFileInputs/);
    assert.doesNotMatch(compose, /setAttribute\("capture"/);
    const feed = read("components/feed-view.tsx");
    assert.match(feed, /usePostPhotos\(/);
    assert.match(feed, /useState\(\(\) => takeComposePrefill\(\)\)/);
    assert.match(feed, /takeCompose\(\)/);
    assert.doesNotMatch(feed, /replaceAll\(\[captured\]\)/);
    const prefill = feed.slice(
      feed.indexOf("function takeComposePrefill"),
      feed.indexOf("export function FeedView"),
    );
    assert.match(prefill, /try \{/);

    const lightbox = read("components/image-lightbox.tsx");
    assert.match(lightbox, /ArrowLeft/);
    assert.match(lightbox, /ArrowRight/);
    assert.match(lightbox, /activeElement/);
    assert.match(lightbox, /opener\?\.focus\(\)/);
  });

  it("gives draft remove buttons a 44px target and steps through a multi-photo lightbox", () => {
    const drafts = renderToStaticMarkup(
      createElement(ComposePhotoDrafts, {
        images: ["data:image/jpeg;base64,abc"],
        onRemove: () => undefined,
      }),
    );
    assert.match(drafts, /aria-label="Remove photo 1"/);
    assert.match(drafts, /h-11 w-11/);
    assert.match(drafts, /min-h-11 min-w-11/);

    const nav = renderToStaticMarkup(
      createElement(LightboxNav, {
        count: 3,
        index: 1,
        onPrev: () => undefined,
        onNext: () => undefined,
      }),
    );
    assert.match(nav, /aria-label="Previous photo"/);
    assert.match(nav, /aria-label="Next photo"/);
    assert.match(nav, /h-11 w-11/);
    assert.equal(
      renderToStaticMarkup(
        createElement(LightboxNav, {
          count: 1,
          index: 0,
          onPrev: () => undefined,
          onNext: () => undefined,
        }),
      ),
      "",
    );
    const atStart = renderToStaticMarkup(
      createElement(LightboxNav, {
        count: 2,
        index: 0,
        onPrev: () => undefined,
        onNext: () => undefined,
      }),
    );
    assert.match(atStart, /aria-label="Previous photo" disabled/);
    assert.doesNotMatch(atStart, /aria-label="Next photo" disabled/);
  });
});
