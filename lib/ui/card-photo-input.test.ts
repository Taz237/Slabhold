import assert from "node:assert/strict";
import { createElement } from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { CardPhotoField } from "@/components/card-photo-field";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import {
  isAcceptedPhoto,
  PHOTO_ACCEPT,
  PHOTO_READ_ERROR,
  PHOTO_TYPE_ERROR,
  readPhotoFile,
} from "@/lib/photos";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

function fileInputs(source: string): string[] {
  return [...source.matchAll(/<input\b[^>]*type="file"[^>]*>/g)].map((match) => match[0]);
}

const ref = { current: null };

function field(props: { photo: string | null; photoError: string | null }) {
  return renderToStaticMarkup(
    createElement(CardPhotoField, {
      ...props,
      scanning: false,
      onTake: () => undefined,
      onLibrary: () => undefined,
      onRemove: () => undefined,
      onRetry: () => undefined,
      cameraRef: ref,
      libraryRef: ref,
      onPick: () => undefined,
    }),
  );
}

describe("photo file inputs", () => {
  it("puts capture only on the camera input", () => {
    const html = renderToStaticMarkup(
      createElement(PhotoFileInputs, {
        cameraRef: ref,
        libraryRef: ref,
        onPick: () => undefined,
      }),
    );
    const inputs = fileInputs(html);
    assert.equal(inputs.length, 2);
    const camera = inputs.find((input) => input.includes('data-photo-input="camera"'));
    const library = inputs.find((input) => input.includes('data-photo-input="library"'));
    assert.ok(camera);
    assert.ok(library);
    assert.match(camera, /capture="environment"/);
    assert.match(camera, /accept="image\/\*/);
    assert.match(camera, /\.heic/);
    assert.doesNotMatch(library, /\bcapture\b/);
    assert.match(library, /accept="image\/\*/);
    assert.match(library, /\.heic/);
    assert.match(library, /\.heif/);
    assert.equal(PHOTO_ACCEPT.includes("image/*"), true);

    const libraryOnly = renderToStaticMarkup(
      createElement(PhotoFileInputs, {
        libraryRef: ref,
        onPick: () => undefined,
      }),
    );
    const lone = fileInputs(libraryOnly);
    assert.equal(lone.length, 1);
    assert.equal(lone[0].includes('data-photo-input="library"'), true);
    assert.doesNotMatch(lone[0], /\bcapture\b/);
  });

  it("does not set capture on any other file input", () => {
    const roots = ["app", "components"].map((dir) => join(process.cwd(), dir));
    const flagged: string[] = [];
    for (const file of roots.flatMap(walk)) {
      const source = readFileSync(file, "utf8");
      if (/setAttribute\(\s*["']capture["']/.test(source)) flagged.push(file);
      for (const input of fileInputs(source)) {
        if (/\bcapture\b/.test(input)) flagged.push(file);
      }
    }
    assert.deepEqual(
      [...new Set(flagged)].map((file) => file.slice(process.cwd().length + 1)),
      ["components/photo-file-inputs.tsx"],
    );
    const camera = fileInputs(read("components/photo-file-inputs.tsx")).find((input) =>
      input.includes('data-photo-input="camera"'),
    );
    assert.match(camera ?? "", /capture="environment"/);
    assert.doesNotMatch(read("components/mail-day-form.tsx"), /capture=/);
    assert.doesNotMatch(read("components/mail-day-form.tsx"), /PhotoFileInputs/);
  });
});

describe("add card photo controls", () => {
  const form = read("components/card-form.tsx");
  const photoField = read("components/card-photo-field.tsx");

  it("offers take photo and the library, and the empty box opens the library", () => {
    const html = field({ photo: null, photoError: null });
    assert.match(html, />Take photo</);
    assert.match(html, />Choose from library</);
    assert.match(html, />Upload photo</);
    assert.match(html, /aria-label="Choose a photo"/);
    assert.match(html, /min-h-11/);
    assert.doesNotMatch(html, />Retake</);
    assert.doesNotMatch(html, />Camera \/ upload</);
    const inputs = fileInputs(html);
    const library = inputs.find((input) => input.includes('data-photo-input="library"'));
    const camera = inputs.find((input) => input.includes('data-photo-input="camera"'));
    assert.ok(library);
    assert.doesNotMatch(library, /\bcapture\b/);
    assert.match(camera ?? "", /capture="environment"/);

    assert.match(photoField, /onClick=\{onLibrary\}[\s\S]{0,120}aria-label="Choose a photo"/);
    assert.match(form, /onLibrary=\{openLibrary\}/);
    assert.match(form, /onTake=\{openCamera\}/);
    assert.match(form, /readPhotoFile\(file\)/);
    assert.doesNotMatch(form, /capture=/);
    assert.doesNotMatch(form, /Camera \/ upload/);
  });

  it("shows retake, replace, and remove after a photo is chosen", () => {
    const html = field({ photo: "data:image/jpeg;base64,YQ==", photoError: null });
    assert.match(html, /alt="Card"/);
    assert.match(html, />Retake</);
    assert.match(html, />Choose another</);
    assert.match(html, />Replace</);
    assert.match(html, />Remove</);
    assert.doesNotMatch(html, />Take photo</);
    assert.doesNotMatch(html, /aria-label="Choose a photo"/);
  });

  it("shows a photo read error with a retry", () => {
    const html = field({ photo: null, photoError: PHOTO_READ_ERROR });
    assert.match(html, /role="alert"/);
    assert.match(html, /read that photo/);
    assert.match(html, />Try again</);
    assert.match(html, /min-h-11/);
    assert.match(form, /onRetry=\{retryPhoto\}/);
    assert.match(form, /setPhotoError\(/);
    assert.doesNotMatch(
      form.slice(form.indexOf("catch (error)"), form.indexOf("setPhoto(dataUrl)")),
      /setPhoto\(null\)/,
    );
  });
});

describe("other photo pickers", () => {
  it("keeps library picks off the camera input", () => {
    const compose = read("components/compose-view.tsx");
    const feed = read("components/feed-view.tsx");
    const profile = read("components/profile-edit-sheet.tsx");
    const scan = read("components/scan-view.tsx");
    for (const source of [compose, feed, profile, scan]) {
      assert.doesNotMatch(source, /capture=/);
      assert.doesNotMatch(source, /setAttribute\(\s*["']capture["']/);
      assert.match(source, /readPhotoFile\(/);
      assert.match(source, /PhotoFileInputs/);
    }
    assert.match(compose, /cameraRef=\{cameraRef\}/);
    assert.match(compose, /libraryRef=\{libraryRef\}/);
    assert.match(compose, /onClick=\{openLibrary\}/);
    assert.doesNotMatch(feed, /cameraRef/);
    assert.match(feed, /libraryRef=\{libraryRef\}/);
    assert.doesNotMatch(profile, /cameraRef/);
    assert.match(profile, /libraryRef=\{avatarInput\}/);
    assert.match(profile, /libraryRef=\{coverInput\}/);
    assert.match(scan, /cameraRef=\{cameraRef\}/);
    assert.match(scan, /onClick=\{openLibrary\}/);
  });
});

describe("accepted photo files", () => {
  it("accepts HEIC and HEIF, including phones that omit the MIME type", () => {
    assert.equal(isAcceptedPhoto({ type: "image/jpeg", name: "card.jpg" }), true);
    assert.equal(isAcceptedPhoto({ type: "image/png", name: "card.png" }), true);
    assert.equal(isAcceptedPhoto({ type: "image/webp", name: "card.webp" }), true);
    assert.equal(isAcceptedPhoto({ type: "image/heic", name: "IMG_0001.HEIC" }), true);
    assert.equal(isAcceptedPhoto({ type: "image/heif", name: "card.heif" }), true);
    assert.equal(isAcceptedPhoto({ type: "", name: "IMG_0001.HEIC" }), true);
    assert.equal(isAcceptedPhoto({ type: "application/octet-stream", name: "card.heif" }), true);
    assert.equal(isAcceptedPhoto({ type: "", name: "notes.txt" }), false);
    assert.equal(isAcceptedPhoto({ type: "application/pdf", name: "card.pdf" }), false);
  });

  it("rejects a file the browser cannot compress instead of failing quietly", async () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], "notes.pdf", { type: "application/pdf" });
    await assert.rejects(readPhotoFile(pdf), new RegExp(PHOTO_TYPE_ERROR.replace(/[.]/g, "\\.")));

    const heic = new File([new Uint8Array([1, 2, 3])], "IMG_0001.HEIC", { type: "" });
    await assert.rejects(readPhotoFile(heic), new RegExp(PHOTO_READ_ERROR.replace(/[.]/g, "\\.")));
    assert.match(read("lib/photos.ts"), /strict: true/);
    assert.match(read("lib/storage.ts"), /strict\?: boolean/);
  });
});
