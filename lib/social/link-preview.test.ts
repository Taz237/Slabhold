import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cardLinkPreview,
  postLinkPreview,
  postPreviewImage,
  previewMetadata,
  profileLinkPreview,
} from "./link-preview";

const SECRET = "Victor Secret";
const VALUE = "$9,999";
const PHOTO = "https://cdn.example/private.jpg";

describe("card link previews", () => {
  it("shows the name, photo, and value of a public card", () => {
    const preview = cardLinkPreview({
      isPublic: true,
      name: "2023 Prizm Victor Wembanyama #136 PSA 10",
      imageUrl: "https://cdn.example/wemby.jpg",
      valueLabel: "$185",
    });
    assert.equal(preview.title, "2023 Prizm Victor Wembanyama #136 PSA 10");
    assert.match(preview.description, /\$185/);
    assert.equal(preview.imageUrl, "https://cdn.example/wemby.jpg");
    assert.equal(preview.detail, "$185");
  });

  it("drops the name, photo, and value when the card is private", () => {
    const preview = cardLinkPreview({
      isPublic: false,
      name: SECRET,
      imageUrl: PHOTO,
      valueLabel: VALUE,
    });
    const packed = JSON.stringify(preview);
    assert.equal(packed.includes(SECRET), false);
    assert.equal(packed.includes(VALUE), false);
    assert.equal(packed.includes("private.jpg"), false);
    assert.equal(preview.imageUrl, null);
    assert.equal(preview.detail, "");
    assert.equal(preview.title, "Private card");
  });

  it("rejects non-https images", () => {
    const preview = cardLinkPreview({
      isPublic: true,
      name: "Card",
      imageUrl: "http://cdn.example/card.jpg",
      valueLabel: "$10",
    });
    assert.equal(preview.imageUrl, null);
  });
});

describe("profile link previews", () => {
  it("shows the username and the public collection size", () => {
    const preview = profileLinkPreview({
      found: true,
      username: "donnietaz",
      displayName: "DonnieTaz",
      publicCardCount: 12,
    });
    assert.equal(preview.title, "DonnieTaz");
    assert.equal(preview.description, "@donnietaz · 12 cards");
    assert.equal(preview.detail, "12 cards");
  });

  it("omits a size when the public count was not loaded", () => {
    const preview = profileLinkPreview({
      found: true,
      username: "donnietaz",
      displayName: "DonnieTaz",
      publicCardCount: null,
    });
    assert.equal(preview.description.includes("card"), false);
    assert.equal(preview.detail, "");
  });

  it("does not invent a profile when the username is missing", () => {
    const preview = profileLinkPreview({ found: false, publicCardCount: 40 });
    assert.equal(preview.title, "Profile");
    assert.equal(preview.detail, "");
    assert.equal(JSON.stringify(preview).includes("40"), false);
  });
});

describe("post link previews", () => {
  it("uses the post text", () => {
    const preview = postLinkPreview({
      found: true,
      body: "Raw Wemby Prizm still feels like the hold.",
      imageUrl: "https://cdn.example/post.jpg",
    });
    assert.equal(preview.title, "Raw Wemby Prizm still feels like the hold.");
    assert.equal(preview.description, preview.title);
    assert.equal(preview.imageUrl, "https://cdn.example/post.jpg");
  });

  it("does not use a private card photo when the post has no image", () => {
    const image = postPreviewImage({
      postImageUrl: null,
      cardImageUrl: PHOTO,
      cardIsPublic: false,
    });
    assert.equal(image, null);
    const preview = postLinkPreview({
      found: true,
      body: "Looking at this one.",
      imageUrl: image,
    });
    assert.equal(preview.imageUrl, null);
    assert.equal(JSON.stringify(preview).includes(VALUE), false);
  });

  it("can use a public card photo when the post has no image", () => {
    const image = postPreviewImage({
      postImageUrl: null,
      cardImageUrl: "https://cdn.example/public.jpg",
      cardIsPublic: true,
    });
    assert.equal(image, "https://cdn.example/public.jpg");
  });
});

describe("preview metadata", () => {
  it("puts the public title and description on Open Graph and Twitter", () => {
    const meta = previewMetadata(
      cardLinkPreview({
        isPublic: true,
        name: "Jordan Love",
        valueLabel: "$40",
      }),
    );
    assert.equal(meta.openGraph.title, "Jordan Love");
    assert.match(meta.openGraph.description, /\$40/);
    assert.equal(meta.twitter.card, "summary_large_image");
  });
});
